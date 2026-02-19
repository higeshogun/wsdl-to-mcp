import { useState } from 'react';

const EXAMPLE_WSDL_URLS = [
  { name: 'Calculator', url: 'http://www.dneonline.com/calculator.asmx?WSDL', desc: 'Add, Subtract, Multiply, Divide' },
  { name: 'Country Info', url: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL', desc: 'Capital, currency, flag, phone code' },
  { name: 'Number Conversion', url: 'https://www.dataaccess.com/webservicesserver/numberconversion.wso?WSDL', desc: 'Number to words, dollar amount' },
  { name: 'Hello Service', url: 'https://apps.learnwebservices.com/services/hello?WSDL', desc: 'Simple hello/welcome message' },
];

interface WsdlUrlLoaderProps {
  onLoaded: (files: { name: string; content: string }[]) => void;
  proxyUrl?: string;
}

export function WsdlUrlLoader({ onLoaded, proxyUrl }: WsdlUrlLoaderProps) {
  const [wsdlUrl, setWsdlUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWsdlFromUrl = async (url: string) => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      let fetchUrl = url;
      if (proxyUrl) {
        const proxy = new URL(proxyUrl);
        proxy.searchParams.set('url', url);
        fetchUrl = proxy.toString();
      }

      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();

      if (!content.trim().startsWith('<')) {
        throw new Error('Response does not appear to be valid XML/WSDL');
      }

      const urlObj = new URL(url);
      let filename = urlObj.pathname.split('/').pop() || 'service';
      if (!filename.endsWith('.wsdl') && !filename.endsWith('.xsd')) {
        filename = filename.replace(/\?.*$/, '') + '.wsdl';
      }

      onLoaded([{ name: filename, content }]);
      setWsdlUrl('');
    } catch (err: any) {
      setError(err.message);
      console.error('Error loading WSDL from URL:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          type="text"
          value={wsdlUrl}
          onChange={e => setWsdlUrl(e.target.value)}
          style={{ flex: 1, padding: '8px' }}
          placeholder="https://example.com/service?WSDL"
          disabled={loading}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); loadWsdlFromUrl(wsdlUrl); } }}
        />
        <button
          className="btn-primary"
          onClick={() => loadWsdlFromUrl(wsdlUrl)}
          disabled={loading || !wsdlUrl.trim()}
          style={{ padding: '8px 16px' }}
        >
          {loading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: '0.85rem', color: 'var(--error)', marginBottom: '12px' }}>
          Error: {error}
        </p>
      )}

      <div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Try an example{!proxyUrl && ' (set up a CORS proxy first for cross-origin URLs)'}:
        </p>
        <div className="example-wsdl-grid">
          {EXAMPLE_WSDL_URLS.map(ex => (
            <button
              key={ex.url}
              className="example-wsdl-btn"
              onClick={() => loadWsdlFromUrl(ex.url)}
              disabled={loading}
              title={ex.url}
            >
              <span className="example-wsdl-name">{ex.name}</span>
              <span className="example-wsdl-desc">{ex.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
