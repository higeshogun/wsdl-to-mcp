import type { LLMProvider, ProviderType } from './types';
import { anthropicProvider } from './anthropic';
import { ollamaProvider } from './ollama';
import { geminiProvider } from './gemini';
import { llamacppProvider } from './llamacpp';
import { openaiProvider } from './openai';
import { nvidiaProvider } from './nvidia';
import { sanitizeSchema } from './schema-utils';

function withSanitizer(provider: LLMProvider): LLMProvider {
  return {
    ...provider,
    sendMessage: (messages, tools, config) => {
      const sanitizedTools = tools.map((tool) => ({
        ...tool,
        inputSchema: sanitizeSchema(tool.inputSchema),
      }));
      return provider.sendMessage(messages, sanitizedTools, config);
    },
    ...(provider.getSystemPrompt
      ? {
          getSystemPrompt: (tools) => {
            const sanitizedTools = tools.map((tool) => ({
              ...tool,
              inputSchema: sanitizeSchema(tool.inputSchema),
            }));
            return provider.getSystemPrompt!(sanitizedTools);
          },
        }
      : {}),
  };
}

const sanitizedOllama = withSanitizer(ollamaProvider);
const sanitizedLlamacpp = withSanitizer(llamacppProvider);
const sanitizedNvidia = withSanitizer(nvidiaProvider);

export const providers: Record<ProviderType, LLMProvider> = {
  anthropic: anthropicProvider,
  ollama: sanitizedOllama,
  gemini: geminiProvider,
  llamacpp: sanitizedLlamacpp,
  openai: openaiProvider,
  nvidia: sanitizedNvidia,
};

export const providerList: LLMProvider[] = [
  sanitizedLlamacpp,
  openaiProvider,
  sanitizedNvidia,
  anthropicProvider,
  sanitizedOllama,
  geminiProvider,
];

export function getProvider(type: ProviderType): LLMProvider {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown provider: ${type}`);
  return provider;
}

export type { LLMProvider, ProviderType, ProviderConfig, ModelOption } from './types';
