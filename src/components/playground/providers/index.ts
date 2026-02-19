import type { LLMProvider, ProviderType } from './types';
import { anthropicProvider } from './anthropic';
import { ollamaProvider } from './ollama';
import { geminiProvider } from './gemini';
import { llamacppProvider } from './llamacpp';

export const providers: Record<ProviderType, LLMProvider> = {
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
  gemini: geminiProvider,
  llamacpp: llamacppProvider,
};

export const providerList: LLMProvider[] = [
  llamacppProvider,
  anthropicProvider,
  ollamaProvider,
  geminiProvider,
];

export function getProvider(type: ProviderType): LLMProvider {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown provider: ${type}`);
  return provider;
}

export type { LLMProvider, ProviderType, ProviderConfig, ModelOption } from './types';
