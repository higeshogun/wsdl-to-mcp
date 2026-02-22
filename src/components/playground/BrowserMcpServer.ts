import type { WsdlDefinition, WsdlOperation, WsdlMessage } from '../../types/wsdl-types';
import type { XsdSchema } from '../../types/xsd-types';
import { TypeRegistry } from '../../parser/type-registry';
import { getLocalName } from '../../parser/xml-parser';
import { operationToToolName, operationToDescription } from '../../codegen/name-utils';
import { elementToJsonSchema } from '../../codegen/json-schema-mapper';
import { jsonToXml, escapeXml } from '../../utils/json-to-xml';
import { sanitizeSchema } from './providers/schema-utils';

export interface PlaygroundSessionConfig {
  loginOperation: string;
  sessionHeaderNamespace: string;
  loginEndpoint?: string;
}

export interface PlaygroundSessionCredentials {
  userId: string;
  password: string;
  loginType: string;
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: any;
}

export interface SoapTrafficEntry {
  id: number;
  toolName: string;
  request: string;
  response: string;
  isError: boolean;
  timestamp: Date;
}

interface ToolInfo {
  op: WsdlOperation;
  serviceName: string;
  inputMessage: WsdlMessage | undefined;
  endpoint: string;
  targetNamespace: string;
  soapAction: string;
}

export class BrowserMcpServer {
  private registry: TypeRegistry;
  private tools: Map<string, ToolInfo>;
  private wsdlDefinitions: WsdlDefinition[];
  private soapTrafficCounter = 0;
  onSoapTraffic?: (entry: SoapTrafficEntry) => void;

  private sessionConfig: PlaygroundSessionConfig | null = null;
  private sessionCredentials: PlaygroundSessionCredentials | null = null;
  private sessionTicket: string | null = null;
  private loginInProgress: Promise<void> | null = null;

  private xsdSchemas: XsdSchema[];
  private elementNamespaceCache = new Map<string, string>();
  private endpointOverride: string | null = null;

  constructor(
    wsdlDefinitions: WsdlDefinition[],
    xsdSchemas: XsdSchema[]
  ) {
    this.wsdlDefinitions = wsdlDefinitions;
    this.xsdSchemas = xsdSchemas;
    this.registry = new TypeRegistry();
    xsdSchemas.forEach(s => {
      this.registry.addSchema(s);
      // Cache element namespaces for fast lookup
      for (const elName of s.elements.keys()) {
        // Align with TypeRegistry behavior (last-wins) to ensure definition and namespace match
        this.elementNamespaceCache.set(elName, s.targetNamespace);
      }
    });
    this.tools = new Map();
  }

  /** Override the SOAP endpoint URL for all tools (replaces the URL from the WSDL). */
  setEndpointOverride(url: string | null): void {
    this.endpointOverride = url || null;
  }

  /** Find the targetNamespace of the XSD schema that defines a given element (by local name). */
  private getElementNamespace(localName: string): string | null {
    return this.elementNamespaceCache.get(localName) || null;
  }

  setSessionConfig(config: PlaygroundSessionConfig, credentials: PlaygroundSessionCredentials): void {
    this.sessionConfig = config;
    this.sessionCredentials = credentials;
    this.sessionTicket = null; // reset session when config changes
  }

  clearSession(): void {
    this.sessionTicket = null;
  }

  /** Return tool names whose underlying operation name matches any of the given operation names. */
  getToolNamesForOperations(operationNames: string[]): Set<string> {
    const result = new Set<string>();
    for (const [toolName, info] of this.tools.entries()) {
      if (operationNames.includes(info.op.name)) {
        result.add(toolName);
      }
    }
    return result;
  }

  private findLoginToolName(): string | null {
    if (!this.sessionConfig) return null;
    const loginOpName = this.sessionConfig.loginOperation;
    for (const [toolName, info] of this.tools.entries()) {
      if (info.op.name === loginOpName) return toolName;
    }
    return null;
  }

  private async ensureSession(proxyUrl: string): Promise<void> {
    if (this.sessionTicket) return;
    if (this.loginInProgress) {
      await this.loginInProgress;
      return;
    }
    this.loginInProgress = this.doLogin(proxyUrl).finally(() => {
      this.loginInProgress = null;
    });
    await this.loginInProgress;
  }

  private async doLogin(proxyUrl: string): Promise<void> {
    const loginToolName = this.findLoginToolName();
    if (!loginToolName) {
      throw new Error(`Login operation '${this.sessionConfig?.loginOperation}' not found in discovered tools`);
    }

    const creds = this.sessionCredentials!;
    const loginArgs: Record<string, string> = {
      userID: creds.userId,
      password: creds.password,
    };
    if (creds.loginType) {
      loginArgs.loginType = creds.loginType;
    }
    const responseXml = await this.callTool(
      loginToolName,
      loginArgs,
      proxyUrl,
      true /* skipSession */
    );

    const parser = new DOMParser();
    const doc = parser.parseFromString(responseXml, 'text/xml');
    const ticketEl =
      doc.querySelector('sessionTicket') ||
      doc.querySelector('ticket') ||
      doc.querySelector('SessionTicket');

    if (!ticketEl?.textContent) {
      throw new Error('Login failed: sessionTicket not found in response. Check credentials and login operation.');
    }
    this.sessionTicket = ticketEl.textContent;
    console.log('[BrowserMcpServer] Login successful, session ticket obtained');
  }

