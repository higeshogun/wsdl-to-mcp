export interface XmlAttributeInfo {
  /** Namespace URI — when set, the attribute will be qualified with a prefix */
  nsUri?: string;
}

export interface JsonToXmlOptions {
  /** Namespace URI for the root element (used with xmlns= on root when no prefix) */
  namespace?: string;
  /** When true, null/undefined values produce xsi:nil="true" self-closing elements */
  useXsiNil?: boolean;
  /**
   * Namespace prefix to use on elements (e.g. "tns").
   * When set, root element becomes <tns:Root> and children become <tns:Child>.
   * The prefix must be declared elsewhere (e.g. on the SOAP Envelope).
   * When not set, root gets xmlns="namespace" and children are unqualified.
   */
  nsPrefix?: string;
  /**
   * XML attributes to render on the root element.
   * Key = property name (local name). Value = optional namespace info.
   * If XmlAttributeInfo.nsUri is set, the attribute is rendered as prefix:name
   * with an xmlns:prefix declaration added to the element.
   */
  xmlAttributes?: Map<string, XmlAttributeInfo | null>;
}

export function jsonToXml(obj: any, rootName: string, namespace?: string, options?: Omit<JsonToXmlOptions, 'namespace'>): string {
  const opts: JsonToXmlOptions = { ...options, namespace };
  const prefix = opts.nsPrefix;

  // Build XML attribute string and collect namespace declarations
  let attrStr = '';
  const extraNsDecls: string[] = [];
  const attrNsCounter: Map<string, string> = new Map(); // nsUri → prefix

  if (opts.xmlAttributes && obj && typeof obj === 'object') {
    let nsIdx = 0;
    for (const [attrName, attrInfo] of opts.xmlAttributes) {
      if (attrName in obj && obj[attrName] !== undefined && obj[attrName] !== null) {
        if (attrInfo?.nsUri) {
          // If the attribute's namespace matches the element namespace and we already
          // have a prefix for the element, reuse that prefix (e.g. ns2:dslRef).
          // This produces the style: <ns2:DslUpdateRequest ns2:dslRef="1" ...>
          if (opts.nsPrefix && namespace && attrInfo.nsUri === namespace) {
            attrStr += ` ${opts.nsPrefix}:${attrName}="${escapeXml(String(obj[attrName]))}"`;
          } else {
            // Different namespace — assign a stable generated prefix
            let nsPrefix = attrNsCounter.get(attrInfo.nsUri);
            if (!nsPrefix) {
              nsPrefix = `_ns${nsIdx++}`;
              attrNsCounter.set(attrInfo.nsUri, nsPrefix);
              extraNsDecls.push(` xmlns:${nsPrefix}="${escapeXml(attrInfo.nsUri)}"`);
            }
            attrStr += ` ${nsPrefix}:${attrName}="${escapeXml(String(obj[attrName]))}"`;
          }
        } else {
          attrStr += ` ${attrName}="${escapeXml(String(obj[attrName]))}"`;
        }
      }
    }
  }

  const nsStr = extraNsDecls.join('');

  // Build child content excluding attribute properties
  const childObj = opts.xmlAttributes && obj && typeof obj === 'object'
    ? Object.fromEntries(Object.entries(obj).filter(([k]) => !opts.xmlAttributes!.has(k)))
    : obj;

  let xml = '';
  if (prefix) {
    // Declare xmlns:prefix="namespace" on the root element so the prefix is in scope
    // for both the element, its children, and namespace-qualified attributes.
    const prefixDecl = namespace ? ` xmlns:${prefix}="${escapeXml(namespace)}"` : '';
    xml += `<${prefix}:${rootName}${prefixDecl}${attrStr}${nsStr}>`;
    xml += buildXmlContent(childObj, opts);
    xml += `</${prefix}:${rootName}>`;
  } else if (namespace) {
    xml += `<${rootName} xmlns="${namespace}"${attrStr}${nsStr}>`;
    xml += buildXmlContent(childObj, opts);
    xml += `</${rootName}>`;
  } else {
    xml += `<${rootName}${attrStr}${nsStr}>`;
    xml += buildXmlContent(childObj, opts);
    xml += `</${rootName}>`;
  }

  return xml;
}

function buildXmlContent(obj: any, opts: JsonToXmlOptions): string {
  let xml = '';
  if (obj === null || obj === undefined) {
    return '';
  }

  if (typeof obj !== 'object') {
    return escapeXml(String(obj));
  }

  if (Array.isArray(obj)) {
    throw new Error("Arrays should be handled by the caller when generating XML for specific keys.");
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (Array.isArray(value)) {
        if (value.length === 0) {
          // Empty arrays produce no elements (valid for minOccurs=0)
          continue;
        }
        for (const item of value) {
          xml += buildElement(key, item, opts);
        }
      } else {
        xml += buildElement(key, value, opts);
      }
    }
  }
  return xml;
}

function buildElement(key: string, value: any, opts: JsonToXmlOptions): string {
  const prefix = opts.nsPrefix;
  const tag = prefix ? `${prefix}:${key}` : key;

  // Handle null/undefined with xsi:nil
  if (value === null || value === undefined) {
    if (opts.useXsiNil) {
      return `<${tag} xsi:nil="true"/>`;
    }
    return `<${tag}/>`;
  }
  return `<${tag}>${buildXmlContent(value, opts)}</${tag}>`;
}

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
    return c;
  });
}
