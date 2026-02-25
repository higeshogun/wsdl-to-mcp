/// <reference types="dom-chromium-ai" />

export type ChromeAIAvailability = {
  promptApi: Availability;
  summarizer: Availability;
  languageDetector: Availability;
  translator: boolean;
};

export async function getChromeAIAvailability(): Promise<ChromeAIAvailability> {
  const result: ChromeAIAvailability = {
    promptApi: 'unavailable',
    summarizer: 'unavailable',
    languageDetector: 'unavailable',
    translator: false,
  };

  try {
    result.promptApi = await LanguageModel.availability();
  } catch { /* API not present in this browser */ }

  try {
    result.summarizer = await Summarizer.availability();
  } catch { /* API not present */ }

  try {
    result.languageDetector = await LanguageDetector.availability();
  } catch { /* API not present */ }

  try {
    // Test a common language pair to see if Translator is available at all
    const avail = await Translator.availability({ sourceLanguage: 'es', targetLanguage: 'en' });
    result.translator = avail !== 'unavailable';
  } catch { /* API not present */ }

  return result;
}

export function isPromptApiUsable(avail: ChromeAIAvailability): boolean {
  return avail.promptApi === 'available' || avail.promptApi === 'downloadable';
}

/**
 * Enhance an MCP tool description using Gemini Nano (Prompt API).
 * Returns a concise, plain-English sentence describing the operation.
 */
export async function enhanceToolDescription(
  toolName: string,
  currentDescription: string,
  inputSchemaJson: string,
): Promise<string> {
  const session = await LanguageModel.create({
    initialPrompts: [
      {
        role: 'system',
        content:
          'You are a technical writer documenting SOAP web service operations for use as AI assistant tools. ' +
          'Write concise, accurate, plain-English descriptions.',
      },
    ],
  });

  try {
    const prompt =
      `Operation name: ${toolName}\n` +
      `Current description: ${currentDescription}\n` +
      `Input parameters (JSON Schema): ${inputSchemaJson}\n\n` +
      `Write a single concise sentence (under 120 characters) describing what this SOAP operation does. ` +
      `Output only the description, nothing else.`;

    const result = await session.prompt(prompt);
    // Strip surrounding quotes that the model sometimes adds
    return result.trim().replace(/^["']|["']$/g, '');
  } finally {
    session.destroy();
  }
}

/**
 * Explain a SOAP error response in plain English using the Prompt API.
 */
export async function explainSoapError(
  toolName: string,
  soapFaultXml: string,
): Promise<string> {
  const session = await LanguageModel.create();

  try {
    const truncated = soapFaultXml.length > 2000
      ? soapFaultXml.slice(0, 2000) + '...'
      : soapFaultXml;

    const prompt =
      `The following SOAP response is an error from the "${toolName}" operation:\n\n` +
      `${truncated}\n\n` +
      `Explain in plain English what went wrong and how to fix it. Be concise (2-3 sentences).`;

    return (await session.prompt(prompt)).trim();
  } finally {
    session.destroy();
  }
}

/**
 * Detect the BCP-47 language code of the given text.
 * Returns null if detection fails or confidence is too low.
 */
export async function detectLanguage(text: string): Promise<string | null> {
  const detector = await LanguageDetector.create();

  try {
    const results = await detector.detect(text);
    const top = results[0];
    if (top?.detectedLanguage && (top.confidence ?? 0) > 0.6) {
      return top.detectedLanguage;
    }
    return null;
  } finally {
    detector.destroy();
  }
}

/**
 * Translate text from the given BCP-47 language to English.
 */
export async function translateToEnglish(text: string, fromLang: string): Promise<string> {
  const translator = await Translator.create({
    sourceLanguage: fromLang,
    targetLanguage: 'en',
  });

  try {
    return await translator.translate(text);
  } finally {
    translator.destroy();
  }
}
