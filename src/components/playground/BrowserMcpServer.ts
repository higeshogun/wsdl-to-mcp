import type { WsdlDefinition, WsdlOperation, WsdlMessage } from '../../types/wsdl-types';
import type { XsdSchema } from '../../types/xsd-types';
import { TypeRegistry } from '../../parser/type-registry';
import { getLocalName } from '../../parser/xml-parser';
import { operationToToolName, operationToDescription } from '../../codegen/name-utils';
import { elementToJsonSchema } from '../../codegen/json-schema-mapper';
import { jsonToXml } from '../../utils/json-to-xml';

export interface Tool {
  name: string;
  description?: string;
  inputSchema: any;
}

interface ToolInfo {
  op: WsdlOperation;
  serviceName: string;
  inputMessage: WsdlMessage | undefined;
  endpoint: string;
  targetNamespace: string;
}

export class BrowserMcpServer {
  private registry: TypeRegistry;
  private tools: Map<string, ToolInfo>;
  private wsdlDefinitions: WsdlDefinition[];

  constructor(
    wsdlDefinitions: WsdlDefinition[],
    xsdSchemas: XsdSchema[]
  ) {
    this.wsdlDefinitions = wsdlDefinitions;
    this.registry = new TypeRegistry();
    xsdSchemas.forEach(s => this.registry.addSchema(s));
    this.tools = new Map();
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

            tools.push({ name: toolName, description: desc, inputSchema });
            console.log(`[BrowserMcpServer] ✓ Tool created: ${toolName}`);
            
            this.tools.set(toolName, {
              op,
              serviceName: portType.name,
              inputMessage,
              endpoint: 'http://localhost:8080/soap', // Default endpoint
              targetNamespace: def.targetNamespace
            });
          }
        }
      }

      const processedPortTypes = new Set<string>();

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

             // Skip duplicate portTypes (e.g., SOAP 1.1 and 1.2 share the same portType)
             // Prefer the first port encountered (typically SOAP 1.1)
             const portTypeKey = `${service.name}:${portType.name}`;
             if (processedPortTypes.has(portTypeKey)) {
               console.log(`[BrowserMcpServer]       ⏭ Skipping duplicate portType: ${portType.name} (already processed via another port)`);
               continue;
             }
             processedPortTypes.add(portTypeKey);

             console.log(`[BrowserMcpServer]       PortType: ${portType.name}, operations: ${portType.operations.length}`);

             for (const op of portType.operations) {
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

                tools.push({ name: toolName, description: desc, inputSchema });
                console.log(`[BrowserMcpServer]         ✓ Tool created: ${toolName}`);
                this.tools.set(toolName, { 
                    op, 
                    serviceName: service.name, 
                    inputMessage, 
                    endpoint: port.soapAddress,
                    targetNamespace: def.targetNamespace
                });
             }
        }
      }
    }
    console.log(`[BrowserMcpServer] ✓ Total tools discovered: ${tools.length}`, tools.map(t => `"${t.name}"`).join(', '));
    return tools;
  }

  async callTool(name: string, args: any, proxyUrl: string): Promise<string> {
    const toolInfo = this.tools.get(name);
    if (!toolInfo) throw new Error(`Tool ${name} not found`);

    const { op, inputMessage, endpoint, targetNamespace } = toolInfo;
    
    let rootName = op.name;
    let namespace = targetNamespace;
    
    if (inputMessage && inputMessage.parts.length > 0) {
        const part = inputMessage.parts[0];
        if (part.element) {
            rootName = getLocalName(part.element);
            // Ideally we get namespace from the element definition
        }
    }

    const soapBody = jsonToXml(args, rootName, namespace);
    
    const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${namespace}">
   <soapenv:Header/>
   <soapenv:Body>
      ${soapBody}
   </soapenv:Body>
</soapenv:Envelope>`;

    // Use proxy
    // We expect the proxy to forward the request to the target URL.
    // Common pattern: POST proxyUrl?url=encodedTarget
    
    const target = new URL(proxyUrl);
    target.searchParams.set('url', endpoint);

    try {
        const response = await fetch(target.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': '', // Simple SOAP 1.1 action
            },
            body: envelope
        });

        if (!response.ok) {
            throw new Error(`SOAP Request failed: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        return text;
    } catch (err: any) {
        throw new Error(`Failed to call tool: ${err.message}`);
    }
  }
}