  getTools(): Tool[] {
    const tools: Tool[] = [];
    const toolNamesUsed = new Set<string>();

    const ensureUniqueName = (name: string): string => {
      if (!toolNamesUsed.has(name)) {
        toolNamesUsed.add(name);
        return name;
      }
      // Add counter if duplicate
      let counter = 1;
      while (toolNamesUsed.has(`${name}_${counter}`)) {
        counter++;
      }
      const uniqueName = `${name}_${counter}`;
      toolNamesUsed.add(uniqueName);
      return uniqueName;
    };

    console.log(`[BrowserMcpServer.getTools] Starting with ${this.wsdlDefinitions.length} WSDL definitions`);

    for (const def of this.wsdlDefinitions) {
      console.log(`[BrowserMcpServer] Processing WSDL:`, {
        targetNamespace: def.targetNamespace,
        services: def.services.length,
        portTypes: def.portTypes.length,
        bindings: def.bindings.length,
        messages: def.messages.length
      });

      // If there are no services defined, create tools from portTypes + bindings
      if (def.services.length === 0 && def.portTypes.length > 0) {
        console.log(`[BrowserMcpServer] No services found, using portTypes directly`);

        for (const portType of def.portTypes) {
          console.log(`[BrowserMcpServer] PortType: ${portType.name}, operations: ${portType.operations.length}`);

          for (const op of portType.operations) {
            let toolName = operationToToolName(portType.name, op.name);
            toolName = ensureUniqueName(toolName);
            const desc = op.documentation || operationToDescription(op.name);

            const inputMessage = def.messages.find(m => m.name === getLocalName(op.inputMessage));
            let inputSchema: any = { type: 'object', properties: {}, required: [] };

            if (inputMessage && inputMessage.parts.length > 0) {
              const part = inputMessage.parts[0];
              if (part.element) {
                const el = this.registry.resolveElement(getLocalName(part.element));
                if (el) {
                  const elSchema = elementToJsonSchema(el, this.registry);
                  if (elSchema.type === 'object' && elSchema.properties) {
                    inputSchema = {
                      type: 'object',
                      properties: elSchema.properties,
                      required: elSchema.required || []
                    };
                  } else {
                    inputSchema = {
                      type: 'object',
                      properties: { [part.name]: elSchema },
                      required: [part.name]
                    };
                  }
                }
              } else {
                const properties: Record<string, any> = {};
                const partNames: string[] = [];
                inputMessage.parts.forEach(p => {
                  properties[p.name] = { type: 'string' };
                  partNames.push(p.name);
                });
                inputSchema = { type: 'object', properties, required: partNames };
              }
            }

            tools.push({ name: toolName, description: desc, inputSchema: sanitizeSchema(inputSchema) });

            this.tools.set(toolName, {
              op,
              serviceName: portType.name,
              inputMessage,
              endpoint: 'http://localhost:8080/soap', // Default endpoint
              targetNamespace: def.targetNamespace,
              soapAction: ''
            });
          }
        }
      }

      const processedOperations = new Set<string>();

      for (const service of def.services) {
        console.log(`[BrowserMcpServer]   Service: ${service.name}, ports: ${service.ports.length}`);

        for (const port of service.ports) {
             console.log(`[BrowserMcpServer]     Port: ${port.name}, binding: ${port.bindingName}`);

             const binding = def.bindings.find(b => b.name === getLocalName(port.bindingName));
             if (!binding) {
               console.warn(`[BrowserMcpServer]       ⚠ Binding not found: ${port.bindingName}`);
               continue;
             }

             const portType = def.portTypes.find(pt => pt.name === getLocalName(binding.portTypeName));
             if (!portType) {
               console.warn(`[BrowserMcpServer]       ⚠ PortType not found: ${binding.portTypeName}`);
               continue;
             }

             console.log(`[BrowserMcpServer]       PortType: ${portType.name}, operations: ${portType.operations.length}`);

             for (const op of portType.operations) {
                // Skip if this operation was already added for this service (e.g. via a SOAP 1.2 portType that mirrors SOAP 1.1)
                const opKey = `${service.name}:${op.name}`;
                if (processedOperations.has(opKey)) continue;
                processedOperations.add(opKey);

                let toolName = operationToToolName(service.name, op.name);
                toolName = ensureUniqueName(toolName);
                const desc = op.documentation || operationToDescription(op.name);

                const inputMessage = def.messages.find(m => m.name === getLocalName(op.inputMessage));
                let inputSchema: any = { type: 'object', properties: {}, required: [] };

                if (inputMessage && inputMessage.parts.length > 0) {
                    const part = inputMessage.parts[0];
                    if (part.element) {
                        const el = this.registry.resolveElement(getLocalName(part.element));
                        if (el) {
                            const elSchema = elementToJsonSchema(el, this.registry);
                            // If the element is a complex type, its properties are the arguments.
                            if (elSchema.type === 'object' && elSchema.properties) {
                                inputSchema = {
                                  type: 'object',
                                  properties: elSchema.properties,
                                  required: elSchema.required || []
                                };
                            } else {
                                // If simple or array, wrap it.
                                inputSchema = {
                                    type: 'object',
                                    properties: { [part.name]: elSchema },
                                    required: [part.name]
                                };
                            }
                        }
                    } else {
                         // RPC style, use part names as keys
                         const properties: Record<string, any> = {};
                         const partNames: string[] = [];
                         inputMessage.parts.forEach(p => {
                             properties[p.name] = { type: 'string' };
                             partNames.push(p.name);
                         });
                         inputSchema = { type: 'object', properties, required: partNames };
                    }
                }

                tools.push({ name: toolName, description: desc, inputSchema: sanitizeSchema(inputSchema) });
                const bindingOp = binding.operations.find(bo => bo.name === op.name);
                this.tools.set(toolName, {
                    op,
                    serviceName: service.name,
                    inputMessage,
                    endpoint: port.soapAddress,
                    targetNamespace: def.targetNamespace,
                    soapAction: bindingOp?.soapAction ?? ''
                });
             }
        }
      }
    }
    console.log(`[BrowserMcpServer] ✓ Total tools discovered: ${tools.length}`, tools.map(t => `"${t.name}"`).join(', '));
    return tools;
  }

