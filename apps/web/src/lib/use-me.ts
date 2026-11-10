'use client';

import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '@/lib/api-client';

export function useMe() {
  const { getToken, isLoaded, userId } = useAuth();

  return useQuery({
    queryKey: ['me', userId],
    enabled: isLoaded && userId != null,
    queryFn: () => fetchMe(getToken),
  });
}
