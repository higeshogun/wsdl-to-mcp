import type { WsdlDefinition } from '../types/wsdl-types';

/**
 * Patches a WSDL file by injecting a <wsdl:service> element when one is absent
 * (e.g. commented out). node-soap requires a service element to expose OperationAsync
 * methods; without it all client method slots remain undefined.
 */
export function patchWsdlWithServiceElement(
  wsdlContent: string,
  wsdl: Pick<WsdlDefinition, 'bindings' | 'namespaces' | 'targetNamespace'>,
): string {
  // Detect namespace prefixes from the declarations map
  const { namespaces, targetNamespace, bindings } = wsdl;

  const wsdlPrefix =
    Object.entries(namespaces).find(([, v]) => v === 'http://schemas.xmlsoap.org/wsdl/')?.[0] ??
    'wsdl';
  const soapPrefix =
    Object.entries(namespaces).find(([, v]) => v === 'http://schemas.xmlsoap.org/wsdl/soap/')?.[0] ??
    Object.entries(namespaces).find(([, v]) => v === 'http://schemas.xmlsoap.org/wsdl/soap12/')?.[0] ??
    'soap';
  const tnsPrefix =
    Object.entries(namespaces).find(([, v]) => v === targetNamespace)?.[0] ?? 'tns';

  // Strip XML comments before checking for an existing service element
  const noComments = wsdlContent.replace(/<!--[\s\S]*?-->/g, '');
  const serviceTagRe = wsdlPrefix
    ? new RegExp(`<${wsdlPrefix}:service[\\s>]`)
    : /<service[\s>]/;

  if (serviceTagRe.test(noComments)) {
    // Already has an uncommented service element — leave the file alone
    return wsdlContent;
  }

  if (bindings.length === 0) {
    // Nothing to inject
    return wsdlContent;
  }

  // Build one <wsdl:port> per binding
  const wPfx = wsdlPrefix ? `${wsdlPrefix}:` : '';
  const sPfx = soapPrefix ? `${soapPrefix}:` : '';
  const tPfx = tnsPrefix ? `${tnsPrefix}:` : '';

  const ports = bindings
    .map(
      b =>
        `  <${wPfx}port binding="${tPfx}${b.name}" name="${b.name}Port">\n` +
        `    <${sPfx}address location="https://placeholder/" />\n` +
        `  </${wPfx}port>`,
    )
    .join('\n');

  const serviceElement = `<${wPfx}service name="GeneratedService">\n${ports}\n</${wPfx}service>\n`;

  // Inject immediately before the closing </wsdl:definitions>
  const closingTag = wsdlPrefix ? `</${wsdlPrefix}:definitions>` : `</definitions>`;
  if (!wsdlContent.includes(closingTag)) {
    // Fallback: just append
    return wsdlContent + '\n' + serviceElement;
  }
  return wsdlContent.replace(closingTag, serviceElement + closingTag);
}
