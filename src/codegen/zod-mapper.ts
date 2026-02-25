import type { XsdElement, XsdComplexType, XsdSimpleType, XsdAttribute } from '../types/xsd-types';
import type { TypeRegistry } from '../parser/type-registry';
import { getLocalName } from '../parser/xml-parser';

const XSD_PRIMITIVE_MAP: Record<string, string> = {
  string: 'z.string()',
  int: 'z.number()',
  integer: 'z.number()',
  long: 'z.number()',
  short: 'z.number()',
  byte: 'z.number()',
  decimal: 'z.number()',
  float: 'z.number()',
  double: 'z.number()',
  boolean: 'z.boolean()',
  date: "z.string().describe('Date (YYYY-MM-DD)')",
  dateTime: "z.string().describe('Datetime (ISO 8601)')",
  time: "z.string().describe('Time (HH:MM:SS)')",
  anyURI: 'z.string()',
  token: 'z.string()',
  normalizedString: 'z.string()',
  positiveInteger: 'z.number().int().positive()',
  nonNegativeInteger: 'z.number().int().nonnegative()',
  unsignedInt: 'z.number().int().nonnegative()',
  unsignedLong: 'z.number().int().nonnegative()',
  unsignedShort: 'z.number().int().nonnegative()',
  base64Binary: 'z.string()',
  hexBinary: 'z.string()',
};

export function elementToZod(element: XsdElement, registry: TypeRegistry, indent = 2): string {
  let schema = typeRefToZod(element, registry, indent);

  if (element.maxOccurs === 'unbounded' || (typeof element.maxOccurs === 'number' && element.maxOccurs > 1)) {
    schema = `z.array(${schema})`;
  }

  if (element.minOccurs === 0) {
    schema += '.optional()';
  }

  if (element.defaultValue !== undefined) {
    schema += `.default(${JSON.stringify(coerceDefault(element))})`;
  }

  const desc = element.documentation || formatFieldDescription(element.name);
  schema += `.describe(${JSON.stringify(desc)})`;

  return schema;
}

function typeRefToZod(element: XsdElement, registry: TypeRegistry, indent: number): string {
  if (element.complexType) {
    return complexTypeToZod(element.complexType, registry, indent);
  }

  if (element.simpleType) {
    return simpleTypeToZod(element.simpleType);
  }

  if (element.type) {
    const localType = getLocalName(element.type);

    if (XSD_PRIMITIVE_MAP[localType]) {
      return XSD_PRIMITIVE_MAP[localType];
    }

    const ct = registry.resolveComplexType(localType);
    if (ct) return complexTypeToZod(ct, registry, indent);

    const st = registry.resolveSimpleType(localType);
    if (st) return simpleTypeToZod(st);

    return 'z.unknown()';
  }

  return 'z.string()';
}

export function complexTypeToZod(ct: XsdComplexType, registry: TypeRegistry, indent = 2): string {
  const pad = ' '.repeat(indent);
  const innerPad = ' '.repeat(indent + 2);

  const fields: string[] = [];

  // Add elements from extension base type
  if (ct.extension) {
    const baseCt = registry.resolveComplexType(ct.extension.base);
    if (baseCt) {
      for (const el of baseCt.elements) {
        fields.push(`${innerPad}${el.name}: ${elementToZod(el, registry, indent + 2)},`);
      }
    }
    for (const el of ct.extension.elements) {
      fields.push(`${innerPad}${el.name}: ${elementToZod(el, registry, indent + 2)},`);
    }
    for (const attr of ct.extension.attributes) {
      fields.push(`${innerPad}${attr.name}: ${attributeToZod(attr, registry)},`);
    }
  }

  for (const el of ct.elements) {
    fields.push(`${innerPad}${el.name}: ${elementToZod(el, registry, indent + 2)},`);
  }

  for (const attr of ct.attributes) {
    fields.push(`${innerPad}${attr.name}: ${attributeToZod(attr, registry)},`);
  }

  if (fields.length === 0) return 'z.object({})';

  return `z.object({\n${fields.join('\n')}\n${pad}})`;
}

function attributeToZod(attr: XsdAttribute, registry: TypeRegistry): string {
  let schema: string;

  if (attr.simpleType) {
    schema = simpleTypeToZod(attr.simpleType);
  } else if (attr.type) {
    const localType = getLocalName(attr.type);
    if (XSD_PRIMITIVE_MAP[localType]) {
      schema = XSD_PRIMITIVE_MAP[localType];
    } else {
      const st = registry.resolveSimpleType(localType);
      schema = st ? simpleTypeToZod(st) : 'z.string()';
    }
  } else {
    schema = 'z.string()';
  }

  if (attr.use === 'optional') {
    schema += '.optional()';
  }

  if (attr.defaultValue !== undefined) {
    schema += `.default(${JSON.stringify(coerceDefaultValue(attr.defaultValue))})`;
  }

  schema += `.describe(${JSON.stringify(formatFieldDescription(attr.name))})`;

  return schema;
}

export function simpleTypeToZod(st: XsdSimpleType): string {
  if (!st.restriction) return 'z.string()';

  const r = st.restriction;

  if (r.enumerations.length > 0) {
    const vals = r.enumerations.map(v => JSON.stringify(v)).join(', ');
    return `z.enum([${vals}])`;
  }

  const baseZod = XSD_PRIMITIVE_MAP[r.base] || 'z.string()';
  let schema = baseZod;

  if (r.length !== undefined && schema.startsWith('z.string()')) {
    schema = `z.string().length(${r.length})`;
  } else {
    if (r.minLength !== undefined && schema.startsWith('z.string()')) {
      schema = `z.string().min(${r.minLength})`;
    }
    if (r.maxLength !== undefined) {
      schema += `.max(${r.maxLength})`;
    }
  }

  if (r.pattern) {
    schema += `.regex(/${r.pattern}/)`;
  }

  if (r.minInclusive !== undefined && schema.includes('z.number()')) {
    schema += `.min(${r.minInclusive})`;
  }
  if (r.maxInclusive !== undefined && schema.includes('z.number()')) {
    schema += `.max(${r.maxInclusive})`;
  }

  return schema;
}

function coerceDefaultValue(val: string): string | number | boolean {
  if (val === 'true') return true;
  if (val === 'false') return false;
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  return val;
}

function coerceDefault(element: XsdElement): string | number | boolean {
  return coerceDefaultValue(element.defaultValue!);
}

function formatFieldDescription(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
}

export function getInputSchemaFields(
  element: XsdElement,
  registry: TypeRegistry,
): { name: string; zodStr: string }[] {
  const fields: { name: string; zodStr: string }[] = [];

  const type = registry.getElementType(element);
  if (!type) return fields;

  if ('elements' in type) {
    const ct = type as XsdComplexType;

    if (ct.extension) {
      const baseCt = registry.resolveComplexType(ct.extension.base);
      if (baseCt) {
        for (const el of baseCt.elements) {
          fields.push({ name: el.name, zodStr: elementToZod(el, registry, 4) });
        }
      }
      for (const el of ct.extension.elements) {
        fields.push({ name: el.name, zodStr: elementToZod(el, registry, 4) });
      }
      for (const attr of ct.extension.attributes) {
        fields.push({ name: attr.name, zodStr: attributeToZod(attr, registry) });
      }
    }

    for (const el of ct.elements) {
      fields.push({ name: el.name, zodStr: elementToZod(el, registry, 4) });
    }

    for (const attr of ct.attributes) {
      fields.push({ name: attr.name, zodStr: attributeToZod(attr, registry) });
    }
  }

  return fields;
}
