import type { XsdElement, XsdComplexType, XsdSimpleType, XsdAttribute } from '../types/xsd-types';
import type { TypeRegistry } from '../parser/type-registry';
import { getLocalName } from '../parser/xml-parser';

/**
 * Generates realistic sample values from XSD type definitions.
 * Used by test generators to create valid and boundary test inputs.
 */

const SAMPLE_STRINGS: Record<string, string> = {
  default: 'SampleValue',
  name: 'John Doe',
  email: 'test@example.com',
  phone: '+1-555-0100',
  address: '123 Main St',
  city: 'Springfield',
  country: 'US',
  code: 'ABC123',
  id: '12345',
  date: '2026-01-15',
  dateTime: '2026-01-15T10:30:00Z',
  time: '10:30:00',
  uri: 'https://example.com',
  url: 'https://example.com',
};

function guessSampleString(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  for (const [hint, value] of Object.entries(SAMPLE_STRINGS)) {
    if (lower.includes(hint)) return value;
  }
  return SAMPLE_STRINGS.default;
}

export interface SampleValue {
  value: unknown;
  xmlValue: string;
  jsonValue: unknown;
}

export function sampleValueForElement(
  element: XsdElement,
  registry: TypeRegistry,
  depth = 0,
): SampleValue {
  if (depth > 5) {
    return { value: '...', xmlValue: '...', jsonValue: '...' };
  }

  if (element.complexType) {
    return sampleValueForComplexType(element.complexType, element.name, registry, depth);
  }

  if (element.simpleType) {
    return sampleValueForSimpleType(element.simpleType, element.name);
  }

  if (element.type) {
    const localType = getLocalName(element.type);
    return sampleValueForTypeName(localType, element.name, registry, depth);
  }

  const str = guessSampleString(element.name);
  return { value: str, xmlValue: str, jsonValue: str };
}

export function sampleValueForTypeName(
  typeName: string,
  fieldName: string,
  registry: TypeRegistry,
  depth = 0,
): SampleValue {
  // Check primitives
  const prim = primitiveToSample(typeName, fieldName);
  if (prim) return prim;

  // Check complex types
  const ct = registry.resolveComplexType(typeName);
  if (ct) return sampleValueForComplexType(ct, fieldName, registry, depth);

  // Check simple types
  const st = registry.resolveSimpleType(typeName);
  if (st) return sampleValueForSimpleType(st, fieldName);

  const str = guessSampleString(fieldName);
  return { value: str, xmlValue: str, jsonValue: str };
}

function primitiveToSample(typeName: string, fieldName: string): SampleValue | null {
  switch (typeName) {
    case 'string':
    case 'token':
    case 'normalizedString': {
      const str = guessSampleString(fieldName);
      return { value: str, xmlValue: str, jsonValue: str };
    }
    case 'int':
    case 'integer':
    case 'long':
    case 'short':
    case 'byte':
      return { value: 1, xmlValue: '1', jsonValue: 1 };
    case 'positiveInteger':
      return { value: 1, xmlValue: '1', jsonValue: 1 };
    case 'nonNegativeInteger':
    case 'unsignedInt':
    case 'unsignedLong':
    case 'unsignedShort':
      return { value: 0, xmlValue: '0', jsonValue: 0 };
    case 'decimal':
    case 'float':
    case 'double':
      return { value: 1.5, xmlValue: '1.5', jsonValue: 1.5 };
    case 'boolean':
      return { value: true, xmlValue: 'true', jsonValue: true };
    case 'date':
      return { value: '2026-01-15', xmlValue: '2026-01-15', jsonValue: '2026-01-15' };
    case 'dateTime':
      return { value: '2026-01-15T10:30:00Z', xmlValue: '2026-01-15T10:30:00Z', jsonValue: '2026-01-15T10:30:00Z' };
    case 'time':
      return { value: '10:30:00', xmlValue: '10:30:00', jsonValue: '10:30:00' };
    case 'anyURI':
      return { value: 'https://example.com', xmlValue: 'https://example.com', jsonValue: 'https://example.com' };
    case 'base64Binary':
      return { value: 'dGVzdA==', xmlValue: 'dGVzdA==', jsonValue: 'dGVzdA==' };
    case 'hexBinary':
      return { value: '48656C6C6F', xmlValue: '48656C6C6F', jsonValue: '48656C6C6F' };
    default:
      return null;
  }
}

