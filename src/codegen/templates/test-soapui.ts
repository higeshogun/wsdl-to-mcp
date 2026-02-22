import type { ServiceClientInfo } from '../../types/codegen-types';
import type { ProjectConfig } from '../../types/project-config';
import type { TypeRegistry } from '../../parser/type-registry';
import { buildSampleSoapEnvelope, getRequiredFields, getConstrainedFields } from '../sample-value-generator';

/**
 * Generates a SoapUI project XML for regression testing.
 * Includes test suites with smoke, negative, and boundary test cases.
 */
export function generateSoapUIProject(
  services: ServiceClientInfo[],
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const testSuites = services.map(service => generateSoapUITestSuite(service, config, registry)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<con:soapui-project xmlns:con="http://eviware.com/soapui/config" activeEnvironment="Default" name="${config.projectName} Regression Tests" soapui-version="5.7.0">
  <con:settings/>
  <con:interface xsi:type="con:WsdlInterface" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <con:definition>${config.baseUrl}?wsdl</con:definition>
    <con:name>${config.projectName} Service</con:name>
    <con:endpoint>${config.baseUrl}</con:endpoint>
  </con:interface>
${testSuites}
</con:soapui-project>`;
}

function generateSoapUITestSuite(
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const testCases = service.operations.map(operation => generateSoapUITestCases(operation, service, config, registry)).join('\n');

  return `  <con:testSuite name="${service.serviceName} Test Suite">
    <con:settings/>
    <con:runType>SEQUENTIAL</con:runType>
${testCases}
  </con:testSuite>`;
}

function generateSoapUITestCases(
  operation: ServiceClientInfo['operations'][0],
  service: ServiceClientInfo,
  config: ProjectConfig,
  registry: TypeRegistry,
): string {
  const inputElement = operation.inputElementName ? registry.resolveElement(operation.inputElementName) : undefined;
  const testCases: string[] = [];

  // Smoke test case
  const smokeEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion);

  testCases.push(`    <con:testCase failOnError="true" failTestCaseOnErrors="true" keepSession="false" maxResults="0" name="${operation.name} Smoke Test" searchProperties="true">
      <con:settings/>
      <con:testStep type="request" name="${operation.name} Request">
        <con:settings/>
        <con:config xsi:type="con:RequestConfig" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <con:request><![CDATA[${smokeEnvelope}]]></con:request>
          <con:endpoint>${config.baseUrl}</con:endpoint>
          <con:method>POST</con:method>
          <con:mediaType>text/xml</con:mediaType>
          <con:postQueryString>false</postQueryString>
          <con:timeout>60000</con:timeout>
        </con:config>
      </con:testStep>
      <con:testStep type="assertion" name="Valid HTTP Status Codes">
        <con:settings/>
        <con:config xsi:type="con:SimpleContainsAssertion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <con:token>200</con:token>
          <con:ignoreCase>false</con:ignoreCase>
          <con:useRegexp>false</con:useRegexp>
        </con:config>
      </con:testStep>
      <con:testStep type="assertion" name="SOAP Response">
        <con:settings/>
        <con:config xsi:type="con:SimpleContainsAssertion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <con:token>soap:Envelope</con:token>
          <con:ignoreCase>false</con:ignoreCase>
          <con:useRegexp>false</con:useRegexp>
        </con:config>
      </con:testStep>
    </con:testCase>`);

  // Negative test cases - missing required fields
  const requiredFields = getRequiredFields(inputElement, registry);
  for (const field of requiredFields) {
    const omitEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, field.name);

    testCases.push(`    <con:testCase failOnError="true" failTestCaseOnErrors="true" keepSession="false" maxResults="0" name="${operation.name} Missing ${field.name}" searchProperties="true">
      <con:settings/>
      <con:testStep type="request" name="${operation.name} Request">
        <con:settings/>
        <con:config xsi:type="con:RequestConfig" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <con:request><![CDATA[${omitEnvelope}]]></con:request>
          <con:endpoint>${config.baseUrl}</con:endpoint>
          <con:method>POST</con:method>
          <con:mediaType>text/xml</con:mediaType>
          <con:postQueryString>false</postQueryString>
          <con:timeout>60000</con:timeout>
        </con:config>
      </con:testStep>
      <con:testStep type="assertion" name="SOAP Fault">
        <con:settings/>
        <con:config xsi:type="con:SimpleContainsAssertion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <con:token>soap:Fault</con:token>
          <con:ignoreCase>false</con:ignoreCase>
          <con:useRegexp>false</con:useRegexp>
        </con:config>
      </con:testStep>
    </con:testCase>`);
  }

  // Boundary test cases - constrained fields
  const constrainedFields = getConstrainedFields(inputElement, registry);
  for (const field of constrainedFields) {
    if (field.minLength !== undefined) {
      const shortValue = 'x'.repeat(Math.max(0, field.minLength - 1));
      const shortEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: shortValue });

      testCases.push(`    <con:testCase failOnError="true" failTestCaseOnErrors="true" keepSession="false" maxResults="0" name="${operation.name} ${field.name} Too Short" searchProperties="true">
        <con:settings/>
        <con:testStep type="request" name="${operation.name} Request">
          <con:settings/>
          <con:config xsi:type="con:RequestConfig" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <con:request><![CDATA[${shortEnvelope}]]></con:request>
            <con:endpoint>${config.baseUrl}</con:endpoint>
            <con:method>POST</con:method>
            <con:mediaType>text/xml</con:mediaType>
            <con:postQueryString>false</postQueryString>
            <con:timeout>60000</con:timeout>
          </con:config>
        </con:testStep>
        <con:testStep type="assertion" name="SOAP Fault">
          <con:settings/>
          <con:config xsi:type="con:SimpleContainsAssertion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <con:token>soap:Fault</con:token>
            <con:ignoreCase>false</con:ignoreCase>
            <con:useRegexp>false</con:useRegexp>
          </con:config>
        </con:testStep>
      </con:testCase>`);
    }

    if (field.maxLength !== undefined) {
      const longValue = 'x'.repeat(field.maxLength + 1);
      const longEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: longValue });

      testCases.push(`    <con:testCase failOnError="true" failTestCaseOnErrors="true" keepSession="false" maxResults="0" name="${operation.name} ${field.name} Too Long" searchProperties="true">
        <con:settings/>
        <con:testStep type="request" name="${operation.name} Request">
          <con:settings/>
          <con:config xsi:type="con:RequestConfig" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <con:request><![CDATA[${longEnvelope}]]></con:request>
            <con:endpoint>${config.baseUrl}</con:endpoint>
            <con:method>POST</con:method>
            <con:mediaType>text/xml</con:mediaType>
            <con:postQueryString>false</postQueryString>
            <con:timeout>60000</con:timeout>
          </con:config>
        </con:testStep>
        <con:testStep type="assertion" name="SOAP Fault">
          <con:settings/>
          <con:config xsi:type="con:SimpleContainsAssertion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <con:token>soap:Fault</con:token>
            <con:ignoreCase>false</con:ignoreCase>
            <con:useRegexp>false</con:useRegexp>
          </con:config>
        </con:testStep>
      </con:testCase>`);
    }

    if (field.enumerations && field.enumerations.length > 0) {
      const invalidEnum = 'INVALID_ENUM_VALUE';
      const invalidEnvelope = buildSampleSoapEnvelope(operation.name, service.endpoint, inputElement, registry, config.soapVersion, undefined, { field: field.name, value: invalidEnum });

      testCases.push(`    <con:testCase failOnError="true" failTestCaseOnErrors="true" keepSession="false" maxResults="0" name="${operation.name} ${field.name} Invalid Enum" searchProperties="true">
        <con:settings/>
        <con:testStep type="request" name="${operation.name} Request">
          <con:settings/>
          <con:config xsi:type="con:RequestConfig" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <con:request><![CDATA[${invalidEnvelope}]]></con:request>
            <con:endpoint>${config.baseUrl}</con:endpoint>
            <con:method>POST</con:method>
            <con:mediaType>text/xml</con:mediaType>
            <con:postQueryString>false</postQueryString>
            <con:timeout>60000</con:timeout>
          </con:config>
        </con:testStep>
        <con:testStep type="assertion" name="SOAP Fault">
          <con:settings/>
          <con:config xsi:type="con:SimpleContainsAssertion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <con:token>soap:Fault</con:token>
            <con:ignoreCase>false</con:ignoreCase>
            <con:useRegexp>false</con:useRegexp>
          </con:config>
        </con:testStep>
      </con:testCase>`);
    }
  }

  return testCases.join('\n');
}