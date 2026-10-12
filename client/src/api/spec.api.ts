import type { ApiResponse, ParsedSpecSummary } from '@api-sentinel/shared';

export interface HealthResponse {
  status: string;
  service: string;
  storage: {
    mode: string;
    isDemo: boolean;
  } | null;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export async function parseSpecification(
  specContent: string,
  sourceFormat: 'json' | 'yaml' | 'auto' = 'auto'
): Promise<ParsedSpecSummary> {
  const res = await fetch('/api/specs/parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ specContent, sourceFormat }),
  });

  const body: ApiResponse<ParsedSpecSummary> = await res.json();

  if (!res.ok || !body.success) {
    const errorMsg = body.error?.message || `Request failed with HTTP ${res.status}`;
    const err = new Error(errorMsg);
    (err as any).code = body.error?.code;
    (err as any).details = body.error?.details;
    throw err;
  }

  return body.data!;
}
