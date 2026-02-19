export function parseXml(xmlText: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const errorNode = doc.querySelector('parsererror');
  if (errorNode) {
    throw new Error(`XML parse error: ${errorNode.textContent}`);
  }
  return doc;
}

export function getLocalName(qualifiedName: string): string {
  const idx = qualifiedName.indexOf(':');
  return idx >= 0 ? qualifiedName.substring(idx + 1) : qualifiedName;
}

export function getPrefix(qualifiedName: string): string {
  const idx = qualifiedName.indexOf(':');
  return idx >= 0 ? qualifiedName.substring(0, idx) : '';
}

export function getChildElements(parent: Element, localName: string, ns?: string): Element[] {
  const results: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    const childLocal = child.localName || getLocalName(child.tagName);
    if (childLocal === localName && (!ns || child.namespaceURI === ns)) {
      results.push(child);
    }
  }
  return results;
}

export function getFirstChildElement(parent: Element, localName: string, ns?: string): Element | null {
  const children = getChildElements(parent, localName, ns);
  return children.length > 0 ? children[0] : null;
}

export function collectNamespaces(el: Element): Record<string, string> {
  const ns: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name.startsWith('xmlns:')) {
      ns[attr.name.substring(6)] = attr.value;
    } else if (attr.name === 'xmlns') {
      ns[''] = attr.value;
    }
  }
  return ns;
}
