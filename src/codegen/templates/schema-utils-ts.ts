export function generateSchemaUtilsTs(): string {
  return `/**
 * Sanitize a JSON Schema object for LLM tool-calling APIs.
 *
 * Many LLM APIs only support a subset of JSON Schema.  This function
 * recursively strips unsupported keywords so the schema is accepted
 * without errors.
 */

const ALLOWED_KEYS = new Set([
  'type',
  'properties',
  'items',
  'required',
  'description',
  'enum',
]);

export function sanitizeSchema(schema: any): any {
  if (schema === null || schema === undefined || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(sanitizeSchema);
  }

  const out: Record<string, any> = {};

  for (const key of Object.keys(schema)) {
    if (!ALLOWED_KEYS.has(key)) continue;

    const val = schema[key];

    if (key === 'properties' && val && typeof val === 'object') {
      const props: Record<string, any> = {};
      for (const [pName, pSchema] of Object.entries(val)) {
        props[pName] = sanitizeSchema(pSchema);
      }
      out.properties = props;
    } else if (key === 'items' && val && typeof val === 'object') {
      out.items = sanitizeSchema(val);
    } else {
      out[key] = val;
    }
  }

  return out;
}
`;
}
