import { z } from 'zod';

export const ValidationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/** RFC 9457 problem details, with the `requestId` and validation `errors` extensions. */
export const ProblemDetailsSchema = z.looseObject({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().min(1),
  errors: z.array(ValidationIssueSchema).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
