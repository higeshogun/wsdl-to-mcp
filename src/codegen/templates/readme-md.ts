import type { ProjectConfig } from '../../types/project-config';
import type { ServiceClientInfo } from '../../types/codegen-types';

export function generateReadmeMd(
  config: ProjectConfig,
  services: ServiceClientInfo[],
): string {
  const totalTools = services.reduce((sum, s) => sum + s.operations.length, 0);

  const toolList = services.map(svc => {
    const ops = svc.operations.map(op => `  - \`${op.toolName}\` - ${op.description}`).join('\n');
    return `### ${svc.serviceName}\n${ops}`;
  }).join('\n\n');

  const prefix = config.toolPrefix.toUpperCase();

  const envSection = config.authType === 'session' ? `
## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| \`${prefix}_BASE_URL\` | Yes | SOAP business service endpoint URL |
| \`${prefix}_AUTH_URL\` | Yes | Authentication service endpoint URL (may differ from \`BASE_URL\`) |
| \`${prefix}_USER_ID\` | Yes | Login username |
| \`${prefix}_PASSWORD\` | Yes | Login password |
| \`${prefix}_LOGIN_TYPE\` | No | Session strategy: \`GetSession\`, \`CreateSession\`, or \`GetOrCreateSession\` (default) |

> **Note:** \`AUTH_URL\` and \`BASE_URL\` can be set to the same value if authentication and business operations share a single endpoint. They are kept separate because many services expose authentication at a different URL.
` : config.authType === 'basic' ? `
## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| \`${prefix}_BASE_URL\` | Yes | SOAP service endpoint URL |
| \`${prefix}_USER_ID\` | Yes | Basic auth username |
| \`${prefix}_PASSWORD\` | Yes | Basic auth password |
` : `
## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| \`${prefix}_BASE_URL\` | Yes | SOAP service endpoint URL |
`;

  return `# ${config.projectName}

${config.projectDescription}

Auto-generated MCP server wrapping SOAP web services. Exposes ${totalTools} tools across ${services.length} service(s).

## Setup

\`\`\`bash
npm install
cp .env.example .env
# Edit .env with your service URLs and credentials
\`\`\`
${envSection}
## Running

\`\`\`bash
# Development (no compilation needed)
npm run dev

# Production
npm run build
npm start
\`\`\`

## MCP Client Configuration

### Claude Desktop

Add to your \`claude_desktop_config.json\`:

\`\`\`json
{
  "mcpServers": {
    "${config.projectName}": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/${config.projectName}"
    }
  }
}
\`\`\`

### OpenWebUI / HTTP clients (via mcpo)

\`\`\`bash
pip install mcpo
mcpo --port 8000 -- npx tsx src/index.ts
\`\`\`

Then add \`http://localhost:8000\` as a tool server in OpenWebUI.

## Available Tools

${toolList}
`;
}
