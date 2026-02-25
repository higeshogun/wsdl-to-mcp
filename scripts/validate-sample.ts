/**
 * Quick validation script — run with: npx tsx scripts/validate-sample.ts
 * Tests the parser + generator against the sampleupload/ files.
 */

// Polyfill DOMParser for Node.js — must come before any parser imports
import { DOMParser as XmldomParser } from '@xmldom/xmldom';

// Patch Element.prototype.children — xmldom 0.8 does not implement it
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
    // Shim querySelector for the parsererror pattern used in xml-parser.ts
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

import * as fs from 'fs';
import * as path from 'path';
import { parseAllFiles } from '../src/parser/schema-resolver';
import { generateProject } from '../src/codegen/project-generator';
import { defaultConfig } from '../src/types/project-config';

const SAMPLE_DIR = path.join(import.meta.dirname, '../sampleupload');

// ── Load files ────────────────────────────────────────────────────────────────
const files = new Map<string, string>();
for (const name of fs.readdirSync(SAMPLE_DIR)) {
  const full = path.join(SAMPLE_DIR, name);
  if (fs.statSync(full).isFile()) {
    files.set(name, fs.readFileSync(full, 'utf8'));
  }
}
console.log('Loaded files:', [...files.keys()]);

// ── Parse ─────────────────────────────────────────────────────────────────────
const { wsdlDefinitions, xsdSchemas, errors } = parseAllFiles(files);

if (errors.length) {
  console.error('Parse errors:', errors);
  process.exit(1);
}

console.log(`\nParsed ${wsdlDefinitions.length} WSDL(s), ${xsdSchemas.length} XSD(s)`);
for (const w of wsdlDefinitions) {
  console.log(`  [${w.sourceFile}]  portTypes: ${w.portTypes.map(p => p.name).join(', ')}`);
}

// ── Generate ──────────────────────────────────────────────────────────────────
const config = {
  ...defaultConfig(),
  projectName: 'test-project',
  toolPrefix: 'cxw',
  authType: 'session' as const,
};

const generated = generateProject(wsdlDefinitions, xsdSchemas, config);
const byPath = new Map(generated.map(f => [f.path, f.content]));

// ── Checks ────────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}${detail ? `: ${detail}` : ''}`);
    fail++;
  }
}

console.log('\n── sourceFile tracking ──');
check(
  'All WSDLs have sourceFile set',
  wsdlDefinitions.every(w => !!w.sourceFile),
  wsdlDefinitions.filter(w => !w.sourceFile).map(w => w.targetNamespace).join(', '),
);
check(
  'SharedMessages.wsdl sourceFile is correct',
  wsdlDefinitions.some(w => w.sourceFile === 'SharedMessages.wsdl'),
);
check(
  'CreditQueryService.wsdl sourceFile is correct',
  wsdlDefinitions.some(w => w.sourceFile === 'CreditQueryService.wsdl'),
);

console.log('\n── client-factory.ts WSDL paths ──');
const factory = byPath.get('src/soap/client-factory.ts') ?? '';
check(
  'References SharedMessages.wsdl (not AuthenticationPortType.wsdl)',
  factory.includes('SharedMessages.wsdl') && !factory.includes('AuthenticationPortType.wsdl'),
);
check(
  'References CreditQueryService.wsdl (not CreditQueryPortType.wsdl)',
  factory.includes('CreditQueryService.wsdl') && !factory.includes('CreditQueryPortType.wsdl'),
);

console.log('\n── .env.example ──');
const env = byPath.get('.env.example') ?? '';
check('Has BASE_URL', env.includes('CXW_BASE_URL'));
check('Has AUTH_URL', env.includes('CXW_AUTH_URL'));
check('Has USER_ID', env.includes('CXW_USER_ID'));
check('Has PASSWORD', env.includes('CXW_PASSWORD'));

console.log('\n── index.ts client wiring ──');
const index = byPath.get('src/index.ts') ?? '';
check('Auth client uses AUTH_URL', index.includes('CXW_AUTH_URL'));
check('Business client uses BASE_URL', index.includes('CXW_BASE_URL'));

console.log('\n── error-handler.ts regex escape ──');
const eh = byPath.get('src/utils/error-handler.ts') ?? '';
check(
  'Regex uses <\\/title> (escaped forward slash)',
  eh.includes('<\\/title>'),
  'found: ' + (eh.match(/title[^)]{0,20}/)?.[0] ?? 'not found'),
);
check(
  'Regex does NOT contain </title> (unescaped)',
  !eh.includes('</title>'),
);

console.log('\n── boolean defaults ──');
// Check all tool files for string "false"/"true" defaults on boolean fields
const toolFiles = generated.filter(f => f.path.startsWith('src/tools/') && f.path.endsWith('.ts') && !f.path.endsWith('registry.ts'));
const badBooleans = toolFiles.flatMap(f => {
  const matches = [...f.content.matchAll(/z\.boolean\(\)[^;]*\.default\("(true|false)"\)/g)];
  return matches.map(m => `${f.path}: ${m[0]}`);
});
check(
  'No boolean fields with string defaults',
  badBooleans.length === 0,
  badBooleans.join('\n    '),
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
