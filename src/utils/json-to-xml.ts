export function jsonToXml(obj: any, rootName: string, namespace?: string): string {
  let xml = '';
  if (namespace) {
    xml += `<${rootName} xmlns="${namespace}">`;
  } else {
    xml += `<${rootName}>`;
  }

  xml += buildXmlContent(obj);

  xml += `</${rootName}>`;
  return xml;
}

function buildXmlContent(obj: any): string {
  let xml = '';
  if (obj === null || obj === undefined) {
    return '';
  }

  if (typeof obj !== 'object') {
    return escapeXml(String(obj));
  }

  if (Array.isArray(obj)) {
    // Start recursion for array items? No, array usually implies repeated elements with same name in XML.
    // But here we are inside a parent element already.
    // If the parent expected an array, it should have handled it.
    // However, if we are passing an array as value to a key, we need to handle it.
    // Typically in JSON->XML, array items become multiple elements with the key name.
    // But here we don't know the key name.
    // This simple converter might assume the caller handles arrays by iterating.
    throw new Error("Arrays should be handled by the caller when generating XML for specific keys.");
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (Array.isArray(value)) {
        for (const item of value) {
             xml += `<${key}>${buildXmlContent(item)}</${key}>`;
        }
      } else {
        xml += `<${key}>${buildXmlContent(value)}</${key}>`;
      }
    }
  }
  return xml;
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
