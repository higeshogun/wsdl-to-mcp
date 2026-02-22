import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/project-store';
import { CodePreview } from '../common/CodePreview';
import type { GeneratedFile } from '../../types/codegen-types';

export function TestGenerationStep() {
  const { config, generatedFiles, updateConfig, generate } = useProjectStore();
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [testFormats, setTestFormats] = useState({
    pytest: true,
    postman: true,
    soapui: true,
    k6: true,
  });
  const [testCategories, setTestCategories] = useState({
    smoke: true,
    negative: true,
    boundary: true,
  });

  // Generate tests when component mounts or config changes
  useEffect(() => {
    const updatedConfig = {
      ...config,
      testConfig: {
        formats: Object.entries(testFormats)
          .filter(([_, enabled]) => enabled)
          .map(([format]) => format as 'pytest' | 'postman' | 'soapui' | 'k6'),
        categories: Object.entries(testCategories)
          .filter(([_, enabled]) => enabled)
          .map(([category]) => category as 'smoke' | 'negative' | 'boundary'),
      },
    };
    updateConfig(updatedConfig);
    generate();
  }, [testFormats, testCategories]);

  const testFiles = generatedFiles.filter((file: GeneratedFile) =>
    file.path.startsWith('tests/') ||
    file.path.includes('test') ||
    file.path.includes('Test')
  );

  const handleFormatChange = (format: keyof typeof testFormats) => {
    setTestFormats(prev => ({ ...prev, [format]: !prev[format] }));
  };

  const handleCategoryChange = (category: keyof typeof testCategories) => {
    setTestCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className="step-content">
      <div className="test-gen-header">
        <h2>Generate Regression Test Scripts</h2>
        <p>
          Generate automated test scripts in multiple formats to validate your SOAP service integration.
          Tests include smoke tests, negative tests, and boundary condition tests.
        </p>
      </div>

      <div className="test-gen-controls">
        <div className="test-gen-section">
          <h3>Test Formats</h3>
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testFormats.pytest}
                onChange={() => handleFormatChange('pytest')}
              />
              <span className="checkmark"></span>
              Python pytest - Unit testing framework with SOAP client
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testFormats.postman}
                onChange={() => handleFormatChange('postman')}
              />
              <span className="checkmark"></span>
              Postman Collection - API testing tool collection
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testFormats.soapui}
                onChange={() => handleFormatChange('soapui')}
              />
              <span className="checkmark"></span>
              SoapUI Project - Professional SOAP testing suite
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testFormats.k6}
                onChange={() => handleFormatChange('k6')}
              />
              <span className="checkmark"></span>
              k6 Load Test - Performance and load testing script
            </label>
          </div>
        </div>

        <div className="test-gen-section">
          <h3>Test Categories</h3>
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testCategories.smoke}
                onChange={() => handleCategoryChange('smoke')}
              />
              <span className="checkmark"></span>
              Smoke Tests - Basic functionality with valid inputs
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testCategories.negative}
                onChange={() => handleCategoryChange('negative')}
              />
              <span className="checkmark"></span>
              Negative Tests - Error handling with missing required fields
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testCategories.boundary}
                onChange={() => handleCategoryChange('boundary')}
              />
              <span className="checkmark"></span>
              Boundary Tests - Edge cases with constraint violations
            </label>
          </div>
        </div>
      </div>

      <div className="test-gen-summary">
        <h3>Generated Test Files ({testFiles.length})</h3>
        <p>
          Test scripts will be included in your project download and can be run to validate
          your SOAP service integration.
        </p>
      </div>

      <div className="review-layout">
        <div className="review-panels">
          <div className="review-panel">
            <h3>Test Files</h3>
            <ul className="file-tree">
              {testFiles.map(file => (
                <li
                  key={file.path}
                  className={`file-tree-item ${file === selectedFile ? 'selected' : ''}`}
                  onClick={() => setSelectedFile(file)}
                >
                  {file.path}
                </li>
              ))}
            </ul>
          </div>
          <div className="review-panel">
            {selectedFile ? (
              <CodePreview
                code={selectedFile.content}
                language={selectedFile.path.endsWith('.json') ? 'json' : selectedFile.path.endsWith('.py') ? 'python' : selectedFile.path.endsWith('.js') ? 'javascript' : 'xml'}
                fileName={selectedFile.path}
              />
            ) : (
              <div className="no-selection">
                <p>Select a test file to preview its contents</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}