export interface WsdlDefinition {
  sourceFile?: string;
  targetNamespace: string;
  namespaces: Record<string, string>;
  services: WsdlService[];
  portTypes: WsdlPortType[];
  bindings: WsdlBinding[];
  messages: WsdlMessage[];
}

export interface WsdlService {
  name: string;
  ports: WsdlServicePort[];
}

export interface WsdlServicePort {
  name: string;
  bindingName: string;
  soapAddress: string;
}

export interface WsdlPortType {
  name: string;
  operations: WsdlOperation[];
}

export interface WsdlOperation {
  name: string;
  inputMessage: string;
  outputMessage: string;
  faultMessages: { name: string; message: string }[];
  documentation?: string;
}

export interface WsdlBinding {
  name: string;
  portTypeName: string;
  soapStyle: 'document' | 'rpc';
  soapVersion: '1.1' | '1.2';
  operations: WsdlBindingOperation[];
}

export interface WsdlBindingOperation {
  name: string;
  soapAction?: string;
}

export interface WsdlMessage {
  name: string;
  parts: WsdlMessagePart[];
}

export interface WsdlMessagePart {
  name: string;
  element?: string;
  type?: string;
}
