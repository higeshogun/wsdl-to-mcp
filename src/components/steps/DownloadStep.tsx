import { useState } from 'react';
import { useProjectStore } from '../../store/project-store';
import { buildAndDownloadZip } from '../../zip/zip-builder';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className="snippet-copy-btn"
      onClick={handleCopy}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function DownloadStep() {
  const { config, generatedFiles, files } = useProjectStore();

  const handleDownload = async () => {
    await buildAndDownloadZip(config.projectName, generatedFiles, files);
  };

  const totalTools = generatedFiles.filter(f => f.path.includes('/tools/') && f.path !== 'src/tools/tool-registry.ts').length;

  // Build env block from config envVars
  const envEntries: Record<string, string> = {};
  for (const v of config.envVars) {
    if (v.required) {
      envEntries[v.name] = v.defaultValue || `<your-${v.name.toLowerCase().replace(/_/g, '-')}>`;
    }
  }

  const configSnippetObj: any = {
    mcpServers: {
      [config.projectName]: {
        command: 'npx',
        args: ['tsx', 'src/index.ts'],
        cwd: `/path/to/${config.projectName}`,
        ...(Object.keys(envEntries).length > 0 ? { env: envEntries } : {}),
      },
    },
  };
  const configSnippet = JSON.stringify(configSnippetObj, null, 2);

  const cliCommand = `claude mcp add ${config.projectName} -- npx tsx src/index.ts`;

  return (
    <div className="step-content">
      <h2>Download Your MCP Server</h2>

      <div className="download-summary">
        <p>
          Your project <strong>{config.projectName}</strong> is ready with{' '}
          <strong>{generatedFiles.length}</strong> files and{' '}
          <strong>{totalTools}</strong> tool file(s).
        </p>
      </div>

      <button className="btn-primary btn-large" onClick={handleDownload}>
        Download {config.projectName}.zip
      </button>

      <div className="setup-instructions">
        <h3>Setup Instructions</h3>
        <ol>
          <li>
            <strong>Extract</strong> the zip file
          </li>
          <li>
            <strong>Install dependencies:</strong>
            <pre><code>cd {config.projectName} && npm install</code></pre>
          </li>
          <li>
            <strong>Configure credentials:</strong>
            <pre><code>cp .env.example .env<br /># Edit .env with your endpoint URL and credentials</code></pre>
          </li>
          <li>
            <strong>Start the server:</strong>
            <pre><code>npm run dev</code></pre>
          </li>
          <li>
            <strong>Connect to Claude Desktop:</strong> Add this to your{' '}
            <code>claude_desktop_config.json</code>:
            <div className="snippet-wrapper">
              <CopyButton text={configSnippet} />
              <pre><code>{configSnippet}</code></pre>
            </div>
          </li>
          <li>
            <strong>Or use with Claude Code:</strong>
            <div className="snippet-wrapper">
              <CopyButton text={cliCommand} />
              <pre><code>{cliCommand}</code></pre>
            </div>
          </li>
        </ol>
      </div>
    </div>
  );
}
