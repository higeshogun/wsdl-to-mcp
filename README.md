# WSDL to MCP

A browser-based tool that converts SOAP/WSDL service definitions into fully-typed [Model Context Protocol (MCP)](https://modelcontextprotocol.io) projects — ready to drop into any MCP-compatible AI agent.

## What it does

Point it at a WSDL file (local or URL) and it generates a complete, runnable MCP server project:

- Parses WSDL and XSD schemas, resolving imports and complex type hierarchies
- Maps SOAP operations to MCP tools with typed input/output schemas (Zod + JSON Schema)
- Generates a TypeScript MCP project with session management, XML↔JSON conversion, and error handling
- Includes an in-browser playground to test the generated tools against a live LLM

## Getting started

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

## How to use

1. **Upload** — Drop a `.wsdl` file or load one from a URL (with optional CORS proxy)
2. **Configure** — Set the project name, target namespace, and which operations to include
3. **Review** — Preview all generated files before downloading
4. **Download** — Get a ZIP of the complete MCP project
5. **Try it out** — Test your tools interactively in the browser playground

## Generated project

The downloaded ZIP contains a ready-to-run MCP server with:

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP server entry point |
| `src/tools/` | One file per SOAP operation, with Zod schemas |
| `src/lib/client-factory.ts` | SOAP HTTP client |
| `src/lib/xml-to-json.ts` | XML↔JSON conversion |
| `src/lib/session-manager.ts` | WS-Security session handling |
| `src/lib/header-builder.ts` | SOAP header construction |
| `.env.example` | Environment variable reference |

## Playground LLM providers

The in-browser playground supports:

| Provider | Auth | Notes |
|----------|------|-------|
| **Ollama** | None | Local; default `http://localhost:11434`. Run with `OLLAMA_ORIGINS=* ollama serve` |
| **llama.cpp** | None | Local; default `http://localhost:8080`. Needs CORS enabled |
| **Anthropic** | API key | Requires a CORS proxy (browser → API) |
| **Google Gemini** | API key | Requires a CORS proxy (browser → API) |

### CORS proxy

For cloud providers (Anthropic, Gemini), the browser can't call their APIs directly due to CORS. The app includes a Cloudflare Worker script you can deploy as your own proxy — see the **CORS Proxy** section in the Upload step UI.

## Building

```bash
npm run build
```

Output goes to `dist/`.

## Tech stack

- **React 19** + **TypeScript**
- **Vite** — build tooling
- **Zustand** — state management
- **jszip** + **file-saver** — ZIP generation and download
- **highlight.js** — code preview syntax highlighting
- No backend — entirely client-side

## License

MIT
