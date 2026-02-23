import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '../../store/project-store';
import { OperationTree } from '../common/OperationTree';
import { CodePreview } from '../common/CodePreview';
import { BrowserMcpServer } from '../playground/BrowserMcpServer';

export function ReviewStep() {
  const { wsdlDefinitions, xsdSchemas, config, generatedFiles, generate } = useProjectStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  useEffect(() => {
    generate();
  }, [generate]);

  useEffect(() => {
    if (generatedFiles.length > 0 && !selectedFile && !selectedTool) {
      setSelectedFile(generatedFiles[0].path);
    }
  }, [generatedFiles, selectedFile, selectedTool]);

  const tools = useMemo(() => {
    if (wsdlDefinitions.length === 0) return [];
    const server = new BrowserMcpServer(wsdlDefinitions, xsdSchemas);
    return server.getTools().tools;
  }, [wsdlDefinitions, xsdSchemas]);

  const currentFile = generatedFiles.find(f => f.path === selectedFile);
  const currentTool = tools.find(t => t.name === selectedTool);
  const language = selectedFile?.endsWith('.json') ? 'json' : 'typescript';

  const handleFileClick = (path: string) => {
    setSelectedFile(path);
    setSelectedTool(null);
  };

  const handleToolClick = (name: string) => {
    setSelectedTool(name);
    setSelectedFile(null);
  };

  return (
    <div className="step-content review-layout">
      <h2>Review Generated Project</h2>
      <p>
        {generatedFiles.length} files will be generated with{' '}
        {wsdlDefinitions.reduce(
          (s, w) => s + w.portTypes.reduce((s2, pt) => s2 + pt.operations.length, 0),
          0,
        )}{' '}
        tools.
      </p>

      <div className="review-panels">
        <div className="review-left">
          <h3>Operations</h3>
          <OperationTree
            definitions={wsdlDefinitions}
            toolPrefix={config.toolPrefix}
          />

          <h3>Generated Files</h3>
          <ul className="file-tree">
            {generatedFiles.map(f => (
              <li
                key={f.path}
                className={`file-tree-item ${f.path === selectedFile ? 'selected' : ''}`}
                onClick={() => handleFileClick(f.path)}
              >
                {f.path}
              </li>
            ))}
          </ul>

          {tools.length > 0 && (
            <>
              <h3>Tool Schemas</h3>
              <ul className="file-tree">
                {tools.map(t => (
                  <li
                    key={t.name}
                    className={`file-tree-item ${t.name === selectedTool ? 'selected' : ''}`}
                    onClick={() => handleToolClick(t.name)}
                  >
                    {t.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="review-right">
          {currentTool ? (
            <CodePreview
              code={JSON.stringify(currentTool.inputSchema, null, 2)}
              language="json"
              fileName={`${currentTool.name} — Input Schema`}
            />
          ) : currentFile ? (
            <CodePreview
              code={currentFile.content}
              language={language}
              fileName={currentFile.path}
            />
          ) : (
            <p className="muted">Select a file or tool to preview.</p>
          )}
        </div>
      </div>
    </div>
  );
}
