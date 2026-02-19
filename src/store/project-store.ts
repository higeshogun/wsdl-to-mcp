import { create } from 'zustand';
import type { WsdlDefinition } from '../types/wsdl-types';
import type { XsdSchema } from '../types/xsd-types';
import type { ProjectConfig } from '../types/project-config';
import type { GeneratedFile } from '../types/codegen-types';
import { defaultConfig } from '../types/project-config';
import { parseAllFiles } from '../parser/schema-resolver';
import { generateProject } from '../codegen/project-generator';

interface ProjectStore {
  files: Map<string, string>;
  wsdlDefinitions: WsdlDefinition[];
  xsdSchemas: XsdSchema[];
  parseErrors: string[];
  config: ProjectConfig;
  generatedFiles: GeneratedFile[];
  currentStep: number;

  addFiles: (fileEntries: { name: string; content: string }[]) => void;
  removeFile: (name: string) => void;
  clearFiles: () => void;
  updateConfig: (partial: Partial<ProjectConfig>) => void;
  generate: () => void;
  setStep: (step: number) => void;

  totalOperations: () => number;
  totalServices: () => number;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  files: new Map(),
  wsdlDefinitions: [],
  xsdSchemas: [],
  parseErrors: [],
  config: defaultConfig(),
  generatedFiles: [],
  currentStep: 0,

  addFiles: (fileEntries) => {
    const newFiles = new Map(get().files);
    for (const { name, content } of fileEntries) {
      newFiles.set(name, content);
    }

    const result = parseAllFiles(newFiles);

    set({
      files: newFiles,
      wsdlDefinitions: result.wsdlDefinitions,
      xsdSchemas: result.xsdSchemas,
      parseErrors: result.errors,
    });
  },

  removeFile: (name) => {
    const newFiles = new Map(get().files);
    newFiles.delete(name);

    const result = parseAllFiles(newFiles);

    set({
      files: newFiles,
      wsdlDefinitions: result.wsdlDefinitions,
      xsdSchemas: result.xsdSchemas,
      parseErrors: result.errors,
    });
  },

  clearFiles: () => {
    set({
      files: new Map(),
      wsdlDefinitions: [],
      xsdSchemas: [],
      parseErrors: [],
      generatedFiles: [],
    });
  },

  updateConfig: (partial) => {
    set({ config: { ...get().config, ...partial } });
  },

  generate: () => {
    const { wsdlDefinitions, xsdSchemas, config } = get();
    try {
      const files = generateProject(wsdlDefinitions, xsdSchemas, config);
      set({ generatedFiles: files });
    } catch (err) {
      console.error('Generation error:', err);
      set({
        parseErrors: [`Generation failed: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  },

  setStep: (step) => set({ currentStep: step }),

  totalOperations: () => {
    return get().wsdlDefinitions.reduce(
      (sum, w) => sum + w.portTypes.reduce((s, pt) => s + pt.operations.length, 0),
      0,
    );
  },

  totalServices: () => {
    return get().wsdlDefinitions.reduce((sum, w) => sum + w.services.length, 0);
  },
}));
