import type { ServiceClientInfo } from '../../types/codegen-types';
import type { ProjectConfig } from '../../types/project-config';
import type { TypeRegistry } from '../../parser/type-registry';
import { buildSampleSoapEnvelope, getRequiredFields, getConstrainedFields } from '../sample-value-generator';
import { toSnakeCase } from '../name-utils';

/**
 * Generates a Python pytest regression test script.
 * Tests smoke, negative, and boundary scenarios for each operation.
 */
export function generatePytestTests(
  services: ServiceClientInfo[],
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const imports = `import pytest
import requests
from typing import Dict, Any
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

BASE_URL = os.getenv('BASE_URL', '${config.baseUrl}')
SOAP_ACTION_HEADER = 'SOAPAction'
`;

  const testClasses = services.map(service => generatePytestClass(service, config, registry)).join('\n\n');

  return `${imports}

${testClasses}
`;
}

function generatePytestClass(
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const className = `${service.serviceName.replace(/Service$/, '')}Tests`;
  const testMethods = service.operations.map(op => generatePytestMethods(op, service, config, registry)).join('\n\n');

  return `class ${className}:
    """Regression tests for ${service.serviceName}"""

    @pytest.fixture
    def soap_client(self):
        return SoapClient(BASE_URL)

${testMethods}`;
}

function generatePytestMethods(
  operation: ServiceClientInfo['operations'][0],
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const inputElement = operation.inputElementName ? registry.resolveElement(operation.inputElementName) : undefined;
  const requiredFields = getRequiredFields(inputElement, registry);
  const constrainedFields = getConstrainedFields(inputElement, registry);

  const methods: string[] = [];

  // Smoke test
  const smokeEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion);
  methods.push(`    def test_${toSnakeCase(operation.name)}_smoke(self, soap_client):
        """Smoke test: Basic functionality with valid inputs"""
        payload = """${smokeEnvelope}"""
        response = soap_client.call('${operation.name}', payload, '${operation.name}')
        assert response.status_code == 200
        # Add specific assertions based on expected response structure`);

  // Negative tests - missing required fields
  for (const field of requiredFields) {
    const omitEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, field.name);
    methods.push(`    def test_${toSnakeCase(operation.name)}_missing_${toSnakeCase(field.name)}(self, soap_client):
        """Negative test: Missing required field ${field.name}"""
        payload = """${omitEnvelope}"""
        response = soap_client.call('${operation.name}', payload, '${operation.name}')
        # Should return SOAP fault or validation error
        assert response.status_code in [400, 500]`);
  }

  // Boundary tests - constrained fields
  for (const field of constrainedFields) {
    if (field.minLength !== undefined) {
      const shortValue = 'x'.repeat(Math.max(0, field.minLength - 1));
      const shortEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: shortValue });
      methods.push(`    def test_${toSnakeCase(operation.name)}_${toSnakeCase(field.name)}_too_short(self, soap_client):
        """Boundary test: ${field.name} too short (minLength: ${field.minLength})"""
        payload = """${shortEnvelope}"""
        response = soap_client.call('${operation.name}', payload, '${operation.name}')
        assert response.status_code in [400, 500]`);
    }

    if (field.maxLength !== undefined) {
      const longValue = 'x'.repeat(field.maxLength + 1);
      const longEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: longValue });
      methods.push(`    def test_${toSnakeCase(operation.name)}_${toSnakeCase(field.name)}_too_long(self, soap_client):
        """Boundary test: ${field.name} too long (maxLength: ${field.maxLength})"""
        payload = """${longEnvelope}"""
        response = soap_client.call('${operation.name}', payload, '${operation.name}')
        assert response.status_code in [400, 500]`);
    }

    if (field.enumerations && field.enumerations.length > 0) {
      const invalidEnum = 'INVALID_ENUM_VALUE';
      const invalidEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: invalidEnum });
      methods.push(`    def test_${toSnakeCase(operation.name)}_${toSnakeCase(field.name)}_invalid_enum(self, soap_client):
        """Boundary test: ${field.name} invalid enum value"""
        payload = """${invalidEnvelope}"""
        response = soap_client.call('${operation.name}', payload, '${operation.name}')
        assert response.status_code in [400, 500]`);
    }
  }

  return methods.join('\n\n');
}

// Simple SOAP client helper class
const soapClientHelper = `
class SoapClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()

    def call(self, operation: str, payload: str, soap_action: str) -> requests.Response:
        headers = {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': soap_action
        }
        return self.session.post(self.base_url, data=payload, headers=headers)
`;

export function generatePytestTestsWithClient(
  services: ServiceClientInfo[],
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  return generatePytestTests(services, config, registry) + '\n\n' + soapClientHelper;
}