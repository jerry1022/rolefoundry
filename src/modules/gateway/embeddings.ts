import { z } from "zod";

/** A vector space is identified by provider, model, version and dimension; never mix spaces. */
export const embeddingSpaceSchema = z
  .object({
    provider: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
    model: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9._:/-]+$/),
    version: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/),
    dimensions: z.number().int().min(8).max(8192),
  })
  .strict();
export type EmbeddingSpace = z.infer<typeof embeddingSpaceSchema>;

export function spaceKey(space: EmbeddingSpace) {
  const value = embeddingSpaceSchema.parse(space);
  return `${value.provider}/${value.model}@${value.version}#${value.dimensions}`;
}

export interface SpacedVector {
  space: string;
  vector: readonly number[];
}

/** Rejects any vector from another space or with the wrong dimension before indexing/search. */
export function assertSameSpace(index: EmbeddingSpace, vectors: readonly SpacedVector[]) {
  const key = spaceKey(index);
  for (const item of vectors) {
    if (item.space !== key) throw new Error("Embedding space mismatch; reindex is required.");
    if (item.vector.length !== index.dimensions || item.vector.some((v) => !Number.isFinite(v)))
      throw new Error("Embedding dimension mismatch.");
  }
}

export function cosine(a: readonly number[], b: readonly number[]) {
  if (a.length !== b.length || !a.length) throw new Error("Embedding dimension mismatch.");
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
