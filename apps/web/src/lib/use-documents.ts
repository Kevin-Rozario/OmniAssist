'use client';

import type { DocumentStatus } from '@omni/types';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteDocument,
  listDocuments,
  reingestDocument,
  uploadDocument,
} from '@/lib/api-client';
import { useMe } from '@/lib/use-me';

export const documentsQueryKey = ['documents'] as const;

function isInFlight(status: DocumentStatus): boolean {
  return status === 'pending' || status === 'processing';
}

export function useDocuments() {
  const { getToken, isLoaded, userId } = useAuth();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';

  return useQuery({
    queryKey: documentsQueryKey,
    enabled: isLoaded && userId != null && isAdmin,
    queryFn: () => listDocuments(getToken),
    refetchInterval: (query) => {
      const documents = query.state.data?.documents;
      if (!documents?.some(document => isInFlight(document.status)))
        return false;
      return 3_000;
    },
  });
}

export function useUploadDocument() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadDocument(getToken, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
}

export function useDeleteDocument() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteDocument(getToken, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
}

export function useReingestDocument() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reingestDocument(getToken, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });
}
