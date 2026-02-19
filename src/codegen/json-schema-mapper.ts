import type { XsdElement, XsdComplexType, XsdSimpleType, XsdAttribute } from '../types/xsd-types';
import type { TypeRegistry } from '../parser/type-registry';
import { getLocalName } from '../parser/xml-parser';

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

const XSD_PRIMITIVE_MAP: Record<string, Partial<JsonSchema>> = {
  string: { type: 'string' },
  int: { type: 'integer' },
  integer: { type: 'integer' },
  long: { type: 'integer' },
  short: { type: 'integer' },
  byte: { type: 'integer' },
  decimal: { type: 'number' },
  float: { type: 'number' },
  double: { type: 'number' },
  boolean: { type: 'boolean' },
  date: { type: 'string', format: 'date', description: 'Date (YYYY-MM-DD)' },
  dateTime: { type: 'string', format: 'date-time', description: 'Datetime (ISO 8601)' },
  time: { type: 'string', format: 'time', description: 'Time (HH:MM:SS)' },
  anyURI: { type: 'string', format: 'uri' },
  token: { type: 'string' },
  normalizedString: { type: 'string' },
  positiveInteger: { type: 'integer', minimum: 1 },
  nonNegativeInteger: { type: 'integer', minimum: 0 },
  unsignedInt: { type: 'integer', minimum: 0 },
  unsignedLong: { type: 'integer', minimum: 0 },
  unsignedShort: { type: 'integer', minimum: 0 },
  base64Binary: { type: 'string', contentEncoding: 'base64' } as any,
  hexBinary: { type: 'string' },
};

export function elementToJsonSchema(element: XsdElement, registry: TypeRegistry): JsonSchema {
  let schema = typeRefToJsonSchema(element, registry);

  const isArray = element.maxOccurs === 'unbounded' || (typeof element.maxOccurs === 'number' && element.maxOccurs > 1);
  
  if (isArray) {
    schema = {
      type: 'array',
      items: schema
    };
  }

  // Handle optionality at the property level in the parent object (required array), 
  // but for the schema object itself, we can't easily mark "optional" unless it's null.
  // JSON Schema validation handles 'required' in the parent.

  if (element.defaultValue !== undefined) {
    schema.default = coerceDefault(element);
  }

  const desc = element.documentation || formatFieldDescription(element.name);
  schema.description = desc;

  return schema;
}

function typeRefToJsonSchema(element: XsdElement, registry: TypeRegistry): JsonSchema {
  if (element.complexType) {
    return complexTypeToJsonSchema(element.complexType, registry);
  }

  if (element.simpleType) {
    return simpleTypeToJsonSchema(element.simpleType);
  }

  if (element.type) {
    const localType = getLocalName(element.type);

    if (XSD_PRIMITIVE_MAP[localType]) {
      return { ...XSD_PRIMITIVE_MAP[localType] };
    }

    const ct = registry.resolveComplexType(localType);
    if (ct) return complexTypeToJsonSchema(ct, registry);

    const st = registry.resolveSimpleType(localType);
    if (st) return simpleTypeToJsonSchema(st);

    return {}; // Unknown type
  }

  return { type: 'string' };
}

export function complexTypeToJsonSchema(ct: XsdComplexType, registry: TypeRegistry): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  const addElement = (el: XsdElement) => {
    properties[el.name] = elementToJsonSchema(el, registry);
    if (el.minOccurs !== 0) {
      required.push(el.name);
    }
  };

  const addAttribute = (attr: XsdAttribute) => {
    properties[attr.name] = attributeToJsonSchema(attr, registry);
    if (attr.use === 'required') {
      required.push(attr.name);
    }
  };

  // Add elements from extension base type
  if (ct.extension) {
    const baseCt = registry.resolveComplexType(ct.extension.base);
    if (baseCt) {
      for (const el of baseCt.elements) addElement(el);
    }
    for (const el of ct.extension.elements) addElement(el);
    for (const attr of ct.extension.attributes) addAttribute(attr);
  }

  for (const el of ct.elements) addElement(el);
  for (const attr of ct.attributes) addAttribute(attr);

  const schema: JsonSchema = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    schema.required = required;
  }
  
  // If no properties, allow anything? Or just empty object?
  // Zod implementation returned z.object({}) which allows unknown keys to be stripped or fail depending on config.
  // JSON Schema by default allows additional properties.

  return schema;
}

function attributeToJsonSchema(attr: XsdAttribute, registry: TypeRegistry): JsonSchema {
  let schema: JsonSchema;

  if (attr.simpleType) {
    schema = simpleTypeToJsonSchema(attr.simpleType);
  } else if (attr.type) {
    const localType = getLocalName(attr.type);
    if (XSD_PRIMITIVE_MAP[localType]) {
      schema = { ...XSD_PRIMITIVE_MAP[localType] };
    } else {
      const st = registry.resolveSimpleType(localType);
      schema = st ? simpleTypeToJsonSchema(st) : { type: 'string' };
    }
  } else {
    schema = { type: 'string' };
  }

  if (attr.defaultValue !== undefined) {
    schema.default = attr.defaultValue;
  }

  schema.description = formatFieldDescription(attr.name);

  return schema;
}

export function simpleTypeToJsonSchema(st: XsdSimpleType): JsonSchema {
  if (!st.restriction) return { type: 'string' };

  const r = st.restriction;

  if (r.enumerations.length > 0) {
    return { enum: r.enumerations };
  }

  const baseLocalName = getLocalName(r.base);
  const baseSchema = XSD_PRIMITIVE_MAP[baseLocalName] || { type: 'string' };
  const schema: JsonSchema = { ...baseSchema };

  if (schema.type === 'string') {
    if (r.length !== undefined) schema.minLength = schema.maxLength = r.length;
    if (r.minLength !== undefined) schema.minLength = r.minLength;
    if (r.maxLength !== undefined) schema.maxLength = r.maxLength;
    if (r.pattern) schema.pattern = r.pattern;
  }
  
  if (schema.type === 'number' || schema.type === 'integer') {
    if (r.minInclusive !== undefined) schema.minimum = r.minInclusive;
    if (r.maxInclusive !== undefined) schema.maximum = r.maxInclusive;
  }

  return schema;
}

function coerceDefault(element: XsdElement): string | number | boolean {
  const val = element.defaultValue!;
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  return val;
}

function formatFieldDescription(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
}

export function getInputSchema(
  element: XsdElement,
  registry: TypeRegistry,
): JsonSchema {
  // The input schema for a tool is usually an object where keys are arguments.
  // element is the input message part. 
  
  const type = registry.getElementType(element);
  if (!type) return { type: 'object', properties: {} };

  if ('elements' in type) {
    const ct = type as XsdComplexType;
    return complexTypeToJsonSchema(ct, registry);
  }
  
  // If it's a simple type, it might be wrapped?
  // In WSDL doc/literal wrapped, the input message has one part referring to an element
  // which is a complex type containing the parameters.
  
  return elementToJsonSchema(element, registry);
}
