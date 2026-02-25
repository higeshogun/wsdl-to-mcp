import type { XsdSchema, XsdElement, XsdComplexType, XsdSimpleType, XsdAttribute } from '../types/xsd-types';
import { getChildElements, getFirstChildElement, getLocalName } from './xml-parser';

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';

export function parseXsdSchema(schemaEl: Element): XsdSchema {
  const targetNamespace = schemaEl.getAttribute('targetNamespace') || '';
  const elementFormDefault = (schemaEl.getAttribute('elementFormDefault') || 'unqualified') as 'qualified' | 'unqualified';
  const elements = new Map<string, XsdElement>();
  const complexTypes = new Map<string, XsdComplexType>();
  const simpleTypes = new Map<string, XsdSimpleType>();
  const globalAttributes = new Map<string, XsdAttribute>();

  for (const el of getChildElements(schemaEl, 'element', XSD_NS)) {
    const parsed = parseElement(el);
    if (parsed.name) elements.set(parsed.name, parsed);
  }

  for (const el of getChildElements(schemaEl, 'complexType', XSD_NS)) {
    const parsed = parseComplexType(el);
    if (parsed.name) complexTypes.set(parsed.name, parsed);
  }

  for (const el of getChildElements(schemaEl, 'simpleType', XSD_NS)) {
    const parsed = parseSimpleType(el);
    if (parsed.name) simpleTypes.set(parsed.name, parsed);
  }

  // Parse top-level global attribute declarations
  for (const el of getChildElements(schemaEl, 'attribute', XSD_NS)) {
    const parsed = parseAttribute(el);
    if (parsed.name) globalAttributes.set(parsed.name, parsed);
  }

  return { targetNamespace, elementFormDefault, elements, complexTypes, simpleTypes, globalAttributes };
}

export function parseElement(el: Element): XsdElement {
  const name = el.getAttribute('name') || '';
  const type = el.getAttribute('type') || undefined;
  const minStr = el.getAttribute('minOccurs');
  const maxStr = el.getAttribute('maxOccurs');
  const minOccurs = minStr !== null ? parseInt(minStr, 10) : 1;
  const maxOccurs = maxStr === 'unbounded' ? 'unbounded' as const : (maxStr !== null ? parseInt(maxStr, 10) : 1);
  const nillable = el.getAttribute('nillable') === 'true';
  const defaultValue = el.getAttribute('default') || undefined;

  let documentation: string | undefined;
  const annotationEl = getFirstChildElement(el, 'annotation', XSD_NS);
  if (annotationEl) {
    const docEl = getFirstChildElement(annotationEl, 'documentation', XSD_NS);
    if (docEl) documentation = docEl.textContent?.trim();
  }

  let complexType: XsdComplexType | undefined;
  const ctEl = getFirstChildElement(el, 'complexType', XSD_NS);
  if (ctEl) complexType = parseComplexType(ctEl);

  let simpleType: XsdSimpleType | undefined;
  const stEl = getFirstChildElement(el, 'simpleType', XSD_NS);
  if (stEl) simpleType = parseSimpleType(stEl);

  return { name, type, complexType, simpleType, minOccurs, maxOccurs, nillable, documentation, defaultValue };
}

