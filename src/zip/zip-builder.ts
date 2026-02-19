import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { GeneratedFile } from '../types/codegen-types';

export async function buildAndDownloadZip(
  projectName: string,
  files: GeneratedFile[],
  wsdlFiles: Map<string, string>,
): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder(projectName)!;

  for (const file of files) {
    root.file(file.path, file.content);
  }

  const wsdlFolder = root.folder('wsdl')!;
  for (const [name, content] of wsdlFiles) {
    wsdlFolder.file(name, content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${projectName}.zip`);
}
