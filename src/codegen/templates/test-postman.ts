import type { ServiceClientInfo } from '../../types/codegen-types';
import type { ProjectConfig } from '../../types/project-config';
import type { TypeRegistry } from '../../parser/type-registry';
import { buildSampleSoapEnvelope, getRequiredFields, getConstrainedFields } from '../sample-value-generator';

/**
 * Generates a Postman Collection v2.1 JSON for regression testing.
 * Includes smoke, negative, and boundary test scenarios.
 */
export function generatePostmanCollection(
  services: ServiceClientInfo[],
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const collection = {
    info: {
      name: `${config.projectName} Regression Tests`,
      description: `Automated regression tests for ${config.projectDescription}`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: services.flatMap(service => generateServiceItems(service, config, registry)),
    variable: [
      {
        key: 'baseUrl',
        value: config.baseUrl,
        type: 'string',
      },
    ],
  };

  return JSON.stringify(collection, null, 2);
}

function generateServiceItems(
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): any[] {
  return service.operations.flatMap(operation => generateOperationItems(operation, service, config, registry));
}

function generateOperationItems(
  operation: ServiceClientInfo['operations'][0],
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): any[] {
  const inputElement = operation.inputElementName ? registry.resolveElement(operation.inputElementName) : undefined;
  const items: any[] = [];

  // Smoke test
  const smokeEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion);

  items.push({
    name: `${operation.name} - Smoke Test`,
    request: {
      method: 'POST',
      header: [
        {
          key: 'Content-Type',
          value: 'text/xml; charset=utf-8',
        },
        {
          key: 'SOAPAction',
          value: operation.name,
        },
      ],
      body: {
        mode: 'raw',
        raw: smokeEnvelope,
      },
      url: {
        raw: '{{baseUrl}}',
        host: ['{{baseUrl}}'],
      },
    },
    event: [
      {
        listen: 'test',
        script: {
          exec: [
            'pm.test("Status code is 200", function () {',
            '    pm.response.to.have.status(200);',
            '});',
            '',
            'pm.test("Response has SOAP body", function () {',
            '    var jsonData = xml2Json(pm.response.text());',
            '    pm.expect(jsonData).to.have.property("soap:Envelope");',
            '});',
          ],
          type: 'text/javascript',
        },
      },
    ],
  });

  // Negative tests - missing required fields
  const requiredFields = getRequiredFields(inputElement, registry);
  for (const field of requiredFields) {
    const omitEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, field.name);

    items.push({
      name: `${operation.name} - Missing ${field.name}`,
      request: {
        method: 'POST',
        header: [
          {
            key: 'Content-Type',
            value: 'text/xml; charset=utf-8',
          },
          {
            key: 'SOAPAction',
            value: operation.name,
          },
        ],
        body: {
          mode: 'raw',
          raw: omitEnvelope,
        },
        url: {
          raw: '{{baseUrl}}',
          host: ['{{baseUrl}}'],
        },
      },
      event: [
        {
          listen: 'test',
          script: {
            exec: [
              'pm.test("Should return error for missing required field", function () {',
              '    pm.expect(pm.response.code).to.be.oneOf([400, 500]);',
              '});',
              '',
              'pm.test("Response contains SOAP fault", function () {',
              '    var jsonData = xml2Json(pm.response.text());',
              '    pm.expect(jsonData["soap:Envelope"]["soap:Body"]).to.have.property("soap:Fault");',
              '});',
            ],
            type: 'text/javascript',
          },
        },
      ],
    });
  }

  // Boundary tests - constrained fields
  const constrainedFields = getConstrainedFields(inputElement, registry);
  for (const field of constrainedFields) {
    if (field.minLength !== undefined) {
      const shortValue = 'x'.repeat(Math.max(0, field.minLength - 1));
      const shortEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: shortValue });

      items.push({
        name: `${operation.name} - ${field.name} Too Short`,
        request: {
          method: 'POST',
          header: [
            {
              key: 'Content-Type',
              value: 'text/xml; charset=utf-8',
            },
            {
              key: 'SOAPAction',
              value: operation.name,
            },
          ],
          body: {
            mode: 'raw',
            raw: shortEnvelope,
          },
          url: {
            raw: '{{baseUrl}}',
            host: ['{{baseUrl}}'],
          },
        },
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                'pm.test("Should reject too short value", function () {',
                '    pm.expect(pm.response.code).to.be.oneOf([400, 500]);',
                '});',
              ],
              type: 'text/javascript',
            },
          },
        ],
      });
    }

    if (field.maxLength !== undefined) {
      const longValue = 'x'.repeat(field.maxLength + 1);
      const longEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: longValue });

      items.push({
        name: `${operation.name} - ${field.name} Too Long`,
        request: {
          method: 'POST',
          header: [
            {
              key: 'Content-Type',
              value: 'text/xml; charset=utf-8',
            },
            {
              key: 'SOAPAction',
              value: operation.name,
            },
          ],
          body: {
            mode: 'raw',
            raw: longEnvelope,
          },
          url: {
            raw: '{{baseUrl}}',
            host: ['{{baseUrl}}'],
          },
        },
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                'pm.test("Should reject too long value", function () {',
                '    pm.expect(pm.response.code).to.be.oneOf([400, 500]);',
                '});',
              ],
              type: 'text/javascript',
            },
          },
        ],
      });
    }

    if (field.enumerations && field.enumerations.length > 0) {
      const invalidEnum = 'INVALID_ENUM_VALUE';
      const invalidEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: invalidEnum });

      items.push({
        name: `${operation.name} - ${field.name} Invalid Enum`,
        request: {
          method: 'POST',
          header: [
            {
              key: 'Content-Type',
              value: 'text/xml; charset=utf-8',
            },
            {
              key: 'SOAPAction',
              value: operation.name,
            },
          ],
          body: {
            mode: 'raw',
            raw: invalidEnvelope,
          },
          url: {
            raw: '{{baseUrl}}',
            host: ['{{baseUrl}}'],
          },
        },
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                'pm.test("Should reject invalid enum value", function () {',
                '    pm.expect(pm.response.code).to.be.oneOf([400, 500]);',
                '});',
              ],
              type: 'text/javascript',
            },
          },
        ],
      });
    }
  }

  return items;
}