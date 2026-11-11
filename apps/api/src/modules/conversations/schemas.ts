import { z } from '@hono/zod-openapi';
import {
  ConversationDetailSchema,
  ConversationListResponseSchema,
  ConversationSummarySchema,
  RenameConversationRequestSchema,
} from '@omni/types';

export const ConversationSummaryOpenApiSchema = ConversationSummarySchema.meta({ id: 'ConversationSummary' });
export const ConversationListOpenApiSchema = ConversationListResponseSchema.meta({ id: 'ConversationListResponse' });
export const ConversationDetailOpenApiSchema = ConversationDetailSchema.meta({ id: 'ConversationDetail' });
export const RenameConversationOpenApiSchema = RenameConversationRequestSchema.meta({ id: 'RenameConversationRequest' });

export const ConversationIdParamSchema = z.object({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    example: '019a1b2c-3d4e-7f80-9abc-def012345678',
  }),
});
