import { useProjectStore } from '../../store/project-store';
import { sanitizeNpmName } from '../../codegen/name-utils';

export function ConfigureStep() {
  const { config, updateConfig, wsdlDefinitions } = useProjectStore();

  const allOperations = wsdlDefinitions.flatMap(w =>
    w.portTypes.flatMap(pt => pt.operations.map(op => op.name)),
  );

  return (
    <div className="step-content">
      <h2>Configure Project</h2>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="projectName">Project Name</label>
          <input
            id="projectName"
            type="text"
            value={config.projectName}
            onChange={e => updateConfig({ projectName: sanitizeNpmName(e.target.value) })}
            placeholder="mcp-my-service"
          />
          <span className="form-hint">npm-compatible package name</span>
        </div>

        <div className="form-group">
          <label htmlFor="toolPrefix">Tool Name Prefix</label>
          <input
            id="toolPrefix"
            type="text"
            value={config.toolPrefix}
            onChange={e => updateConfig({ toolPrefix: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
            placeholder="api"
          />
          <span className="form-hint">All tools will be named prefix_operation_name</span>
        </div>

        <div className="form-group full-width">
          <label htmlFor="description">Description</label>
          <input
            id="description"
            type="text"
            value={config.projectDescription}
            onChange={e => updateConfig({ projectDescription: e.target.value })}
            placeholder="MCP server for My SOAP Service"
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="baseUrl">SOAP Endpoint Base URL</label>
          <input
            id="baseUrl"
            type="text"
            value={config.baseUrl}
            onChange={e => updateConfig({ baseUrl: e.target.value })}
            placeholder="https://api.example.com/soap"
          />
        </div>

        <div className="form-group full-width">
          <label>Authentication Type</label>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                name="authType"
                value="none"
                checked={config.authType === 'none'}
                onChange={() => updateConfig({ authType: 'none' })}
              />
              <span>None</span>
              <span className="radio-desc">No authentication required</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="authType"
                value="basic"
                checked={config.authType === 'basic'}
                onChange={() => updateConfig({ authType: 'basic' })}
              />
              <span>Basic Auth</span>
              <span className="radio-desc">Username/password credentials in env vars</span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="authType"
                value="session"
                checked={config.authType === 'session'}
                onChange={() => updateConfig({ authType: 'session' })}
              />
              <span>Session-based</span>
              <span className="radio-desc">Login/logout with session tokens and auto-refresh</span>
            </label>
          </div>
        </div>

        {config.authType === 'session' && (
          <>
            <div className="form-group">
              <label htmlFor="loginOp">Login Operation</label>
              <select
                id="loginOp"
                value={config.sessionConfig?.loginOperation || ''}
                onChange={e =>
                  updateConfig({
                    sessionConfig: {
                      ...config.sessionConfig!,
                      loginOperation: e.target.value,
                      logoutOperation: config.sessionConfig?.logoutOperation || '',
                      sessionHeaderNamespace: config.sessionConfig?.sessionHeaderNamespace || '',
                      userIdField: config.sessionConfig?.userIdField || 'userID',
                      passwordField: config.sessionConfig?.passwordField || 'password',
                    },
                  })
                }
              >
                <option value="">Select...</option>
                {allOperations.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="logoutOp">Logout Operation</label>
              <select
                id="logoutOp"
                value={config.sessionConfig?.logoutOperation || ''}
                onChange={e =>
                  updateConfig({
                    sessionConfig: {
                      ...config.sessionConfig!,
                      logoutOperation: e.target.value,
                    },
                  })
                }
              >
                <option value="">Select...</option>
                {allOperations.map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>

            <div className="form-group full-width">
              <label htmlFor="sessionNs">Session Header Namespace</label>
              <input
                id="sessionNs"
                type="text"
                value={config.sessionConfig?.sessionHeaderNamespace || ''}
                onChange={e =>
                  updateConfig({
                    sessionConfig: {
                      ...config.sessionConfig!,
                      sessionHeaderNamespace: e.target.value,
                    },
                  })
                }
                placeholder="http://example.com/session"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
