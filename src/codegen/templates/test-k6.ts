import type { ServiceClientInfo } from '../../types/codegen-types';
import type { ProjectConfig } from '../../types/project-config';
import type { TypeRegistry } from '../../parser/type-registry';
import { buildSampleSoapEnvelope } from '../sample-value-generator';

/**
 * Generates a k6 load testing script for regression testing.
 * Includes smoke tests and basic load scenarios.
 */
export function generateK6Script(
  services: ServiceClientInfo[],
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const imports = `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    errors: ['rate<0.1'],             // Error rate should be below 10%
  },
};

// Environment variables
const BASE_URL = __ENV.BASE_URL || '${config.baseUrl}';
`;

  const testFunctions = services.map(service => generateK6TestFunction(service, config, registry)).join('\n\n');

  const mainTest = `
export default function () {
${services.map(service => `  test${service.serviceName.replace(/Service$/, '')}();`).join('\n')}
  sleep(1);
}
`;

  return `${imports}

${testFunctions}

${mainTest}
`;
}

function generateK6TestFunction(
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const functionName = `test${service.serviceName.replace(/Service$/, '')}`;
  const operationCalls = service.operations.map((operation: ServiceClientInfo['operations'][0]) => generateK6OperationCall(operation, service, config, registry)).join('\n\n');

  return `function ${functionName}() {
  const params = {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '', // Will be set per operation
    },
  };

${operationCalls}
}`;
}

function generateK6OperationCall(
  operation: ServiceClientInfo['operations'][0],
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const inputElement = operation.inputElementName ? registry.resolveElement(operation.inputElementName) : undefined;
  const sampleEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion);

  return `  // Test ${operation.name}
  params.headers.SOAPAction = '${operation.name}';
  const ${operation.name.toLowerCase()}Payload = \`${sampleEnvelope}\`;

  const ${operation.name.toLowerCase()}Response = http.post(BASE_URL, ${operation.name.toLowerCase()}Payload, params);

  check(${operation.name.toLowerCase()}Response, {
    '${operation.name} status is 200': (r) => r.status === 200,
    '${operation.name} response time < 500ms': (r) => r.timings.duration < 500,
    '${operation.name} has SOAP envelope': (r) => r.body.includes('soap:Envelope'),
    '${operation.name} no SOAP fault': (r) => !r.body.includes('soap:Fault'),
  }) || errorRate.add(1);

  responseTime.add(${operation.name.toLowerCase()}Response.timings.duration);`;
}

/**
 * Generates a more comprehensive k6 script with different test scenarios.
 */
export function generateK6ScriptWithScenarios(
  services: ServiceClientInfo[],
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const imports = `import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// Test configuration
export const options = {
  scenarios: {
    smoke_test: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' },
    },
    load_test: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 10 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '2m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      tags: { test_type: 'load' },
    },
    stress_test: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '1m', target: 300 },
        { duration: '2m', target: 300 },
        { duration: '1m', target: 0 },
      ],
      startTime: '5m',
      tags: { test_type: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

// Environment variables
const BASE_URL = __ENV.BASE_URL || '${config.baseUrl}';
`;

  const testFunctions = services.map(service => generateK6TestFunction(service, config, registry)).join('\n\n');

  const mainTest = `
export default function () {
  const scenario = __ENV.K6_SCENARIO || 'smoke_test';

  switch (scenario) {
    case 'smoke_test':
      runSmokeTests();
      break;
    case 'load_test':
    case 'stress_test':
      runLoadTests();
      break;
    default:
      runSmokeTests();
  }
}

function runSmokeTests() {
${services.map(service => `  test${service.serviceName.replace(/Service$/, '')}();`).join('\n')}
  sleep(1);
}

function runLoadTests() {
  // Random operation selection for load testing
  const operations = [
${services.flatMap(service =>
  service.operations.map((op: ServiceClientInfo['operations'][0]) => `    { name: '${op.name}', service: '${service.serviceName}', payload: get${op.name}Payload() }`)
).join(',\n')}
  ];

  const randomOp = operations[Math.floor(Math.random() * operations.length)];
  const params = {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': randomOp.name,
    },
  };

  const response = http.post(BASE_URL, randomOp.payload, params);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 2000,
    'has SOAP envelope': (r) => r.body.includes('soap:Envelope'),
    'no SOAP fault': (r) => !r.body.includes('soap:Fault'),
  }) || errorRate.add(1);

  responseTime.add(response.timings.duration);
  sleep(randomIntBetween(1, 3));
}
`;

  const payloadFunctions = services.flatMap(service =>
    service.operations.map((operation: ServiceClientInfo['operations'][0]) => generateK6PayloadFunction(operation, service, config, registry))
  ).join('\n\n');

  return `${imports}

${payloadFunctions}

${testFunctions}

${mainTest}
`;
}

function generateK6PayloadFunction(
  operation: ServiceClientInfo['operations'][0],
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const inputElement = operation.inputElementName ? registry.resolveElement(operation.inputElementName) : undefined;
  const sampleEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion);

  return `function get${operation.name}Payload() {
  return \`${sampleEnvelope}\`;
}`;
}