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
  /** AI-enhanced tool descriptions keyed by tool name */
  enhancedDescriptions: Record<string, string>;

  addFiles: (fileEntries: { name: string; content: string }[]) => void;
  removeFile: (name: string) => void;
  clearFiles: () => void;
  updateConfig: (partial: Partial<ProjectConfig>) => void;
  generate: () => void;
  setStep: (step: number) => void;
  setEnhancedDescription: (toolName: string, description: string) => void;
  clearEnhancedDescriptions: () => void;

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
  enhancedDescriptions: {},

  addFiles: (fileEntries) => {
    const newFiles = new Map(get().files);
    for (const { name, content } of fileEntries) {
      newFiles.set(name, content);
    }

    const result = parseAllFiles(newFiles);

    // Auto-detect SOAP version from parsed bindings
    const has12 = result.wsdlDefinitions.some(d => d.bindings.some(b => b.soapVersion === '1.2'));
    const detectedVersion = has12 ? '1.2' as const : '1.1' as const;

    set({
      files: newFiles,
      wsdlDefinitions: result.wsdlDefinitions,
      xsdSchemas: result.xsdSchemas,
      parseErrors: result.errors,
      config: { ...get().config, soapVersion: detectedVersion },
      enhancedDescriptions: {},
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
      enhancedDescriptions: {},
    });
  },

  updateConfig: (partial) => {
    set({ config: { ...get().config, ...partial } });
  },

  generate: () => {
    const { wsdlDefinitions, xsdSchemas, config, enhancedDescriptions } = get();
    try {
      const files = generateProject(wsdlDefinitions, xsdSchemas, config, enhancedDescriptions);
      set({ generatedFiles: files });
    } catch (err) {
      console.error('Generation error:', err);
      set({
        parseErrors: [`Generation failed: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  },

  setStep: (step) => set({ currentStep: step }),

  setEnhancedDescription: (toolName, description) =>
    set(state => ({
      enhancedDescriptions: { ...state.enhancedDescriptions, [toolName]: description },
    })),

  clearEnhancedDescriptions: () => set({ enhancedDescriptions: {} }),

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