  async callTool(name: string, args: any, proxyUrl: string, skipSession = false): Promise<string> {
    const toolInfo = this.tools.get(name);
    if (!toolInfo) throw new Error(`Tool ${name} not found`);

    const { op, inputMessage, endpoint, targetNamespace, soapAction } = toolInfo;

    // Build session header if session auth is configured
    let sessionHeaderXml = '';
    if (!skipSession && this.sessionConfig && this.sessionCredentials) {
      await this.ensureSession(proxyUrl);
      if (this.sessionTicket) {
        const ns = this.sessionConfig.sessionHeaderNamespace;
        const uid = escapeXml(this.sessionCredentials.userId);
        const ticket = escapeXml(this.sessionTicket);
        sessionHeaderXml = `<session xmlns="${ns}"><userID>${uid}</userID><sessionTicket>${ticket}</sessionTicket></session>`;
      }
    }

    let rootName = op.name;
    let namespace = targetNamespace;

    if (inputMessage && inputMessage.parts.length > 0) {
        const part = inputMessage.parts[0];
        if (part.element) {
            rootName = getLocalName(part.element);
            namespace = this.getElementNamespace(rootName) ?? targetNamespace;
        }
    }

    const soapBody = jsonToXml(args, rootName, namespace);

    const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
   <soapenv:Header>${sessionHeaderXml}</soapenv:Header>
   <soapenv:Body>
      ${soapBody}
   </soapenv:Body>
</soapenv:Envelope>`;

    // Use proxy
    // We expect the proxy to forward the request to the target URL.
    // Common pattern: POST proxyUrl?url=encodedTarget

    const isLoginOp = this.sessionConfig && name === this.findLoginToolName();
    const effectiveEndpoint = (isLoginOp && this.sessionConfig?.loginEndpoint)
      ? this.sessionConfig.loginEndpoint
      : (this.endpointOverride || endpoint);

    const target = new URL(proxyUrl);
    target.searchParams.set('url', effectiveEndpoint);

    try {
        const response = await fetch(target.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': soapAction,
            },
            body: envelope
        });

        const text = await response.text();
        const trimmedStart = text.slice(0, 200).trim().toLowerCase();
        const isHtml = trimmedStart.startsWith('<!doctype html') || trimmedStart.startsWith('<html');

        this.onSoapTraffic?.({
            id: ++this.soapTrafficCounter,
            toolName: name,
            request: envelope,
            response: text,
            isError: !response.ok || isHtml,
            timestamp: new Date(),
        });

        if (!response.ok) {
            let errorMsg = `SOAP Request failed: ${response.status} ${response.statusText}`;
            if (isHtml) {
                const titleMatch = text.match(/<title>(.*?)<\/title>/i);
                if (titleMatch) {
                    errorMsg += ` (${titleMatch[1].trim()})`;
                }
            }
            throw new Error(errorMsg);
        }

        if (isHtml) {
            const titleMatch = text.match(/<title>(.*?)<\/title>/i);
            const title = titleMatch ? ` (${titleMatch[1].trim()})` : '';
            throw new Error(`Received HTML response instead of SOAP XML${title}. Check endpoint URL.`);
        }

        return text;
    } catch (err: any) {
        throw new Error(`Failed to call tool: ${err.message}`);
    }
  }
}
