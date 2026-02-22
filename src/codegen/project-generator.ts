import type { WsdlDefinition } from '../types/wsdl-types';
import type { XsdSchema } from '../types/xsd-types';
import type { ProjectConfig } from '../types/project-config';
import type { GeneratedFile, ServiceClientInfo, OperationInfo } from '../types/codegen-types';
import { TypeRegistry } from '../parser/type-registry';
import { getLocalName } from '../parser/xml-parser';
import {
  operationToToolName,
  operationToDescription,
  serviceToClientKey,
  serviceToToolFileName,
} from './name-utils';

import { generatePackageJson } from './templates/package-json';
import { generateTsconfigJson } from './templates/tsconfig-json';
import { generateConfigTs } from './templates/config-ts';
import { generateIndexTs } from './templates/index-ts';
import { generateClientFactoryTs } from './templates/client-factory-ts';
import { generateSessionManagerTs } from './templates/session-manager-ts';
import { generateHeaderBuilderTs } from './templates/header-builder-ts';
import { generateErrorHandlerTs } from './templates/error-handler-ts';
import { generateXmlToJsonTs } from './templates/xml-to-json-ts';
import { generateToolFileTs } from './templates/tool-file-ts';
import { generateToolRegistryTs } from './templates/tool-registry-ts';
import { generateEnvExample } from './templates/env-example';
import { generateReadmeMd } from './templates/readme-md';
import { generateSchemaUtilsTs } from './templates/schema-utils-ts';
import { generatePytestTestsWithClient } from './templates/test-pytest';
import { generatePostmanCollection } from './templates/test-postman';
import { generateSoapUIProject } from './templates/test-soapui';
import { generateK6ScriptWithScenarios } from './templates/test-k6';

export function generateProject(
  wsdlDefinitions: WsdlDefinition[],
  xsdSchemas: XsdSchema[],
  config: ProjectConfig,
): GeneratedFile[] {
  const registry = new TypeRegistry();
  for (const schema of xsdSchemas) {
    registry.addSchema(schema);
  }

  const services = buildServiceInfos(wsdlDefinitions, config, registry);
  const files: GeneratedFile[] = [];

  // Static config files
  files.push({ path: 'package.json', content: generatePackageJson(config) });
  files.push({ path: 'tsconfig.json', content: generateTsconfigJson() });
  files.push({ path: '.env.example', content: generateEnvExample(config) });
  files.push({ path: 'README.md', content: generateReadmeMd(config, services) });

  // Utils (always the same pattern)
  files.push({ path: 'src/utils/error-handler.ts', content: generateErrorHandlerTs() });
  files.push({ path: 'src/utils/xml-to-json.ts', content: generateXmlToJsonTs() });
  files.push({ path: 'src/utils/schema-utils.ts', content: generateSchemaUtilsTs() });

  // Config
  files.push({ path: 'src/config.ts', content: generateConfigTs(config) });

  // SOAP client factory
  files.push({ path: 'src/soap/client-factory.ts', content: generateClientFactoryTs(services) });

  // Session management (only if auth type is session)
  if (config.authType === 'session') {
    files.push({ path: 'src/session/session-manager.ts', content: generateSessionManagerTs() });
    files.push({ path: 'src/soap/header-builder.ts', content: generateHeaderBuilderTs(config) });
  }

  // Tool files (one per service)
  for (const service of services) {
    const fileName = serviceToToolFileName(service.serviceName);
    files.push({
      path: `src/tools/${fileName}`,
      content: generateToolFileTs(service, config, registry),
    });
  }

  // Tool registry
  files.push({
    path: 'src/tools/tool-registry.ts',
    content: generateToolRegistryTs(services, config),
  });

  // Test files (if test config is provided)
  if (config.testConfig) {
    if (config.testConfig.formats.includes('pytest')) {
      files.push({
        path: 'tests/test_regression.py',
        content: generatePytestTestsWithClient(services, config, registry),
      });
    }

    if (config.testConfig.formats.includes('postman')) {
      files.push({
        path: 'tests/regression-tests.postman_collection.json',
        content: generatePostmanCollection(services, config, registry),
      });
    }

    if (config.testConfig.formats.includes('soapui')) {
      files.push({
        path: 'tests/regression-tests-soapui-project.xml',
        content: generateSoapUIProject(services, config, registry),
      });
    }

    if (config.testConfig.formats.includes('k6')) {
      files.push({
        path: 'tests/load-test.k6.js',
        content: generateK6ScriptWithScenarios(services, config, registry),
      });
    }
  }

  // Entry point
  files.push({ path: 'src/index.ts', content: generateIndexTs(services, config) });

  return files;
}

function buildServiceInfos(
  wsdlDefinitions: WsdlDefinition[],
  config: ProjectConfig,
  _registry: TypeRegistry,
): ServiceClientInfo[] {
  const services: ServiceClientInfo[] = [];

  for (const wsdl of wsdlDefinitions) {
    // Build message-to-element map
    const messageElements = new Map<string, string>();
    for (const msg of wsdl.messages) {
      for (const part of msg.parts) {
        if (part.element) {
          messageElements.set(msg.name, getLocalName(part.element));
        }
      }
    }

    // Collect all operations from port types
    for (const pt of wsdl.portTypes) {
      // Find matching service/port
      const binding = wsdl.bindings.find(b => b.portTypeName === pt.name);
      let serviceName = pt.name;
      let endpoint = '';
      let wsdlFile = 'service.wsdl';

      if (binding) {
        const svc = wsdl.services.find(s =>
          s.ports.some(p => p.bindingName === binding.name)
        );
        if (svc) {
          serviceName = svc.name;
          const port = svc.ports.find(p => p.bindingName === binding.name);
          endpoint = port?.soapAddress || '';
        }
      }

      // Determine WSDL file name from service name
      wsdlFile = serviceName.replace(/Service$/i, '') + '.wsdl';

      const clientKey = serviceToClientKey(serviceName);
      const operations: OperationInfo[] = pt.operations.map(op => {
        const inputMsgName = getLocalName(op.inputMessage);
        const inputElementName = messageElements.get(inputMsgName);

        return {
          name: op.name,
          toolName: operationToToolName(config.toolPrefix, op.name),
          description: op.documentation || operationToDescription(op.name),
          inputElementName,
          serviceName,
          clientKey,
        };
      });

      services.push({
        serviceName,
        clientKey,
        wsdlFile,
        endpoint,
        operations,
      });
    }
  }

  // Deduplicate services with same name, merging operations without duplicating by name
  const seen = new Map<string, ServiceClientInfo>();
  for (const svc of services) {
    const existing = seen.get(svc.serviceName);
    if (existing) {
      const existingNames = new Set(existing.operations.map(o => o.name));
      for (const op of svc.operations) {
        if (!existingNames.has(op.name)) {
          existing.operations.push(op);
          existingNames.add(op.name);
        }
      }
    } else {
      seen.set(svc.serviceName, svc);
    }
  }

  return Array.from(seen.values());
}
