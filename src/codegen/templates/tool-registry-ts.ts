import type { ServiceClientInfo } from '../../types/codegen-types';
import type { ProjectConfig } from '../../types/project-config';
import {
  serviceToRegisterFunctionName,
  serviceToToolFileName,
} from '../name-utils';

export function generateToolRegistryTs(
  services: ServiceClientInfo[],
  config: ProjectConfig,
): string {
  const hasSession = config.authType === 'session';
  const sessionImport = hasSession
    ? `import type { SessionManager } from '../session/session-manager.js';\n`
    : '';

  const imports = services.map(svc => {
    const fn = serviceToRegisterFunctionName(svc.serviceName);
    const file = serviceToToolFileName(svc.serviceName).replace('.ts', '.js');
    return `import { ${fn} } from './${file}';`;
  }).join('\n');

  const sessionParam = hasSession ? ', session: SessionManager' : '';
  const sessionArg = hasSession ? ', session' : '';

  const calls = services.map(svc => {
    const fn = serviceToRegisterFunctionName(svc.serviceName);
    return `  ${fn}(server, clients${sessionArg});`;
  }).join('\n');

  return `import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Clients } from '../index.js';
${sessionImport}${imports}

export function registerAllTools(server: McpServer, clients: Clients${sessionParam}): void {
${calls}
}
`;
}
