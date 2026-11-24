import { z } from "zod";
export const invalidationLeaseSchema = z.object({ id: z.uuid(), token: z.uuid() }).strict();
export type InvalidationLease = z.infer<typeof invalidationLeaseSchema>;
export const invalidationResultSchema = z
  .object({
    completed: z.boolean(),
    canceled: z.number().int().min(0).max(20),
  })
  .strict();
export type InvalidationResult = z.infer<typeof invalidationResultSchema>;
