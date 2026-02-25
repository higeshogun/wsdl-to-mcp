import type { XsdSchema } from '../types/xsd-types';
import type { WsdlDefinition } from '../types/wsdl-types';
import { parseXml, getChildElements } from './xml-parser';
import { parseWsdl } from './wsdl-parser';
import { parseXsdSchema } from './xsd-parser';

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';
const WSDL_NS = 'http://schemas.xmlsoap.org/wsdl/';

export interface ParseResult {
  wsdlDefinitions: WsdlDefinition[];
  xsdSchemas: XsdSchema[];
  errors: string[];
}

export function parseAllFiles(files: Map<string, string>): ParseResult {
  const wsdlDefinitions: WsdlDefinition[] = [];
  const xsdSchemas: XsdSchema[] = [];
  const errors: string[] = [];

  for (const [filename, content] of files) {
    try {
      const doc = parseXml(content);
      const rootLocal = doc.documentElement.localName || doc.documentElement.tagName;

      if (filename.endsWith('.wsdl') || rootLocal === 'definitions') {
        const wsdl = parseWsdl(doc);
        wsdl.sourceFile = filename;
        wsdlDefinitions.push(wsdl);

        // Extract inline schemas from <wsdl:types>
        const typesEls = getChildElements(doc.documentElement, 'types', WSDL_NS);
        for (const typesEl of typesEls) {
          for (const schemaEl of getChildElements(typesEl, 'schema', XSD_NS)) {
            xsdSchemas.push(parseXsdSchema(schemaEl));
          }
        }
      } else if (filename.endsWith('.xsd') || rootLocal === 'schema') {
        xsdSchemas.push(parseXsdSchema(doc.documentElement));
      } else {
        errors.push(`${filename}: Unknown file type (expected .wsdl or .xsd)`);
      }
    } catch (err) {
      errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { wsdlDefinitions, xsdSchemas, errors };
}