export function parseComplexType(el: Element): XsdComplexType {
  const name = el.getAttribute('name') || undefined;
  let compositor: XsdComplexType['compositor'] = null;
  let elements: XsdElement[] = [];
  const attributes: XsdAttribute[] = [];
  let extension: XsdComplexType['extension'] = undefined;

  const seqEl = getFirstChildElement(el, 'sequence', XSD_NS);
  const allEl = getFirstChildElement(el, 'all', XSD_NS);
  const choiceEl = getFirstChildElement(el, 'choice', XSD_NS);

  const compositorEl = seqEl || allEl || choiceEl;
  if (seqEl) compositor = 'sequence';
  else if (allEl) compositor = 'all';
  else if (choiceEl) compositor = 'choice';

  if (compositorEl) {
    elements = getChildElements(compositorEl, 'element', XSD_NS).map(parseElement);
  }

  // Handle complexContent with extension
  const ccEl = getFirstChildElement(el, 'complexContent', XSD_NS);
  if (ccEl) {
    const extEl = getFirstChildElement(ccEl, 'extension', XSD_NS);
    if (extEl) {
      const base = extEl.getAttribute('base') || '';
      const extSeq = getFirstChildElement(extEl, 'sequence', XSD_NS);
      const extElements = extSeq
        ? getChildElements(extSeq, 'element', XSD_NS).map(parseElement)
        : [];
      const extAttrs = getChildElements(extEl, 'attribute', XSD_NS).map(parseAttribute);
      extension = { base, elements: extElements, attributes: extAttrs };
      if (extSeq && !compositor) {
        compositor = 'sequence';
        elements = extElements;
      }
    }
  }

  for (const attrEl of getChildElements(el, 'attribute', XSD_NS)) {
    attributes.push(parseAttribute(attrEl));
  }

  return { name, compositor, elements, attributes, extension };
}

export function parseSimpleType(el: Element): XsdSimpleType {
  const name = el.getAttribute('name') || undefined;
  const restrictionEl = getFirstChildElement(el, 'restriction', XSD_NS);

  if (!restrictionEl) return { name };

  const base = restrictionEl.getAttribute('base') || '';
  const enumerations = getChildElements(restrictionEl, 'enumeration', XSD_NS)
    .map(e => e.getAttribute('value') || '');

  const patternEl = getFirstChildElement(restrictionEl, 'pattern', XSD_NS);
  const pattern = patternEl?.getAttribute('value') || undefined;

  const minLenEl = getFirstChildElement(restrictionEl, 'minLength', XSD_NS);
  const maxLenEl = getFirstChildElement(restrictionEl, 'maxLength', XSD_NS);
  const lenEl = getFirstChildElement(restrictionEl, 'length', XSD_NS);
  const minIncEl = getFirstChildElement(restrictionEl, 'minInclusive', XSD_NS);
  const maxIncEl = getFirstChildElement(restrictionEl, 'maxInclusive', XSD_NS);

  return {
    name,
    restriction: {
      base: getLocalName(base),
      enumerations,
      pattern,
      minLength: minLenEl ? parseInt(minLenEl.getAttribute('value') || '0', 10) : undefined,
      maxLength: maxLenEl ? parseInt(maxLenEl.getAttribute('value') || '0', 10) : undefined,
      length: lenEl ? parseInt(lenEl.getAttribute('value') || '0', 10) : undefined,
      minInclusive: minIncEl ? parseFloat(minIncEl.getAttribute('value') || '0') : undefined,
      maxInclusive: maxIncEl ? parseFloat(maxIncEl.getAttribute('value') || '0') : undefined,
    },
  };
}

function parseAttribute(el: Element): XsdAttribute {
  const name = el.getAttribute('name') || '';
  const type = el.getAttribute('type') || undefined;
  const use = (el.getAttribute('use') || 'optional') as XsdAttribute['use'];
  const defaultValue = el.getAttribute('default') || undefined;
  const ref = el.getAttribute('ref') || undefined;

  let simpleType: XsdSimpleType | undefined;
  const stEl = getFirstChildElement(el, 'simpleType', XSD_NS);
  if (stEl) simpleType = parseSimpleType(stEl);

  // For ref-based attributes (e.g. ref="cq:dslRef"), capture the namespace URI
  // of the prefix so the XML attribute can be correctly namespace-qualified.
  let refNsUri: string | undefined;
  if (ref) {
    const colonIdx = ref.indexOf(':');
    if (colonIdx > 0) {
      const prefix = ref.substring(0, colonIdx);
      refNsUri = el.lookupNamespaceURI(prefix) || undefined;
    }
  }

  return { name: name || getLocalName(ref || ''), type, use, defaultValue, ref, simpleType, refNsUri };
}
