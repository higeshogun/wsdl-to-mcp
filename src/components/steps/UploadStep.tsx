import { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/project-store';
import { FileDropZone } from '../common/FileDropZone';
import { WsdlUrlLoader } from '../common/WsdlUrlLoader';
import { WORKER_SCRIPT } from '../common/cors-proxy-worker';
import { IndexedDBStorage } from '../playground/IndexedDBStorage';

const storage = new IndexedDBStorage();

export function UploadStep() {
  const { files, addFiles, removeFile, clearFiles, parseErrors, wsdlDefinitions } =
    useProjectStore();
  const [proxyUrl, setProxyUrl] = useState(import.meta.env.VITE_DEFAULT_PROXY_URL || '');

  useEffect(() => {
    storage.get<string>('proxyUrl').then((val) => {
      if (val) setProxyUrl(val);
    });
  }, []);

  useEffect(() => {
    if (proxyUrl) storage.set('proxyUrl', proxyUrl);
  }, [proxyUrl]);

  const totalOps = wsdlDefinitions.reduce(
    (sum, w) => sum + w.portTypes.reduce((s, pt) => s + pt.operations.length, 0),
    0,
  );
  const totalServices = wsdlDefinitions.reduce(
    (sum, w) => sum + w.services.length,
    0,
  );

  return (
    <div className="step-content">
      <h2>Upload WSDL & XSD Files</h2>
      <p>
        Drop your SOAP web service definition files (.wsdl) and schema files (.xsd),
        or load from a URL.
      </p>

      <FileDropZone onFilesAdded={addFiles} />

      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Or load from URL</h3>

        <WsdlUrlLoader onLoaded={addFiles} proxyUrl={proxyUrl} />

        <div style={{ marginTop: '12px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 500 }}>
            CORS Proxy URL (required for cross-origin WSDL URLs):
          </label>
          <input
            type="text"
            value={proxyUrl}
            onChange={e => setProxyUrl(e.target.value)}
            style={{ width: '100%', padding: '8px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px' }}
            placeholder="https://your-cors-proxy.example.com"
          />
          <details style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--primary-hover)', fontSize: '0.85rem' }}>
              How to setup a Cloudflare Worker Proxy
            </summary>
            <div style={{ marginTop: '8px', padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
              <ol style={{ paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                <li>Go to <strong>dash.cloudflare.com</strong> and sign up (free)</li>
                <li>Navigate to <strong>Workers & Pages</strong> and create a new Worker</li>
                <li>Replace the default code with the script below and click <strong>Deploy</strong></li>
                <li>Copy your worker URL (e.g. <code>https://my-proxy.username.workers.dev</code>) and paste it above</li>
              </ol>
              <pre style={{ overflowX: 'auto', fontSize: '12px', marginTop: '8px' }}>{WORKER_SCRIPT}</pre>
            </div>
          </details>
        </div>
      </div>

      {files.size > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <h3>Uploaded Files ({files.size})</h3>
            <button className="btn-text" onClick={clearFiles}>Clear all</button>
          </div>
          <ul>
            {Array.from(files.keys()).map(name => (
              <li key={name} className="file-item">
                <span className={`file-icon ${name.endsWith('.wsdl') ? 'wsdl' : 'xsd'}`}>
                  {name.endsWith('.wsdl') ? 'WSDL' : 'XSD'}
                </span>
                <span className="file-name">{name}</span>
                <button className="btn-remove" onClick={() => removeFile(name)}>x</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="errors">
          <h3>Parse Errors</h3>
          <ul>
            {parseErrors.map((err, i) => (
              <li key={i} className="error-item">{err}</li>
            ))}
          </ul>
        </div>
      )}

      {totalOps > 0 && (
        <div className="parse-summary">
          Discovered <strong>{totalServices}</strong> service(s) with{' '}
          <strong>{totalOps}</strong> operation(s)
        </div>
      )}
    </div>
  );
}
