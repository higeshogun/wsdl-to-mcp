# Future Improvements

## Developer Configuration via Environment Variables

Currently, personal defaults (CORS proxy URL, LLM base URL, default provider) are hardcoded
in the `development` branch and kept local-only to avoid exposing them in the public repo.

A cleaner approach would be to move these into a `.env.local` file (already gitignored via
`*.local`) so the `development` branch can be safely pushed:

```
VITE_DEFAULT_PROVIDER=llamacpp
VITE_DEFAULT_PROXY_URL=https://your-cors-proxy.example.com
VITE_DEFAULT_LLM_BASE_URL=https://your-llm-server.example.com
VITE_ALLOWED_HOST=your-domain.example.com
```

Then read them in code:

```ts
// TryItOutStep.tsx / UploadStep.tsx
const [proxyUrl, setProxyUrl] = useState(import.meta.env.VITE_DEFAULT_PROXY_URL ?? '');

// vite.config.ts
server: {
  allowedHosts: import.meta.env.VITE_ALLOWED_HOST
    ? [import.meta.env.VITE_ALLOWED_HOST]
    : [],
}
```

`.env.local` is already in `.gitignore` by default (via the `*.local` rule), so personal
values stay off GitHub while the branch itself becomes shareable.
