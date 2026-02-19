import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/project-store';
import { OperationTree } from '../common/OperationTree';
import { CodePreview } from '../common/CodePreview';

export function ReviewStep() {
  const { wsdlDefinitions, config, generatedFiles, generate } = useProjectStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    generate();
  }, [generate]);

  useEffect(() => {
    if (generatedFiles.length > 0 && !selectedFile) {
      setSelectedFile(generatedFiles[0].path);
    }
  }, [generatedFiles, selectedFile]);

  const currentFile = generatedFiles.find(f => f.path === selectedFile);
  const language = selectedFile?.endsWith('.json') ? 'json' : 'typescript';

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
                onClick={() => setSelectedFile(f.path)}
              >
                {f.path}
              </li>
            ))}
          </ul>
        </div>

        <div className="review-right">
          {currentFile ? (
            <CodePreview
              code={currentFile.content}
              language={language}
              fileName={currentFile.path}
            />
          ) : (
            <p className="muted">Select a file to preview its contents.</p>
          )}
        </div>
      </div>
    </div>
  );
}
