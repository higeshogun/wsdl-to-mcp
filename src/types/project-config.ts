export interface ProjectConfig {
  projectName: string;
  projectDescription: string;
  toolPrefix: string;
  baseUrl: string;
  authType: 'none' | 'basic' | 'session';
  sessionConfig?: {
    loginOperation: string;
    logoutOperation: string;
    sessionHeaderNamespace: string;
    userIdField: string;
    passwordField: string;
  };
  soapVersion: '1.1' | '1.2';
  envVars: EnvVar[];
  testConfig?: {
    formats: ('pytest' | 'postman' | 'soapui' | 'k6')[];
    categories: ('smoke' | 'negative' | 'boundary')[];
  };
}

export interface EnvVar {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export function defaultConfig(): ProjectConfig {
  return {
    projectName: 'mcp-soap-server',
    projectDescription: 'Auto-generated MCP server for SOAP web services',
    toolPrefix: 'api',
    baseUrl: '',
    authType: 'none',
    soapVersion: '1.1',
    envVars: [
      { name: 'BASE_URL', description: 'SOAP service base URL', required: true, defaultValue: '' },
    ],
    testConfig: {
      formats: ['pytest', 'postman', 'soapui', 'k6'],
      categories: ['smoke', 'negative', 'boundary'],
    },
  };
}
