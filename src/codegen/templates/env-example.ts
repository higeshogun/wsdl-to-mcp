import type { ProjectConfig } from '../../types/project-config';

export function generateEnvExample(config: ProjectConfig): string {
  const prefix = config.toolPrefix.toUpperCase();

  const lines = config.envVars.map(v => {
    const comment = v.required ? '# Required' : '# Optional';
    let value = v.defaultValue || '';
    if (v.name === 'BASE_URL' && config.baseUrl) value = config.baseUrl;
    return `# ${v.description} (${comment.substring(2)})\n${prefix}_${v.name}=${value}`;
  });

  if (!config.envVars.find(v => v.name === 'BASE_URL')) {
    const baseUrlValue = config.baseUrl || '';
    lines.unshift(`# SOAP service endpoint URL (Required)\n${prefix}_BASE_URL=${baseUrlValue}`);
  }

  if (config.authType === 'session' || config.authType === 'basic') {
    if (!config.envVars.find(v => v.name === 'USER_ID')) {
      lines.push(`# Authentication user ID (Required)\n${prefix}_USER_ID=`);
    }
    if (!config.envVars.find(v => v.name === 'PASSWORD')) {
      lines.push(`# Authentication password (Required)\n${prefix}_PASSWORD=`);
    }
  }

  if (config.authType === 'session') {
    if (!config.envVars.find(v => v.name === 'AUTH_URL')) {
      const authUrlValue = config.authUrl || config.baseUrl || '';
      lines.push(`# Authentication service endpoint URL - may differ from BASE_URL (Required)\n${prefix}_AUTH_URL=${authUrlValue}`);
    }
    if (!config.envVars.find(v => v.name === 'LOGIN_TYPE')) {
      lines.push(`# Session strategy: GetSession, CreateSession, or GetOrCreateSession (Optional)\n${prefix}_LOGIN_TYPE=GetOrCreateSession`);
    }
    if (!config.envVars.find(v => v.name === 'SESSION_NS')) {
      const ns = config.sessionConfig?.sessionHeaderNamespace || '';
      lines.push(`# XML namespace for the session SOAP header (Optional)\n${prefix}_SESSION_NS=${ns}`);
    }
  }

  return lines.join('\n\n') + '\n';
}
