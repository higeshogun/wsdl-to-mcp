import { useProjectStore } from '../../store/project-store';
import { buildAndDownloadZip } from '../../zip/zip-builder';

export function DownloadStep() {
  const { config, generatedFiles, files } = useProjectStore();

  const handleDownload = async () => {
    await buildAndDownloadZip(config.projectName, generatedFiles, files);
  };

  const totalTools = generatedFiles.filter(f => f.path.includes('/tools/') && f.path !== 'src/tools/tool-registry.ts').length;

  const configSnippet = `{
  "mcpServers": {
    "${config.projectName}": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/${config.projectName}"
    }
  }
}`;

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
            <pre><code>{configSnippet}</code></pre>
          </li>
          <li>
            <strong>Or use with Claude Code:</strong>
            <pre><code>claude mcp add {config.projectName} -- npx tsx src/index.ts</code></pre>
          </li>
        </ol>
      </div>
    </div>
  );
}
