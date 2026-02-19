export interface GeneratedFile {
  path: string;
  content: string;
}

export interface OperationInfo {
  name: string;
  toolName: string;
  description: string;
  inputElementName?: string;
  inputType?: string;
  serviceName: string;
  clientKey: string;
}

export interface ServiceClientInfo {
  serviceName: string;
  clientKey: string;
  wsdlFile: string;
  endpoint: string;
  operations: OperationInfo[];
}
