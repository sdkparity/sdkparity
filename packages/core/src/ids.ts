import { z } from "zod";

export const idSchema = z.string().regex(/^[a-z][a-z0-9_:-]{2,127}$/);

export type Id = z.infer<typeof idSchema>;

export function slugifyId(input: string): Id {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 127);

  if (!slug) {
    return "id_unknown";
  }

  const normalized = /^[a-z]/.test(slug) ? slug : `id_${slug}`;
  return idSchema.parse(normalized);
}
