import { useEffect, useMemo, useState, useCallback } from 'react';
import { useProjectStore } from '../../store/project-store';
import { OperationTree } from '../common/OperationTree';
import { CodePreview } from '../common/CodePreview';
import { BrowserMcpServer } from '../playground/BrowserMcpServer';
import {
  getChromeAIAvailability,
  isPromptApiUsable,
  enhanceToolDescription,
  detectLanguage,
  translateToEnglish,
} from '../../ai/chrome-ai';
import type { ChromeAIAvailability } from '../../ai/chrome-ai';

export function ReviewStep() {
  const {
    wsdlDefinitions,
    xsdSchemas,
    config,
    generatedFiles,
    generate,
    enhancedDescriptions,
    setEnhancedDescription,
  } = useProjectStore();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [chromeAI, setChromeAI] = useState<ChromeAIAvailability | null>(null);
  const [enhancingTool, setEnhancingTool] = useState<string | null>(null);
  const [enhancingAll, setEnhancingAll] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState<{ done: number; total: number } | null>(null);
  const [langBanner, setLangBanner] = useState<{ lang: string; langCode: string } | null>(null);
  const [translating, setTranslating] = useState(false);

  // Generate on mount and whenever enhanced descriptions are updated
  useEffect(() => {
    generate();
  }, [generate, enhancedDescriptions]);

  useEffect(() => {
    if (generatedFiles.length > 0 && !selectedFile && !selectedTool) {
      setSelectedFile(generatedFiles[0].path);
    }
  }, [generatedFiles, selectedFile, selectedTool]);

  // Check Chrome AI availability
  useEffect(() => {
    getChromeAIAvailability().then(setChromeAI).catch(() => {});
  }, []);

  // Detect WSDL documentation language after Chrome AI check
  useEffect(() => {
    if (!chromeAI || chromeAI.languageDetector === 'unavailable') return;

    const docs = wsdlDefinitions
      .flatMap(d => d.portTypes)
      .flatMap(pt => pt.operations)
      .map(op => op.documentation)
      .filter((d): d is string => Boolean(d) && d.trim().length > 20);

    if (docs.length === 0) return;

    detectLanguage(docs.slice(0, 3).join(' ')).then(lang => {
      if (lang && !lang.startsWith('en')) {
        const langNames: Record<string, string> = {
          es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
          it: 'Italian', nl: 'Dutch', ru: 'Russian', ja: 'Japanese',
          zh: 'Chinese', ko: 'Korean', ar: 'Arabic',
        };
        setLangBanner({ lang: langNames[lang] ?? lang.toUpperCase(), langCode: lang });
      }
    }).catch(() => {});
  }, [chromeAI, wsdlDefinitions]);

  const tools = useMemo(() => {
    if (wsdlDefinitions.length === 0) return [];
    const server = new BrowserMcpServer(wsdlDefinitions, xsdSchemas, enhancedDescriptions);
    return server.getTools().tools;
  }, [wsdlDefinitions, xsdSchemas, enhancedDescriptions]);

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

  const handleEnhanceOne = useCallback(async (tool: { name: string; description?: string; inputSchema: unknown }) => {
    if (enhancingTool) return;
    setEnhancingTool(tool.name);
    try {
      const enhanced = await enhanceToolDescription(
        tool.name,
        tool.description ?? '',
        JSON.stringify(tool.inputSchema, null, 2),
      );
      setEnhancedDescription(tool.name, enhanced);
    } catch (e) {
      console.error('Chrome AI enhance failed for', tool.name, e);
    } finally {
      setEnhancingTool(null);
    }
  }, [enhancingTool, setEnhancedDescription]);

  const handleEnhanceAll = useCallback(async () => {
    if (enhancingAll || tools.length === 0) return;
    setEnhancingAll(true);
    setEnhanceProgress({ done: 0, total: tools.length });
    for (const tool of tools) {
      try {
        const enhanced = await enhanceToolDescription(
          tool.name,
          tool.description ?? '',
          JSON.stringify(tool.inputSchema, null, 2),
        );
        setEnhancedDescription(tool.name, enhanced);
      } catch (e) {
        console.error('Chrome AI enhance failed for', tool.name, e);
      }
      setEnhanceProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
    }
    setEnhancingAll(false);
    setEnhanceProgress(null);
  }, [enhancingAll, tools, setEnhancedDescription]);

  const handleTranslateDocs = useCallback(async () => {
    if (!langBanner || translating) return;
    setTranslating(true);
    try {
      for (const tool of tools) {
        // Match by comparing tool description to raw WSDL documentation strings
        const op = wsdlDefinitions
          .flatMap(d => d.portTypes)
          .flatMap(pt => pt.operations)
          .find(o => o.documentation && o.documentation === tool.description);

        if (op?.documentation) {
          const translated = await translateToEnglish(op.documentation, langBanner.langCode);
          setEnhancedDescription(tool.name, translated);
        }
      }
      setLangBanner(null);
    } catch (e) {
      console.error('Translation failed:', e);
    } finally {
      setTranslating(false);
    }
  }, [langBanner, translating, tools, wsdlDefinitions, setEnhancedDescription]);

  const aiAvailable = chromeAI !== null && isPromptApiUsable(chromeAI);
  const totalOps = wsdlDefinitions.reduce(
    (s, w) => s + w.portTypes.reduce((s2, pt) => s2 + pt.operations.length, 0),
    0,
  );

  return (
    <div className="step-content review-layout">
      <div className="review-heading">
        <div>
          <h2>Review Generated Project</h2>
          <p>
            {generatedFiles.length} files will be generated with {totalOps} tools.
          </p>
        </div>
        {aiAvailable && (
          <span className="chrome-ai-badge">✦ Chrome AI</span>
        )}
      </div>

      {langBanner && chromeAI?.translator && (
        <div className="ai-lang-banner">
          <span>Detected {langBanner.lang} documentation.</span>
          <button
            className="btn-link"
            onClick={handleTranslateDocs}
            disabled={translating}
          >
            {translating ? 'Translating…' : 'Translate to English'}
          </button>
        </div>
      )}

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
              <div className="tool-schemas-header">
                <h3>Tool Schemas</h3>
                {aiAvailable && (
                  <button
                    className="btn-ai-enhance"
                    onClick={handleEnhanceAll}
                    disabled={enhancingAll}
                    title="Rewrite all tool descriptions with Gemini Nano (on-device)"
                  >
                    {enhancingAll
                      ? `${enhanceProgress?.done ?? 0}/${enhanceProgress?.total ?? tools.length}`
                      : '✨ Enhance All'}
                  </button>
                )}
              </div>
              <ul className="file-tree">
                {tools.map(t => (
                  <li
                    key={t.name}
                    className={`file-tree-item tool-schema-item ${t.name === selectedTool ? 'selected' : ''}`}
                    onClick={() => handleToolClick(t.name)}
                  >
                    <span className="tool-schema-name">{t.name}</span>
                    {enhancedDescriptions[t.name]
                      ? <span className="ai-sparkle" title="AI-enhanced description">✨</span>
                      : aiAvailable && (
                        <button
                          className="btn-ai-single"
                          onClick={e => { e.stopPropagation(); void handleEnhanceOne(t); }}
                          disabled={enhancingTool === t.name}
                          title="Enhance description with Chrome AI"
                        >
                          {enhancingTool === t.name ? '…' : '✨'}
                        </button>
                      )
                    }
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="review-right">
          {currentTool ? (
            <div className="tool-schema-view">
              {currentTool.description && (
                <div className="tool-description-banner">
                  <span className="tool-description-label">Description</span>
                  <span className="tool-description-text">
                    {currentTool.description}
                    {enhancedDescriptions[currentTool.name] && (
                      <span className="ai-tag">AI</span>
                    )}
                  </span>
                </div>
              )}
              <CodePreview
                code={JSON.stringify(currentTool.inputSchema, null, 2)}
                language="json"
                fileName={`${currentTool.name} — Input Schema`}
              />
            </div>
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
