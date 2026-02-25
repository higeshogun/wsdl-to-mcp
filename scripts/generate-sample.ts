/**
 * Generates the CreditQueryService MCP server from sampleupload/ WSDLs
 * and writes the result to sampleupload/CreditQueryService/.
 *
 * Run with: npx tsx scripts/generate-sample.ts
 */

// ── DOMParser polyfill (must come before any parser imports) ──────────────────
import { DOMParser as XmldomParser } from '@xmldom/xmldom';

const _probeDoc = new XmldomParser().parseFromString('<r><c/></r>', 'text/xml');
const _ElementProto = Object.getPrototypeOf(_probeDoc.documentElement);
if (!_ElementProto.children) {
  Object.defineProperty(_ElementProto, 'children', {
    get(this: any) {
      const out: any[] = [];
      for (let i = 0; i < this.childNodes.length; i++) {
        if (this.childNodes[i].nodeType === 1) out.push(this.childNodes[i]);
      }
      return out;
    },
  });
}
class NodeDOMParser {
  parseFromString(text: string, contentType: string) {
    const errors: string[] = [];
    const parser = new XmldomParser({
      errorHandler: {
        error: (msg: string) => errors.push(msg),
        fatalError: (msg: string) => errors.push(msg),
      },
    });
    const doc = parser.parseFromString(text, contentType as any);
    (doc as any).querySelector = (selector: string) => {
      if (selector === 'parsererror') {
        return errors.length > 0 ? { textContent: errors.join('\n') } : null;
      }
      return null;
    };
    return doc;
  }
}
(globalThis as any).DOMParser = NodeDOMParser;
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { parseAllFiles } from '../src/parser/schema-resolver';
import { generateProject } from '../src/codegen/project-generator';

const SAMPLE_DIR = path.join(import.meta.dirname, '../sampleupload');
const OUT_DIR    = path.join(SAMPLE_DIR, 'CreditQueryService');

// ── Load source files ─────────────────────────────────────────────────────────
const rawFiles = new Map<string, string>();
for (const name of fs.readdirSync(SAMPLE_DIR)) {
  const full = path.join(SAMPLE_DIR, name);
  if (fs.statSync(full).isFile()) {
    rawFiles.set(name, fs.readFileSync(full, 'utf8'));
  }
}
console.log('Loaded source files:', [...rawFiles.keys()]);

// ── Parse (only WSDL/XSD files) ──────────────────────────────────────────────
const parseFiles = new Map(
  [...rawFiles].filter(([name]) => /\.(wsdl|xsd)$/i.test(name)),
);
const { wsdlDefinitions, xsdSchemas, errors } = parseAllFiles(parseFiles);

if (errors.length) {
  console.error('Parse errors:', errors);
  process.exit(1);
}
console.log(`\nParsed ${wsdlDefinitions.length} WSDL(s), ${xsdSchemas.length} XSD(s)`);
for (const w of wsdlDefinitions) {
  console.log(`  [${w.sourceFile}]  portTypes: ${w.portTypes.map(p => p.name).join(', ')}`);
  console.log(`    bindings: ${w.bindings.map(b => b.name).join(', ')}`);
}

// ── Config matching the .env file ────────────────────────────────────────────
const config = {
  projectName: 'CreditQueryService',
  projectDescription: 'MCP server for Currenex Credit Query SOAP API',
  toolPrefix: 'CQ',
  baseUrl: 'https://integration2-dl.currenex.com/webservice/request/CreditQueryService',
  authUrl: 'https://integration2-dl.currenex.com/webservice/request/AuthenticationService',
  authType: 'session' as const,
  sessionConfig: {
    loginOperation: 'Login',
    logoutOperation: 'Logout',
    sessionHeaderNamespace: 'http://currenex.com/webservice/shared',
    userIdField: 'userID',
    passwordField: 'password',
  },
  soapVersion: '1.1' as const,
  envVars: [],
  schemaOverrides: {},
};

// ── Generate ──────────────────────────────────────────────────────────────────
// Pass WSDL + XSD raw content so the generator can patch both
const wsdlAndXsdRaw = new Map([...rawFiles].filter(([name]) => /\.(wsdl|xsd)$/i.test(name)));
const generated = generateProject(wsdlDefinitions, xsdSchemas, config, {}, wsdlAndXsdRaw);
console.log(`\nGenerated ${generated.length} files`);

// ── Write files ───────────────────────────────────────────────────────────────
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const file of generated) {
  const dest = path.join(OUT_DIR, file.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, file.content, 'utf8');
  console.log('  wrote:', file.path);
}

// XSD files are now included in `generated` as patched wsdl/*.xsd entries

// Copy .env
const envSrc = path.join(SAMPLE_DIR, '.env');
if (fs.existsSync(envSrc)) {
  fs.copyFileSync(envSrc, path.join(OUT_DIR, '.env'));
  console.log('  copied: .env');
}

console.log('\nDone. Project written to:', OUT_DIR);
