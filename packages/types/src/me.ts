import { z } from 'zod';
import { RoleSchema } from './role';

export const MeResponseSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string(),
  primaryEmail: z.email().nullable(),
  role: RoleSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
