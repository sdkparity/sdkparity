import { z } from "zod";

export const sdkparityLanguageSchema = z.enum(["typescript", "python"]);
export type SdkparityLanguage = z.infer<typeof sdkparityLanguageSchema>;

export const sdkparityConfigSchema = z
  .object({
    version: z.literal("0.1").default("0.1"),
    spec: z.string().min(1),
    overlay: z.string().min(1).optional(),
    outputDir: z.string().min(1).default("sdkparity-run"),
    languages: z.array(sdkparityLanguageSchema).min(1).default(["typescript"]),
    packages: z
      .object({
        typescript: z.string().min(1).optional(),
        python: z.string().min(1).optional()
      })
      .strict()
      .default({})
  })
  .strict();

export type SdkparityConfig = z.infer<typeof sdkparityConfigSchema>;
export type SdkparityConfigInput = z.input<typeof sdkparityConfigSchema>;

export function parseSdkparityConfig(input: unknown): SdkparityConfig {
  return sdkparityConfigSchema.parse(input);
}

export function normalizeLanguageAlias(value: string): SdkparityLanguage {
  if (value === "ts") {
    return "typescript";
  }
  if (value === "py") {
    return "python";
  }
  return sdkparityLanguageSchema.parse(value);
}

export function parseLanguageList(value: string | undefined): SdkparityLanguage[] {
  if (!value) {
    return ["typescript"];
  }

  const languages = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(normalizeLanguageAlias);
  return languages.length > 0 ? Array.from(new Set(languages)) : ["typescript"];
}
