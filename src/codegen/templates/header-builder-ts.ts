import type { ProjectConfig } from '../../types/project-config';

export function generateHeaderBuilderTs(config: ProjectConfig): string {
  const ns = config.sessionConfig?.sessionHeaderNamespace || 'http://example.com/session';

  return `import type { SessionState } from '../session/session-manager.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSessionHeader(session: SessionState): string {
  return \`<session xmlns="${ns}">
    <userID>\${escapeXml(session.userID)}</userID>
    <sessionTicket>\${escapeXml(session.sessionTicket)}</sessionTicket>
  </session>\`;
}
`;
}
