import { z } from "zod";

export const generationLanguageSchema = z.enum(["typescript", "python"]);
export type GenerationLanguage = z.infer<typeof generationLanguageSchema>;
