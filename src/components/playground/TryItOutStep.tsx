import { useState, useEffect, useMemo, useCallback } from 'react';
import { useProjectStore } from '../../store/project-store';
import { BrowserMcpServer } from './BrowserMcpServer';
import type { Tool } from './BrowserMcpServer';
import type { PlaygroundSessionConfig, PlaygroundSessionCredentials } from './BrowserMcpServer';
import { Chatbot } from './Chatbot';
import { IndexedDBStorage } from './IndexedDBStorage';
import { WORKER_SCRIPT } from '../common/cors-proxy-worker';
import { getProvider, providerList } from './providers/index';
import type { ProviderType, ProviderConfig, ModelOption } from './providers/types';

const storage = new IndexedDBStorage();

export function TryItOutStep() {
  const { wsdlDefinitions, xsdSchemas, config } = useProjectStore();
  const [provider, setProvider] = useState<ProviderType>((import.meta.env.VITE_DEFAULT_PROVIDER as ProviderType) || 'ollama');
  const [apiKey, setApiKey] = useState('');
  const [proxyUrl, setProxyUrl] = useState(import.meta.env.VITE_DEFAULT_PROXY_URL || '');
  const [baseUrl, setBaseUrl] = useState(import.meta.env.VITE_DEFAULT_LLM_BASE_URL || 'http://localhost:11434');
  const [model, setModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [server, setServer] = useState<BrowserMcpServer | null>(null);
  const [toolsPanelOpen, setToolsPanelOpen] = useState(true);
  const [sessionUserId, setSessionUserId] = useState('');
  const [sessionPassword, setSessionPassword] = useState('');
  const [sessionLoginType, setSessionLoginType] = useState('');
  const [sessionLoginEndpoint, setSessionLoginEndpoint] = useState('');
  const [soapEndpoint, setSoapEndpoint] = useState('');
  const [sessionHeaderNs, setSessionHeaderNs] = useState('');
  const [sessionStatus, setSessionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [schemaOverrides, setSchemaOverrides] = useState<Record<string, any>>({});
  const [editingSchema, setEditingSchema] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [nsOverrides, setNsOverrides] = useState<Record<string, string>>({});

  // Load config on mount
  useEffect(() => {
    storage.get<string>('provider').then((val) => val && setProvider(val as ProviderType));
    storage.get<string>('apiKey').then((val) => val && setApiKey(val));
    storage.get<string>('proxyUrl').then((val) => val && setProxyUrl(val));
    storage.get<string>('baseUrl').then((val) => val && setBaseUrl(val));
    storage.get<string>('model').then((val) => val && setModel(val));
    storage.get<string>('customModel').then((val) => val && setCustomModel(val));
    storage.get<string>('sessionUserId').then((val) => val && setSessionUserId(val));
    storage.get<string>('sessionPassword').then((val) => val && setSessionPassword(val));
    storage.get<string>('sessionLoginType').then((val) => val && setSessionLoginType(val));
    storage.get<string>('sessionLoginEndpoint').then((val) => val && setSessionLoginEndpoint(val));
    storage.get<string>('soapEndpoint').then((val) => val && setSoapEndpoint(val));
    storage.get<string>('sessionHeaderNs').then((val) => val && setSessionHeaderNs(val));
    storage.get<Record<string, any>>('schemaOverrides').then((val) => val && setSchemaOverrides(val));
    storage.get<Record<string, string>>('nsOverrides').then((val) => val && setNsOverrides(val));
  }, []);

  // Save config on change
  useEffect(() => { storage.set('provider', provider); }, [provider]);
  useEffect(() => { if (apiKey) storage.set('apiKey', apiKey); }, [apiKey]);
  useEffect(() => { if (proxyUrl) storage.set('proxyUrl', proxyUrl); }, [proxyUrl]);
  useEffect(() => { if (baseUrl) storage.set('baseUrl', baseUrl); }, [baseUrl]);
  useEffect(() => { if (model) storage.set('model', model); }, [model]);
  useEffect(() => { if (customModel) storage.set('customModel', customModel); }, [customModel]);
  useEffect(() => { if (sessionUserId) storage.set('sessionUserId', sessionUserId); }, [sessionUserId]);
  useEffect(() => { if (sessionPassword) storage.set('sessionPassword', sessionPassword); }, [sessionPassword]);
  useEffect(() => { storage.set('sessionLoginType', sessionLoginType); }, [sessionLoginType]);
  useEffect(() => { storage.set('sessionLoginEndpoint', sessionLoginEndpoint); }, [sessionLoginEndpoint]);
  useEffect(() => { storage.set('soapEndpoint', soapEndpoint); }, [soapEndpoint]);
  useEffect(() => { storage.set('sessionHeaderNs', sessionHeaderNs); }, [sessionHeaderNs]);
  useEffect(() => { storage.set('schemaOverrides', schemaOverrides); }, [schemaOverrides]);
  useEffect(() => { storage.set('nsOverrides', nsOverrides); }, [nsOverrides]);

  // Init server
  useEffect(() => {
    if (wsdlDefinitions.length > 0) {
      console.log(`[TryItOutStep] Initializing BrowserMcpServer with ${wsdlDefinitions.length} WSDL definitions, ${xsdSchemas.length} XSD schemas`);
      const s = new BrowserMcpServer(wsdlDefinitions, xsdSchemas);
      s.onSessionChange = () => setSessionStatus(s.getSessionStatus());
      setServer(s);
      setSessionStatus('disconnected');
    } else {
      console.log(`[TryItOutStep] No WSDL definitions available`);
      setServer(null);
      setSessionStatus('disconnected');
    }
  }, [wsdlDefinitions, xsdSchemas]);

  // Apply endpoint override — saved soapEndpoint takes priority over config.baseUrl
  useEffect(() => {
    if (!server) return;
    server.setEndpointOverride(soapEndpoint || config.baseUrl || null);
  }, [server, soapEndpoint, config.baseUrl]);

  // Apply SOAP version override from Configure step
  useEffect(() => {
    if (!server) return;
    server.setSoapVersionOverride(config.soapVersion || null);
  }, [server, config.soapVersion]);

  // Apply namespace overrides
  useEffect(() => {
    if (!server) return;
    server.setNamespaceOverrides(nsOverrides);
  }, [server, nsOverrides]);

  // Wire session config into server whenever server or credentials change
  useEffect(() => {
    if (!server || config.authType !== 'session' || !config.sessionConfig) return;
    const sessionCfg: PlaygroundSessionConfig = {
      loginOperation: config.sessionConfig.loginOperation,
      sessionHeaderNamespace: sessionHeaderNs || config.sessionConfig.sessionHeaderNamespace,
      loginEndpoint: sessionLoginEndpoint || undefined,
    };
    const creds: PlaygroundSessionCredentials = {
      userId: sessionUserId,
      password: sessionPassword,
      loginType: sessionLoginType,
    };
    server.setSessionConfig(sessionCfg, creds);
  }, [server, config, sessionUserId, sessionPassword, sessionLoginType, sessionLoginEndpoint, sessionHeaderNs]);

  // Get tools list for display
  const { tools, warnings } = useMemo(() => {
    if (!server) return { tools: [] as Tool[], warnings: [] as string[] };
    return server.getTools();
  }, [server]);

  // Get discovered namespaces from the server
  const discoveredNamespaces = useMemo(() => {
    if (!server) return { wsdlNamespaces: [], elementNamespaces: [] };
    return server.getDiscoveredNamespaces();
  }, [server]);

  const allNamespaces = useMemo(() => {
    return [...discoveredNamespaces.wsdlNamespaces, ...discoveredNamespaces.elementNamespaces];
  }, [discoveredNamespaces]);

  // Apply schema overrides to tools for display and LLM usage
  const effectiveTools = useMemo(() => {
    return tools.map(t => {
      const override = schemaOverrides[t.name];
      if (!override) return t;
      return { ...t, inputSchema: override };
    });
  }, [tools, schemaOverrides]);

  const startEditing = useCallback((toolName: string) => {
    const override = schemaOverrides[toolName];
    const tool = tools.find(t => t.name === toolName);
    const schema = override || tool?.inputSchema || {};
    setEditingSchema(toolName);
    setEditBuffer(JSON.stringify(schema, null, 2));
    setEditError(null);
  }, [schemaOverrides, tools]);

  const saveSchema = useCallback(() => {
    if (!editingSchema) return;
    try {
      const parsed = JSON.parse(editBuffer);
      setSchemaOverrides(prev => ({ ...prev, [editingSchema]: parsed }));
      setEditingSchema(null);
      setEditError(null);
    } catch (e: any) {
      setEditError(e.message);
    }
  }, [editingSchema, editBuffer]);

  const resetSchema = useCallback((toolName: string) => {
    setSchemaOverrides(prev => {
      const next = { ...prev };
      delete next[toolName];
      return next;
    });
    if (editingSchema === toolName) setEditingSchema(null);
  }, [editingSchema]);

  // Tool names to hide from the LLM when session auth is configured (login/logout are auto-managed)
  const hiddenToolNames = useMemo(() => {
    if (!server || config.authType !== 'session' || !config.sessionConfig) return undefined;
    const ops = [config.sessionConfig.loginOperation, config.sessionConfig.logoutOperation].filter(Boolean);
    return server.getToolNamesForOperations(ops);
  }, [server, config]);

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
            {effectiveTools.length > 0 && (
              <span className="tools-count-badge">{effectiveTools.length}</span>
            )}
            {Object.keys(schemaOverrides).length > 0 && (
              <span className="tools-count-badge" style={{ background: 'var(--warning)', color: '#000', marginLeft: '4px' }}>
                {Object.keys(schemaOverrides).length} overridden
              </span>
            )}
          </summary>

          {effectiveTools.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No tools discovered. Go to the Upload step to add WSDL files.
            </p>
          ) : (
            <div className="tools-list">
              {effectiveTools.map((tool, i) => (
                <div key={i} className={`tool-item${schemaOverrides[tool.name] ? ' tool-item--overridden' : ''}`}>
                  <div className="tool-item-header">
                    <code className="tool-item-name">{tool.name}</code>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {schemaOverrides[tool.name] && (
                        <button
                          className="schema-action-btn schema-action-btn--reset"
                          onClick={() => resetSchema(tool.name)}
                          title="Reset to original WSDL schema"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        className="schema-action-btn"
                        onClick={() => editingSchema === tool.name ? setEditingSchema(null) : startEditing(tool.name)}
                        title="Edit input schema JSON"
                      >
                        {editingSchema === tool.name ? 'Cancel' : 'Edit Schema'}
                      </button>
                      {tool.inputSchema?.properties && (
                        <span className="tool-item-params">
                          {Object.keys(tool.inputSchema.properties).length} params
                        </span>
                      )}
                    </div>
                  </div>
                  {tool.description && (
                    <p className="tool-item-desc">{tool.description}</p>
                  )}
                  {editingSchema === tool.name ? (
                    <div className="schema-editor">
                      <textarea
                        className="schema-editor-textarea"
                        value={editBuffer}
                        onChange={e => { setEditBuffer(e.target.value); setEditError(null); }}
                        spellCheck={false}
                      />
                      {editError && (
                        <p style={{ color: 'var(--error)', fontSize: '0.8rem', margin: '4px 0 0' }}>Invalid JSON: {editError}</p>
                      )}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={saveSchema}>
                          Save Override
                        </button>
                        <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={() => setEditingSchema(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                      {tool.outputSchema?.properties && Object.keys(tool.outputSchema.properties).length > 0 && (
                        <details className="tool-response-details">
                          <summary>
                            Response fields ({Object.keys(tool.outputSchema.properties).length})
                          </summary>
                          <div className="tool-item-schema">
                            {Object.entries(tool.outputSchema.properties).map(([key, val]: [string, any]) => (
                              <span key={key} className="tool-param-tag">
                                {key}
                                {val.type && <span className="tool-param-type">: {val.type}</span>}
                              </span>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
      </div>

      {/* Warnings Panel */}
      {warnings.length > 0 && (
        <div className="config-panel warnings-panel" style={{ marginBottom: '0' }}>
          <details>
            <summary style={{ fontSize: '0.95rem', fontWeight: '600' }}>
              WSDL Warnings
              <span className="warnings-count-badge">{warnings.length}</span>
            </summary>
            <ul className="warnings-list">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Connection Settings (always visible, persisted) */}
      <div className="config-panel" style={{ marginBottom: '0' }}>
        <details open={!!soapEndpoint || !!sessionLoginEndpoint || !!sessionHeaderNs}>
          <summary style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '15px' }}>
            Connection Settings
            {(soapEndpoint || sessionLoginEndpoint) && <span className="tools-count-badge" style={{ background: 'var(--success, #22c55e)' }}>saved</span>}
          </summary>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            These settings are saved in your browser and persist across sessions.
          </p>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>SOAP Endpoint URL:</label>
            <input
              type="text"
              value={soapEndpoint}
              onChange={e => setSoapEndpoint(e.target.value)}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              placeholder={config.baseUrl || 'https://api.example.com/soap'}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Overrides the endpoint from the WSDL and Configure step
            </span>
          </div>
          {config.authType === 'session' && (
            <>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>
                  Auth Endpoint <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>(if different from service endpoint)</span>:
                </label>
                <input
                  type="text"
                  value={sessionLoginEndpoint}
                  onChange={e => setSessionLoginEndpoint(e.target.value)}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  placeholder={soapEndpoint || config.baseUrl || 'https://...'}
                />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>Session Header Namespace:</label>
                <input
                  type="text"
                  value={sessionHeaderNs}
                  onChange={e => setSessionHeaderNs(e.target.value)}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  placeholder={config.sessionConfig?.sessionHeaderNamespace || 'http://example.com/session'}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Namespace for the session SOAP header block
                </span>
              </div>
            </>
          )}

          {/* Namespace Overrides */}
          {allNamespaces.length > 0 && (
            <details className="ns-overrides-section">
              <summary style={{ fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', color: 'var(--text-muted)' }}>
                Namespace Overrides
                {Object.keys(nsOverrides).length > 0 && (
                  <span className="tools-count-badge" style={{ background: 'var(--warning)', color: '#000', marginLeft: '6px' }}>
                    {Object.keys(nsOverrides).length}
                  </span>
                )}
              </summary>
              <div style={{ marginTop: '10px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Override XML namespaces used in SOAP envelopes. Leave blank to use the original.
                </p>
                {allNamespaces.map(ns => (
                  <div key={ns} className="ns-override-row">
                    <div className="ns-override-original" title={ns}>
                      {ns}
                    </div>
                    <input
                      type="text"
                      className="ns-override-input"
                      value={nsOverrides[ns] || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setNsOverrides(prev => {
                          if (!val) {
                            const next = { ...prev };
                            delete next[ns];
                            return next;
                          }
                          return { ...prev, [ns]: val };
                        });
                      }}
                      placeholder="Override namespace URI..."
                    />
                  </div>
                ))}
              </div>
            </details>
          )}
        </details>
      </div>

      {/* Session Credentials (shown only when session auth is configured) */}
      {config.authType === 'session' && config.sessionConfig && (
        <div className="config-panel" style={{ marginBottom: '0' }}>
          <details open>
            <summary style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '15px' }}>
              Session Credentials
              <span className={`session-status-badge session-status-badge--${sessionStatus}`}>
                {sessionStatus === 'connected' ? 'Connected' : sessionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </span>
            </summary>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Login operation: <code>{config.sessionConfig.loginOperation}</code>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>User ID:</label>
                <input
                  type="text"
                  value={sessionUserId}
                  onChange={e => setSessionUserId(e.target.value)}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  placeholder="username"
                  autoComplete="username"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>Password:</label>
                <input
                  type="password"
                  value={sessionPassword}
                  onChange={e => setSessionPassword(e.target.value)}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  placeholder="password"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>Login Type:</label>
                <input
                  type="text"
                  value={sessionLoginType}
                  onChange={e => setSessionLoginType(e.target.value)}
                  style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                  placeholder="e.g. CreateSession, STANDARD"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={() => { server?.clearSession(); setSessionStatus('disconnected'); }}
                  style={{ padding: '8px 16px', fontSize: '0.85rem', cursor: 'pointer' }}
                  title="Force a fresh login on the next tool call"
                >
                  Reset Session
                </button>
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              Login happens automatically before the first tool call. Click "Reset Session" to force re-login.
            </p>
          </details>
        </div>
      )}

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
                placeholder="https://your-cors-proxy.example.com"
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
          hiddenToolNames={hiddenToolNames}
          schemaOverrides={schemaOverrides}
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
