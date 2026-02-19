import type {
  WsdlDefinition, WsdlService, WsdlServicePort, WsdlPortType,
  WsdlOperation, WsdlBinding, WsdlBindingOperation, WsdlMessage, WsdlMessagePart,
} from '../types/wsdl-types';
import { collectNamespaces, getChildElements, getFirstChildElement, getLocalName } from './xml-parser';

const WSDL_NS = 'http://schemas.xmlsoap.org/wsdl/';
const SOAP_NS = 'http://schemas.xmlsoap.org/wsdl/soap/';
const SOAP12_NS = 'http://schemas.xmlsoap.org/wsdl/soap12/';

export function parseWsdl(doc: Document): WsdlDefinition {
  const root = doc.documentElement;
  const targetNamespace = root.getAttribute('targetNamespace') || '';
  const namespaces = collectNamespaces(root);

  const messages = parseMessages(root);
  const portTypes = parsePortTypes(root);
  const bindings = parseBindings(root);
  const services = parseServices(root);

  return { targetNamespace, namespaces, services, portTypes, bindings, messages };
}

function parseMessages(root: Element): WsdlMessage[] {
  return getChildElements(root, 'message', WSDL_NS).map(el => {
    const name = el.getAttribute('name') || '';
    const parts: WsdlMessagePart[] = getChildElements(el, 'part', WSDL_NS).map(partEl => ({
      name: partEl.getAttribute('name') || '',
      element: partEl.getAttribute('element') || undefined,
      type: partEl.getAttribute('type') || undefined,
    }));
    return { name, parts };
  });
}

function parsePortTypes(root: Element): WsdlPortType[] {
  return getChildElements(root, 'portType', WSDL_NS).map(ptEl => {
    const name = ptEl.getAttribute('name') || '';
    const operations: WsdlOperation[] = getChildElements(ptEl, 'operation', WSDL_NS).map(opEl => {
      const opName = opEl.getAttribute('name') || '';
      const inputEl = getFirstChildElement(opEl, 'input', WSDL_NS);
      const outputEl = getFirstChildElement(opEl, 'output', WSDL_NS);

      const inputMessage = inputEl?.getAttribute('message') || '';
      const outputMessage = outputEl?.getAttribute('message') || '';

      const faultMessages = getChildElements(opEl, 'fault', WSDL_NS).map(fEl => ({
        name: fEl.getAttribute('name') || '',
        message: fEl.getAttribute('message') || '',
      }));

      const docEl = getFirstChildElement(opEl, 'documentation', WSDL_NS);
      const documentation = docEl?.textContent?.trim() || undefined;

      return { name: opName, inputMessage, outputMessage, faultMessages, documentation };
    });
    return { name, operations };
  });
}

function parseBindings(root: Element): WsdlBinding[] {
  return getChildElements(root, 'binding', WSDL_NS).map(bindEl => {
    const name = bindEl.getAttribute('name') || '';
    const typeName = bindEl.getAttribute('type') || '';
    const portTypeName = getLocalName(typeName);

    const soapBindEl =
      getFirstChildElement(bindEl, 'binding', SOAP_NS) ||
      getFirstChildElement(bindEl, 'binding', SOAP12_NS);
    const soapStyle = (soapBindEl?.getAttribute('style') || 'document') as 'document' | 'rpc';

    const operations: WsdlBindingOperation[] = getChildElements(bindEl, 'operation', WSDL_NS).map(opEl => {
      const opName = opEl.getAttribute('name') || '';
      const soapOpEl =
        getFirstChildElement(opEl, 'operation', SOAP_NS) ||
        getFirstChildElement(opEl, 'operation', SOAP12_NS);
      const soapAction = soapOpEl?.getAttribute('soapAction') || undefined;
      return { name: opName, soapAction };
    });

    return { name, portTypeName, soapStyle, operations };
  });
}

function parseServices(root: Element): WsdlService[] {
  return getChildElements(root, 'service', WSDL_NS).map(svcEl => {
    const name = svcEl.getAttribute('name') || '';
    const ports: WsdlServicePort[] = getChildElements(svcEl, 'port', WSDL_NS).map(portEl => {
      const portName = portEl.getAttribute('name') || '';
      const binding = portEl.getAttribute('binding') || '';
      const addrEl =
        getFirstChildElement(portEl, 'address', SOAP_NS) ||
        getFirstChildElement(portEl, 'address', SOAP12_NS);
      const soapAddress = addrEl?.getAttribute('location') || '';
      return { name: portName, bindingName: getLocalName(binding), soapAddress };
    });
    return { name, ports };
  });
}
