import { z } from '@hono/zod-openapi';

export const DependencyStatusSchema = z.enum(['ok', 'unavailable']);
export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
}).meta({ id: 'HealthResponse' });

export const ReadinessResponseSchema = z
  .object({
    status: DependencyStatusSchema,
    checks: z.object({ database: DependencyStatusSchema }),
  })
  .meta({ id: 'ReadinessResponse' });
export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
