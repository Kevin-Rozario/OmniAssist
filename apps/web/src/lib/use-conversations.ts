'use client';

import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteConversation, listConversations, renameConversation } from '@/lib/api-client';

export const conversationsQueryKey = ['conversations'] as const;

/** The signed-in user's saved conversations, newest activity first. Refetched whenever the list is shown. */
export function useConversationList() {
  const { getToken, isLoaded, userId } = useAuth();

  return useQuery({
    queryKey: conversationsQueryKey,
    enabled: isLoaded && userId != null,
    queryFn: () => listConversations(getToken),
    refetchOnMount: 'always',
  });
}

export function useRenameConversation() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameConversation(getToken, id, title),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    },
  });
}

export function useDeleteConversation() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteConversation(getToken, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
    },
  });
}
