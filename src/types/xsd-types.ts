export interface XsdSchema {
  targetNamespace: string;
  elementFormDefault: 'qualified' | 'unqualified';
  elements: Map<string, XsdElement>;
  complexTypes: Map<string, XsdComplexType>;
  simpleTypes: Map<string, XsdSimpleType>;
  /** Top-level global attribute declarations (local name → attribute) */
  globalAttributes: Map<string, XsdAttribute>;
}

export interface XsdElement {
  name: string;
  type?: string;
  complexType?: XsdComplexType;
  simpleType?: XsdSimpleType;
  minOccurs: number;
  maxOccurs: number | 'unbounded';
  nillable: boolean;
  documentation?: string;
  defaultValue?: string;
}

export interface XsdComplexType {
  name?: string;
  compositor: 'sequence' | 'all' | 'choice' | null;
  elements: XsdElement[];
  attributes: XsdAttribute[];
  extension?: { base: string; elements: XsdElement[]; attributes: XsdAttribute[] };
}

export interface XsdSimpleType {
  name?: string;
  restriction?: {
    base: string;
    enumerations: string[];
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    length?: number;
    minInclusive?: number;
    maxInclusive?: number;
  };
}

export interface XsdAttribute {
  name: string;
  type?: string;
  use: 'required' | 'optional' | 'prohibited';
  defaultValue?: string;
  ref?: string;
  simpleType?: XsdSimpleType;
  /** Namespace URI of the ref's prefix (e.g. for ref="cq:dslRef", this is the URI of cq) */
  refNsUri?: string;
}
