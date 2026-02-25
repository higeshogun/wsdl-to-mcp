import type { WsdlDefinition } from '../types/wsdl-types';

/**
 * Patches XSD content to replace types that node-soap doesn't recognise as
 * primitives and would crash trying to resolve in undefined schema namespaces.
 *
 * Known gaps in node-soap's Primitives list:
 *   anySimpleType → treated as anyType (both mean "accept any simple value")
 */
export function patchXsdContent(xsdContent: string): string {
  return xsdContent
    .replace(/\banySimpleType\b/g, 'anyType')
    // node-soap applies a namespace prefix to locally-scoped elements/attributes when
    // elementFormDefault="qualified" but never declares that prefix in the SOAP envelope,
    // causing ElementPrefixUnbound parse errors on the server.  Downgrade to "unqualified"
    // so that local names are sent without a prefix.
    .replace(/\belementFormDefault="qualified"/g, 'elementFormDefault="unqualified"');
}

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

  // Remove <wsdl:import> elements that pull in other .wsdl files before injecting.
  //
  // When an imported WSDL also has a service element (injected or original), node-soap
  // loads it as a fully independent sub-WSDL during processIncludes.  That sub-WSDL
  // runs its own postProcess against its own isolated definitions, which can fail if it
  // references schemas from the parent WSDL that haven't been loaded yet.
  //
  // Removing WSDL-file imports is safe here because:
  //  - Only input/output messages are postProcessed; fault messages (which often live in
  //    shared WSDLs) are skipped by node-soap's OperationElement.postProcess.
  //  - The auth service uses its own standalone WSDL and is unaffected.
  //  - Schema XSD imports/includes (inside <wsdl:types>) are left intact.
  const wPfx = wsdlPrefix ? `${wsdlPrefix}:` : '';
  const sPfx = soapPrefix ? `${soapPrefix}:` : '';
  const tPfx = tnsPrefix ? `${tnsPrefix}:` : '';

  // Match self-closing or paired <wsdl:import ...location="*.wsdl"...>
  const wsdlImportRe = new RegExp(
    `<${wPfx}import\\b[^>]*location=["'][^"']*\\.wsdl["'][^>]*/?>`,
    'gi',
  );
  const stripped = wsdlContent.replace(wsdlImportRe, '');

  // Build one <wsdl:port> per binding.
  // Use a service name derived from the first binding so that importing WSDLs
  // don't collide when they each inject their own "GeneratedService" element.
  const serviceName = bindings[0].name + 'Service';

  const ports = bindings
    .map(
      b =>
        `  <${wPfx}port binding="${tPfx}${b.name}" name="${b.name}Port">\n` +
        `    <${sPfx}address location="https://placeholder/" />\n` +
        `  </${wPfx}port>`,
    )
    .join('\n');

  const serviceElement = `<${wPfx}service name="${serviceName}">\n${ports}\n</${wPfx}service>\n`;

  // Inject immediately before the closing </wsdl:definitions>
  const closingTag = wsdlPrefix ? `</${wsdlPrefix}:definitions>` : `</definitions>`;
  if (!stripped.includes(closingTag)) {
    // Fallback: just append
    return stripped + '\n' + serviceElement;
  }
  return stripped.replace(closingTag, serviceElement + closingTag);
}
