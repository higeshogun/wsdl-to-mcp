export function generateErrorHandlerTs(): string {
  return `interface SoapFaultDetail {
  type: string;
  errorType?: string;
  errorMessage?: string;
  rejectReason?: string;
  detail?: unknown;
}

export function isSoapFault(error: unknown): boolean {
  try {
    const err = error as Record<string, unknown>;
    const root = err.root as Record<string, unknown> | undefined;
    return !!root?.Envelope;
  } catch {
    return false;
  }
}

function extractFault(error: unknown): SoapFaultDetail | null {
  try {
    const err = error as Record<string, unknown>;
    const root = err.root as Record<string, unknown>;
    const envelope = root.Envelope as Record<string, unknown>;
    const body = envelope.Body as Record<string, unknown>;
    const fault = body.Fault as Record<string, unknown>;
    const detail = fault.detail as Record<string, unknown>;

    if (!detail) return null;

    for (const key of Object.keys(detail)) {
      if (key.startsWith('$')) continue;
      const faultData = detail[key] as Record<string, unknown>;
      return {
        type: key,
        errorType: faultData.errorType ? String(faultData.errorType) : undefined,
        errorMessage: faultData.errorMessage ? String(faultData.errorMessage) : undefined,
        rejectReason: faultData.rejectReason ? String(faultData.rejectReason) : undefined,
        detail: faultData,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function formatSoapError(error: unknown): { text: string; isError: true } {
  if (isSoapFault(error)) {
    const fault = extractFault(error);
    if (fault) {
      return {
        text: JSON.stringify({
          error: true,
          faultType: fault.type,
          errorType: fault.errorType,
          errorMessage: fault.errorMessage,
          rejectReason: fault.rejectReason,
          detail: fault.detail,
        }, null, 2),
        isError: true,
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    text: JSON.stringify({ error: true, message }, null, 2),
    isError: true,
  };
}
`;
}
