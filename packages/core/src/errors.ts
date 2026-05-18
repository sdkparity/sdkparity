import { z } from "zod";

export const sdkParityErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  suggestion: z.string().optional()
});

export type SdkParityErrorPayload = z.infer<typeof sdkParityErrorSchema>;

export class SdkParityError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly suggestion: string | undefined;

  constructor(payload: SdkParityErrorPayload) {
    super(payload.message);
    this.name = "SdkParityError";
    this.code = payload.code;
    this.details = payload.details;
    this.suggestion = payload.suggestion;
  }

  toJSON(): SdkParityErrorPayload {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      ...(this.suggestion ? { suggestion: this.suggestion } : {})
    };
  }
}

export function toSdkParityError(error: unknown): SdkParityError {
  if (error instanceof SdkParityError) {
    return error;
  }
  if (error instanceof Error) {
    return new SdkParityError({
      code: "unexpected_error",
      message: error.message
    });
  }
  return new SdkParityError({
    code: "unexpected_error",
    message: "An unexpected error occurred.",
    details: { value: error }
  });
}
