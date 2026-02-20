import type { ServiceClientInfo } from '../../types/codegen-types';
import { toPascalCase } from '../name-utils';

export function generateClientFactoryTs(services: ServiceClientInfo[]): string {
  const imports = `import * as soap from 'soap';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WSDL_DIR = path.join(__dirname, '..', '..', 'wsdl');
`;

  const functions = services.map(svc => {
    const funcName = `create${toPascalCase(svc.clientKey)}Client`;
    return `
export async function ${funcName}(baseUrl: string): Promise<soap.Client> {
  const wsdlPath = path.join(WSDL_DIR, '${svc.wsdlFile}');
  const client = await soap.createClientAsync(wsdlPath);
  client.setEndpoint(\`\${baseUrl}\`);
  return client;
}`;
  }).join('\n');

  return imports + functions + '\n';
}
