import type { XsdSchema, XsdElement, XsdComplexType, XsdSimpleType } from '../types/xsd-types';
import { getLocalName } from './xml-parser';

export class TypeRegistry {
  private elements = new Map<string, XsdElement>();
  private complexTypes = new Map<string, XsdComplexType>();
  private simpleTypes = new Map<string, XsdSimpleType>();

  addSchema(schema: XsdSchema): void {
    for (const [name, el] of schema.elements) {
      this.elements.set(name, el);
    }
    for (const [name, ct] of schema.complexTypes) {
      this.complexTypes.set(name, ct);
    }
    for (const [name, st] of schema.simpleTypes) {
      this.simpleTypes.set(name, st);
    }
  }

  resolveElement(qualifiedName: string): XsdElement | undefined {
    const local = getLocalName(qualifiedName);
    return this.elements.get(local);
  }

  resolveComplexType(qualifiedName: string): XsdComplexType | undefined {
    const local = getLocalName(qualifiedName);
    return this.complexTypes.get(local);
  }

  resolveSimpleType(qualifiedName: string): XsdSimpleType | undefined {
    const local = getLocalName(qualifiedName);
    return this.simpleTypes.get(local);
  }

  resolveType(qualifiedName: string): XsdComplexType | XsdSimpleType | undefined {
    return this.resolveComplexType(qualifiedName) || this.resolveSimpleType(qualifiedName);
  }

  getElementType(element: XsdElement): XsdComplexType | XsdSimpleType | undefined {
    if (element.complexType) return element.complexType;
    if (element.simpleType) return element.simpleType;
    if (element.type) return this.resolveType(element.type);
    return undefined;
  }

  getAllElements(): Map<string, XsdElement> {
    return this.elements;
  }

  getAllComplexTypes(): Map<string, XsdComplexType> {
    return this.complexTypes;
  }
}
