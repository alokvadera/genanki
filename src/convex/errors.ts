export type GenErrorKind =
  | "canceled"
  | "timeout"
  | "rate_limited"
  | "provider_http"
  | "parse"
  | "no_providers"
  | "empty_output"
  | "deadline";

export class GenError extends Error {
  public kind: GenErrorKind;
  public status?: number;
  public provider?: string;
  public model?: string;

  constructor(
    kind: GenErrorKind,
    message: string,
    details?: { status?: number; provider?: string; model?: string },
  ) {
    super(message);
    this.name = "GenError";
    this.kind = kind;
    this.status = details?.status;
    this.provider = details?.provider;
    this.model = details?.model;
  }
}

export function isGenError(error: unknown): error is GenError {
  return error instanceof GenError;
}

export function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /timeout/i.test(error.message))
  );
}

export function isGenerationCanceledError(error: unknown): boolean {
  return error instanceof GenError && error.kind === "canceled";
}