export function sampleValueForSimpleType(
  st: XsdSimpleType,
  fieldName: string,
): SampleValue {
  if (!st.restriction) {
    const str = guessSampleString(fieldName);
    return { value: str, xmlValue: str, jsonValue: str };
  }

  const r = st.restriction;

  // Enumerations: pick the first value
  if (r.enumerations.length > 0) {
    const val = r.enumerations[0];
    return { value: val, xmlValue: val, jsonValue: val };
  }

  // Use base type, respecting constraints
  const baseSample = primitiveToSample(r.base, fieldName);
  if (!baseSample) {
    const str = guessSampleString(fieldName);
    return { value: str, xmlValue: str, jsonValue: str };
  }

  // Apply string constraints
  if (typeof baseSample.value === 'string') {
    let str = baseSample.value as string;
    if (r.minLength !== undefined && str.length < r.minLength) {
      str = str.padEnd(r.minLength, 'x');
    }
    if (r.maxLength !== undefined && str.length > r.maxLength) {
      str = str.substring(0, r.maxLength);
    }
    if (r.length !== undefined) {
      str = str.substring(0, r.length).padEnd(r.length, 'x');
    }
    return { value: str, xmlValue: str, jsonValue: str };
  }

  // Apply numeric constraints
  if (typeof baseSample.value === 'number') {
    let num = baseSample.value as number;
    if (r.minInclusive !== undefined && num < r.minInclusive) num = r.minInclusive;
    if (r.maxInclusive !== undefined && num > r.maxInclusive) num = r.maxInclusive;
    return { value: num, xmlValue: String(num), jsonValue: num };
  }

  return baseSample;
}

export function sampleValueForComplexType(
  ct: XsdComplexType,
  _fieldName: string,
  registry: TypeRegistry,
  depth = 0,
): SampleValue {
  const jsonObj: Record<string, unknown> = {};
  const xmlParts: string[] = [];

  const processElement = (el: XsdElement) => {
    const sample = sampleValueForElement(el, registry, depth + 1);
    jsonObj[el.name] = sample.jsonValue;
    xmlParts.push(`<${el.name}>${sample.xmlValue}</${el.name}>`);
  };

  const processAttribute = (attr: XsdAttribute) => {
    const sample = sampleValueForAttribute(attr, registry);
    jsonObj[attr.name] = sample.jsonValue;
  };

  if (ct.extension) {
    const baseCt = registry.resolveComplexType(ct.extension.base);
    if (baseCt) {
      for (const el of baseCt.elements) processElement(el);
    }
    for (const el of ct.extension.elements) processElement(el);
    for (const attr of ct.extension.attributes) processAttribute(attr);
  }

  for (const el of ct.elements) processElement(el);
  for (const attr of ct.attributes) processAttribute(attr);

  return {
    value: jsonObj,
    xmlValue: xmlParts.join('\n'),
    jsonValue: jsonObj,
  };
}

function sampleValueForAttribute(
  attr: XsdAttribute,
  registry: TypeRegistry,
): SampleValue {
  if (attr.simpleType) {
    return sampleValueForSimpleType(attr.simpleType, attr.name);
  }
  if (attr.type) {
    const localType = getLocalName(attr.type);
    return sampleValueForTypeName(localType, attr.name, registry);
  }
  const str = guessSampleString(attr.name);
  return { value: str, xmlValue: str, jsonValue: str };
}

/**
 * Builds a complete SOAP envelope XML string for an operation.
 */
