import type { ProjectConfig } from '../../types/project-config';

export function generateConfigTs(config: ProjectConfig): string {
  const envVars = [...config.envVars];

  if (config.authType === 'session' || config.authType === 'basic') {
    if (!envVars.find(v => v.name === 'USER_ID')) {
      envVars.push({ name: 'USER_ID', description: 'Authentication user ID', required: true });
    }
    if (!envVars.find(v => v.name === 'PASSWORD')) {
      envVars.push({ name: 'PASSWORD', description: 'Authentication password', required: true });
    }
  }

  if (config.authType === 'session') {
    if (!envVars.find(v => v.name === 'LOGIN_TYPE')) {
      envVars.push({
        name: 'LOGIN_TYPE',
        description: 'Session strategy: GetSession, CreateSession, or GetOrCreateSession',
        required: false,
        defaultValue: 'GetOrCreateSession',
      });
    }
  }

  const prefix = config.toolPrefix.toUpperCase();

  const interfaceFields = envVars.map(v => {
    const optional = v.required ? '' : '?';
    return `  ${prefix}_${v.name}${optional}: string;`;
  }).join('\n');

  const loaderLines = envVars.map(v => {
    const envKey = `${prefix}_${v.name}`;
    if (v.required) {
      return `  const ${toCamelCase(v.name)} = process.env.${envKey};
  if (!${toCamelCase(v.name)}) throw new Error('Missing required env var: ${envKey}');`;
    }
    const def = v.defaultValue ? ` || '${v.defaultValue}'` : '';
    return `  const ${toCamelCase(v.name)} = process.env.${envKey}${def};`;
  }).join('\n\n');

  const returnFields = envVars.map(v => {
    return `    ${prefix}_${v.name}: ${toCamelCase(v.name)}${v.required ? '' : ' || \'\''},`;
  }).join('\n');

  return `import 'dotenv/config';

export interface Config {
${interfaceFields}
}

export function loadConfig(): Config {
${loaderLines}

  return {
${returnFields}
  };
}
`;
}

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-_]+(.)/g, (_, c: string) => c.toUpperCase());
}
