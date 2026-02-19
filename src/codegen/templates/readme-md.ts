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

  return `# ${config.projectName}

${config.projectDescription}

Auto-generated MCP server wrapping SOAP web services. Exposes ${totalTools} tools across ${services.length} service(s).

## Setup

\`\`\`bash
npm install
cp .env.example .env
# Edit .env with your credentials and endpoint URL
\`\`\`

## Running

\`\`\`bash
# Development (no compilation needed)
npm run dev

# Production
npm run build
npm start
\`\`\`

## Claude Desktop Configuration

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

## Available Tools

${toolList}
`;
}
