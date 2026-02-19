import type { ProjectConfig } from '../../types/project-config';

export function generateEnvExample(config: ProjectConfig): string {
  const prefix = config.toolPrefix.toUpperCase();

  const lines = config.envVars.map(v => {
    const comment = v.required ? '# Required' : '# Optional';
    return `# ${v.description} (${comment.substring(2)})\n${prefix}_${v.name}=${v.defaultValue || ''}`;
  });

  if (config.authType === 'session' || config.authType === 'basic') {
    if (!config.envVars.find(v => v.name === 'USER_ID')) {
      lines.push(`# Authentication user ID (Required)\n${prefix}_USER_ID=`);
    }
    if (!config.envVars.find(v => v.name === 'PASSWORD')) {
      lines.push(`# Authentication password (Required)\n${prefix}_PASSWORD=`);
    }
  }

  if (config.authType === 'session') {
    if (!config.envVars.find(v => v.name === 'LOGIN_TYPE')) {
      lines.push(`# Session strategy: GetSession, CreateSession, or GetOrCreateSession (Optional)\n${prefix}_LOGIN_TYPE=GetOrCreateSession`);
    }
  }

  return lines.join('\n\n') + '\n';
}
