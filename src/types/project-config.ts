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
  envVars: EnvVar[];
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
    envVars: [
      { name: 'BASE_URL', description: 'SOAP service base URL', required: true, defaultValue: '' },
    ],
  };
}