export function buildSampleSoapEnvelope(
  operationName: string,
  namespace: string,
  element: XsdElement | undefined,
  registry: TypeRegistry,
  soapVersion: '1.1' | '1.2',
  omitField?: string,
  overrideFieldValue?: { field: string; value: string },
): string {
  const soapNs = soapVersion === '1.2'
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/';

  let bodyContent: string;

  if (!element) {
    bodyContent = `      <ns:${operationName} xmlns:ns="${namespace}" />`;
  } else {
    const type = registry.getElementType(element);
    if (type && 'elements' in type) {
      const ct = type as XsdComplexType;
      const fields = collectAllElements(ct, registry);
      const fieldXml = fields
        .filter(el => omitField ? el.name !== omitField : true)
        .map(el => {
          if (overrideFieldValue && el.name === overrideFieldValue.field) {
            return `        <ns:${el.name}>${overrideFieldValue.value}</ns:${el.name}>`;
          }
          const sample = sampleValueForElement(el, registry);
          return `        <ns:${el.name}>${sample.xmlValue}</ns:${el.name}>`;
        })
        .join('\n');
      bodyContent = `      <ns:${operationName} xmlns:ns="${namespace}">\n${fieldXml}\n      </ns:${operationName}>`;
    } else {
      bodyContent = `      <ns:${operationName} xmlns:ns="${namespace}" />`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${soapNs}">
  <soap:Header/>
  <soap:Body>
${bodyContent}
  </soap:Body>
</soap:Envelope>`;
}

function collectAllElements(ct: XsdComplexType, registry: TypeRegistry): XsdElement[] {
  const elements: XsdElement[] = [];
  if (ct.extension) {
    const baseCt = registry.resolveComplexType(ct.extension.base);
    if (baseCt) {
      elements.push(...baseCt.elements);
    }
    elements.push(...ct.extension.elements);
  }
  elements.push(...ct.elements);
  return elements;
}

/**
 * Builds sample JSON params object for an operation (for MCP tool calls).
 */
export function buildSampleParams(
  element: XsdElement | undefined,
  registry: TypeRegistry,
  omitField?: string,
  overrideFieldValue?: { field: string; value: unknown },
): Record<string, unknown> {
  if (!element) return {};

  const type = registry.getElementType(element);
  if (!type || !('elements' in type)) return {};

  const ct = type as XsdComplexType;
  const fields = collectAllElements(ct, registry);
  const params: Record<string, unknown> = {};

  for (const el of fields) {
    if (omitField && el.name === omitField) continue;
    if (overrideFieldValue && el.name === overrideFieldValue.field) {
      params[el.name] = overrideFieldValue.value;
    } else {
      const sample = sampleValueForElement(el, registry);
      params[el.name] = sample.jsonValue;
    }
  }

  return params;
}

/**
 * Returns info about required fields for an operation input.
 */
export function getRequiredFields(
  element: XsdElement | undefined,
  registry: TypeRegistry,
): { name: string; type: string; hasConstraints: boolean }[] {
  if (!element) return [];

  const type = registry.getElementType(element);
  if (!type || !('elements' in type)) return [];

  const ct = type as XsdComplexType;
  const fields = collectAllElements(ct, registry);

  return fields
    .filter(el => el.minOccurs !== 0)
    .map(el => ({
      name: el.name,
      type: el.type ? getLocalName(el.type) : 'complex',
      hasConstraints: hasTypeConstraints(el, registry),
    }));
}

/**
 * Returns info about fields with constraints (for boundary tests).
 */
export function getConstrainedFields(
  element: XsdElement | undefined,
  registry: TypeRegistry,
): {
  name: string;
  typeName: string;
  minLength?: number;
  maxLength?: number;
  minInclusive?: number;
  maxInclusive?: number;
  pattern?: string;
  enumerations?: string[];
}[] {
  if (!element) return [];

  const type = registry.getElementType(element);
  if (!type || !('elements' in type)) return [];

  const ct = type as XsdComplexType;
  const fields = collectAllElements(ct, registry);
  const result: ReturnType<typeof getConstrainedFields> = [];

  for (const el of fields) {
    const info = getFieldConstraints(el, registry);
    if (info) result.push({ name: el.name, ...info });
  }

  return result;
}

function hasTypeConstraints(el: XsdElement, registry: TypeRegistry): boolean {
  return getFieldConstraints(el, registry) !== null;
}

function getFieldConstraints(
  el: XsdElement,
  registry: TypeRegistry,
): {
  typeName: string;
  minLength?: number;
  maxLength?: number;
  minInclusive?: number;
  maxInclusive?: number;
  pattern?: string;
  enumerations?: string[];
} | null {
  let st: XsdSimpleType | undefined;

  if (el.simpleType) {
    st = el.simpleType;
  } else if (el.type) {
    const localType = getLocalName(el.type);
    st = registry.resolveSimpleType(localType);
  }

  if (!st?.restriction) return null;

  const r = st.restriction;
  const hasConstraints =
    r.minLength !== undefined ||
    r.maxLength !== undefined ||
    r.length !== undefined ||
    r.minInclusive !== undefined ||
    r.maxInclusive !== undefined ||
    r.pattern !== undefined ||
    r.enumerations.length > 0;

  if (!hasConstraints) return null;

  return {
    typeName: r.base,
    minLength: r.minLength ?? r.length,
    maxLength: r.maxLength ?? r.length,
    minInclusive: r.minInclusive,
    maxInclusive: r.maxInclusive,
    pattern: r.pattern,
    enumerations: r.enumerations.length > 0 ? r.enumerations : undefined,
  };
}
