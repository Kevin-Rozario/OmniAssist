import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'member']);
export type Role = z.infer<typeof RoleSchema>;
