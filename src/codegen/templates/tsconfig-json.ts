export function generateTsconfigJson(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      declaration: true,
      sourceMap: true,
      skipLibCheck: true,
    },
    include: ['src/**/*'],
  };
  return JSON.stringify(config, null, 2) + '\n';
}
