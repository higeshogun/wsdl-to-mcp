import type { ServiceClientInfo, OperationInfo } from '../../types/codegen-types';
import type { ProjectConfig } from '../../types/project-config';
import type { TypeRegistry } from '../../parser/type-registry';
import { getInputSchemaFields } from '../zod-mapper';
import { serviceToRegisterFunctionName } from '../name-utils';

export function generateToolFileTs(
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const registerFn = serviceToRegisterFunctionName(service.serviceName);
  const hasSession = config.authType === 'session';

  const imports = buildImports(hasSession);
  const functionBody = buildFunction(registerFn, service, config, registry, hasSession);

  return imports + '\n' + functionBody;
}

function buildImports(hasSession: boolean): string {
  let imports = `import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeResponse } from '../utils/xml-to-json.js';
import { formatSoapError } from '../utils/error-handler.js';
import type { Clients } from '../index.js';
`;

  if (hasSession) {
    imports += `import type { SessionManager } from '../session/session-manager.js';\n`;
  }

  return imports;
}

function buildFunction(
  registerFn: string,
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
  hasSession: boolean,
): string {
  const sessionParam = hasSession ? ', session: SessionManager' : '';

  const tools = service.operations.map(op =>
    buildTool(op, service, config, registry, hasSession)
  ).join('\n\n');

  return `export function ${registerFn}(server: McpServer, clients: Clients${sessionParam}): void {
${tools}
}
`;
}

function buildTool(
  op: OperationInfo,
  service: ServiceClientInfo,
  _config: ProjectConfig,
  registry: TypeRegistry,
  hasSession: boolean,
): string {
  const inputEl = op.inputElementName ? registry.resolveElement(op.inputElementName) : undefined;
  const fields = inputEl ? getInputSchemaFields(inputEl, registry) : [];

  const schemaStr = fields.length > 0
    ? `{\n${fields.map(f => `      ${f.name}: ${f.zodStr},`).join('\n')}\n    }`
    : '{}';

  const paramsStr = fields.length > 0
    ? `{\n${fields.map(f => `        ${f.name}: params.${f.name},`).join('\n')}\n      }`
    : '{}';

  const callExpr = hasSession
    ? `await session.executeWithSession(clients.${service.clientKey}, '${op.name}', ${paramsStr})`
    : `await (clients.${service.clientKey} as Record<string, Function>)['${op.name}Async'](${paramsStr}).then((r: unknown[]) => r[0])`;

  return `  server.tool(
    '${op.toolName}',
    '${escapeStr(op.description)}',
    ${schemaStr},
    async (params) => {
      try {
        const result = ${callExpr};
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(normalizeResponse(result), null, 2) }],
        };
      } catch (error) {
        const err = formatSoapError(error);
        return { content: [{ type: 'text' as const, text: err.text }], isError: true };
      }
    },
  );`;
}

function escapeStr(s: string): string {
  return s.replace(/'/g, "\\'").replace(/\n/g, ' ');
}
