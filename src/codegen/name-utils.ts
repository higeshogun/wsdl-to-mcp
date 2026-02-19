export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function toKebabCase(str: string): string {
  return toSnakeCase(str).replace(/_/g, '-');
}

export function operationToToolName(prefix: string, operationName: string): string {
  return `${prefix}_${toSnakeCase(operationName)}`;
}

export function serviceToClientKey(serviceName: string): string {
  const cleaned = serviceName
    .replace(/Service$/i, '')
    .replace(/Port$/i, '')
    .replace(/Soap$/i, '');
  return toCamelCase(cleaned);
}

export function serviceToToolFileName(serviceName: string): string {
  const cleaned = serviceName
    .replace(/Service$/i, '')
    .replace(/Port$/i, '')
    .replace(/Soap$/i, '');
  return `${toKebabCase(cleaned)}-tools.ts`;
}

export function serviceToRegisterFunctionName(serviceName: string): string {
  const cleaned = serviceName
    .replace(/Service$/i, '')
    .replace(/Port$/i, '')
    .replace(/Soap$/i, '');
  return `register${toPascalCase(cleaned)}Tools`;
}

export function typeToSchemaName(typeName: string): string {
  return `${toPascalCase(typeName)}Schema`;
}

export function sanitizeNpmName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

export function operationToDescription(operationName: string): string {
  const words = operationName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
