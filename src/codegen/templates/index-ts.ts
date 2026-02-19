import type { ServiceClientInfo } from '../../types/codegen-types';
import type { ProjectConfig } from '../../types/project-config';
import { toPascalCase } from '../name-utils';

export function generateIndexTs(
  services: ServiceClientInfo[],
  config: ProjectConfig,
): string {
  const hasSession = config.authType === 'session';
  const prefix = config.toolPrefix.toUpperCase();

  const clientImports = services.map(svc => {
    const funcName = `create${toPascalCase(svc.clientKey)}Client`;
    return `import { ${funcName} } from './soap/client-factory.js';`;
  }).join('\n');

  const sessionImport = hasSession
    ? `import { SessionManager } from './session/session-manager.js';\n`
    : '';

  const clientCreation = services.map(svc => {
    const funcName = `create${toPascalCase(svc.clientKey)}Client`;
    return `    ${funcName}(config.${prefix}_BASE_URL),`;
  }).join('\n');

  const clientDestructure = services.map(svc => svc.clientKey).join(', ');

  const clientTypeFields = services.map(svc =>
    `  ${svc.clientKey}: soap.Client;`
  ).join('\n');

  const clientObjectFields = services.map(svc =>
    `    ${svc.clientKey},`
  ).join('\n');

  const sessionSetup = hasSession ? `
  const session = new SessionManager(${services[0]?.clientKey || 'client'}, {
    userID: config.${prefix}_USER_ID,
    password: config.${prefix}_PASSWORD,
    loginType: config.${prefix}_LOGIN_TYPE || 'GetOrCreateSession',
  });
` : '';

  const sessionArg = hasSession ? ', session' : '';
  const sessionCleanup = hasSession ? `
  const cleanup = async () => {
    await session.logout();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
` : '';

  return `import * as soap from 'soap';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
${clientImports}
${sessionImport}import { registerAllTools } from './tools/tool-registry.js';

export interface Clients {
${clientTypeFields}
}

async function main() {
  const config = loadConfig();

  const server = new McpServer({
    name: '${config.projectName}',
    version: '1.0.0',
  });

  const [${clientDestructure}] = await Promise.all([
${clientCreation}
  ]);

  const clients: Clients = {
${clientObjectFields}
  };
${sessionSetup}
  registerAllTools(server, clients${sessionArg});

  const transport = new StdioServerTransport();
  await server.connect(transport);
${sessionCleanup}
}

main().catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
`;
}
