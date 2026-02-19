import { useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../store/project-store';
import { BrowserMcpServer } from './BrowserMcpServer';
import type { Tool } from './BrowserMcpServer';
import { Chatbot } from './Chatbot';
import { IndexedDBStorage } from './IndexedDBStorage';
import { WORKER_SCRIPT } from '../common/cors-proxy-worker';
import { getProvider, providerList } from './providers/index';
import type { ProviderType, ProviderConfig, ModelOption } from './providers/types';

const storage = new IndexedDBStorage();

export function TryItOutStep() {
  const { wsdlDefinitions, xsdSchemas } = useProjectStore();
  const [provider, setProvider] = useState<ProviderType>('ollama');
  const [apiKey, setApiKey] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [server, setServer] = useState<BrowserMcpServer | null>(null);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(true);

  // Load config on mount
  useEffect(() => {
    storage.get<string>('provider').then((val) => val && setProvider(val as ProviderType));
    storage.get<string>('apiKey').then((val) => val && setApiKey(val));
    storage.get<string>('proxyUrl').then((val) => val && setProxyUrl(val));
    storage.get<string>('baseUrl').then((val) => val && setBaseUrl(val));
    storage.get<string>('model').then((val) => val && setModel(val));
    storage.get<string>('customModel').then((val) => val && setCustomModel(val));
  }, []);

  // Save config on change
  useEffect(() => { storage.set('provider', provider); }, [provider]);
  useEffect(() => { if (apiKey) storage.set('apiKey', apiKey); }, [apiKey]);
  useEffect(() => { if (proxyUrl) storage.set('proxyUrl', proxyUrl); }, [proxyUrl]);
  useEffect(() => { if (baseUrl) storage.set('baseUrl', baseUrl); }, [baseUrl]);
  useEffect(() => { if (model) storage.set('model', model); }, [model]);
  useEffect(() => { if (customModel) storage.set('customModel', customModel); }, [customModel]);

  // Init server
  useEffect(() => {
    if (wsdlDefinitions.length > 0) {
      console.log(`[TryItOutStep] Initializing BrowserMcpServer with ${wsdlDefinitions.length} WSDL definitions, ${xsdSchemas.length} XSD schemas`);
      const s = new BrowserMcpServer(wsdlDefinitions, xsdSchemas);
      setServer(s);
    } else {
      console.log(`[TryItOutStep] No WSDL definitions available`);
      setServer(null);
    }
  }, [wsdlDefinitions, xsdSchemas]);

  // Get tools list for display
  const tools: Tool[] = useMemo(() => {
    if (!server) return [];
    return server.getTools();
  }, [server]);

  // Reset models and base URL when provider changes
  useEffect(() => {
    setModels([]);
    setModel('');
    setModelsError(null);
    const p = getProvider(provider);
    if (p.requiresBaseUrl) {
      setBaseUrl(p.defaultBaseUrl);
    }
  }, [provider]);

  // Fetch available models
  const fetchModels = async () => {
    const p = getProvider(provider);
    if (p.requiresApiKey && !apiKey) return;
    if (p.requiresProxy && !proxyUrl) return;
    if (p.requiresBaseUrl && !baseUrl) return;

    setModelsLoading(true);
    setModelsError(null);

    try {
      const config: ProviderConfig = { apiKey, proxyUrl, baseUrl, model };
      const fetched = await p.fetchModels(config);
      setModels(fetched);

      if (fetched.length > 0 && !fetched.some((m: ModelOption) => m.id === model)) {
        setModel(fetched[0].id);
      }
    } catch (err: any) {
      setModelsError(err.message);
      console.error('Error fetching models:', err);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [apiKey, proxyUrl, baseUrl, provider]);

  const currentProvider = getProvider(provider);

  const isReady = server
    && (!currentProvider.requiresApiKey || apiKey)
    && (!currentProvider.requiresProxy || proxyUrl)
    && (!currentProvider.requiresBaseUrl || baseUrl)
    && (model || (model === 'custom' && customModel))
    && !modelsLoading;

  return (
    <div className="step-content try-it-out-layout">
      <h2>Try It Out</h2>
      <p>Test your MCP tools directly in the browser using an in-memory MCP server.</p>

      {/* Tools Panel */}
      <div className="config-panel" style={{ marginBottom: '0' }}>
        <details open={toolsPanelOpen} onToggle={e => setToolsPanelOpen((e.target as HTMLDetailsElement).open)}>
          <summary style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '15px' }}>
            Discovered Tools
            {tools.length > 0 && (
              <span className="tools-count-badge">{tools.length}</span>
            )}
          </summary>

          {tools.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No tools discovered. Go to the Upload step to add WSDL files.
            </p>
          ) : (
            <div className="tools-list">
              {tools.map((tool, i) => (
                <div key={i} className="tool-item">
                  <div className="tool-item-header">
                    <code className="tool-item-name">{tool.name}</code>
                    {tool.inputSchema?.properties && (
                      <span className="tool-item-params">
                        {Object.keys(tool.inputSchema.properties).length} params
                      </span>
                    )}
                  </div>
                  {tool.description && (
                    <p className="tool-item-desc">{tool.description}</p>
                  )}
                  {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                    <div className="tool-item-schema">
                      {Object.entries(tool.inputSchema.properties).map(([key, val]: [string, any]) => (
                        <span key={key} className="tool-param-tag">
                          {key}
                          {val.type && <span className="tool-param-type">: {val.type}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
      </div>

      {/* LLM Configuration */}
      <div className="config-panel" style={{ marginBottom: '0' }}>
        <details style={{ cursor: 'pointer' }}>
          <summary style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '15px' }}>
            LLM Configuration
          </summary>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>LLM Provider:</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as ProviderType)}
              style={{ width: '100%', padding: '8px' }}
            >
              {providerList.map(p => (
                <option key={p.type} value={p.type}>{p.displayName}</option>
              ))}
            </select>
          </div>

          {currentProvider.requiresApiKey && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                {provider === 'gemini' ? 'Gemini API Key:' : 'Anthropic API Key:'}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
                placeholder={provider === 'gemini' ? 'AIza...' : 'sk-...'}
              />
            </div>
          )}

          {currentProvider.requiresBaseUrl && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>
                {provider === 'llamacpp' ? 'llama.cpp Server URL:' : 'Ollama Base URL:'}
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
                placeholder={currentProvider.defaultBaseUrl}
              />
              {provider === 'ollama' && (
                <>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Start Ollama with CORS enabled: <code>OLLAMA_ORIGINS=* ollama serve</code>
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Only models with tool-calling support are shown.
                  </p>
                </>
              )}
              {provider === 'llamacpp' && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  llama.cpp server with OpenAI-compatible API endpoint.
                </p>
              )}
            </div>
          )}

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Model:</label>
            {modelsLoading && <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Loading models...</p>}
            {modelsError && <p style={{ fontSize: '0.9rem', color: 'var(--error)' }}>Error: {modelsError}</p>}
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={{ width: '100%', padding: '8px' }}
              disabled={modelsLoading || models.length === 0}
            >
              {models.length === 0 ? (
                <option>No models available</option>
              ) : (
                <>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                  <option value="custom">Custom Model ID</option>
                </>
              )}
            </select>
          </div>

          {model === 'custom' && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Custom Model ID:</label>
              <input
                type="text"
                value={customModel}
                onChange={e => setCustomModel(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
                placeholder="e.g., claude-4-20260219"
              />
            </div>
          )}

          {currentProvider.requiresProxy && (
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>CORS Proxy URL:</label>
              <input
                type="text"
                value={proxyUrl}
                onChange={e => setProxyUrl(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
                placeholder="https://proxy.kumatech.net"
              />
            </div>
          )}

          {currentProvider.requiresProxy && (
            <details style={{ marginTop: '15px' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--primary-hover)' }}>How to setup Cloudflare Worker Proxy</summary>
              <div style={{ marginTop: '10px' }}>
                <p style={{ marginBottom: '8px', fontSize: '0.9rem' }}>Create a new Cloudflare Worker and paste this code. Works with Anthropic, Gemini, and WSDL loading:</p>
                <pre style={{ overflowX: 'auto', fontSize: '12px' }}>{WORKER_SCRIPT}</pre>
              </div>
            </details>
          )}
        </details>
      </div>

      {isReady ? (
        <Chatbot
          provider={provider}
          apiKey={apiKey}
          proxyUrl={proxyUrl}
          baseUrl={baseUrl}
          model={model === 'custom' ? customModel : model}
          server={server!}
        />
      ) : (
        <div className="placeholder-message">
          {modelsLoading
            ? 'Loading models...'
            : provider === 'ollama'
              ? 'Please make sure Ollama is running and select a model to start chatting.'
              : provider === 'llamacpp'
                ? 'Please make sure your llama.cpp server is running and select a model to start chatting.'
                : 'Please configure your API Key, Proxy URL, and select a model to start chatting.'}
        </div>
      )}
    </div>
  );
}
