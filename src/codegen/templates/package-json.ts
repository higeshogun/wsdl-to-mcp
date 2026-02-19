import type { ProjectConfig } from '../../types/project-config';

export function generatePackageJson(config: ProjectConfig): string {
  const pkg = {
    name: config.projectName,
    version: '1.0.0',
    description: config.projectDescription,
    type: 'module',
    scripts: {
      build: 'tsc',
      start: 'node dist/index.js',
      dev: 'tsx src/index.ts',
    },
    dependencies: {
      '@modelcontextprotocol/sdk': '^1.12.1',
      dotenv: '^16.4.7',
      soap: '^1.1.6',
      zod: '^3.24.2',
    },
    devDependencies: {
      '@types/node': '^22.13.4',
      tsx: '^4.19.3',
      typescript: '^5.7.3',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}
