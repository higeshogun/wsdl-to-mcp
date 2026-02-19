export function generateXmlToJsonTs(): string {
  return `export function normalizeResponse(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeResponse);

  const input = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith('$') && key !== '$value') continue;

    if (key === 'attributes' || key === '$attributes') {
      const attrs = value as Record<string, unknown>;
      for (const [attrKey, attrVal] of Object.entries(attrs)) {
        result[attrKey] = attrVal;
      }
      continue;
    }

    if (key === '$value') {
      result['value'] = value;
      continue;
    }

    result[key] = normalizeResponse(value);
  }

  return result;
}

export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return [value];
}
`;
}
