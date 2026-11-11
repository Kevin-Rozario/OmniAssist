'use client';

import type { Role } from '@omni/types';
import { Badge } from '@omni/ui/components/badge';
import { Button } from '@omni/ui/components/button';
import { Skeleton } from '@omni/ui/components/skeleton';
import { useMe } from '@/lib/use-me';

/** The two roles people see. The API calls the non-admin role `member`; the screen says "User". */
const ROLE_LABELS = {
  admin: 'Admin',
  member: 'User',
} as const satisfies Record<Role, string>;

export function UserIdentity() {
  const me = useMe();

  if (me.isPending) {
    return <Skeleton className="h-5 w-28 rounded-full" role="status" aria-label="Loading profile" />;
  }

  if (me.isError || !me.data) {
    return (
      <div role="alert" className="flex min-w-0 items-center gap-1">
        <span className="truncate text-xs text-destructive">Profile unavailable</span>
        <Button type="button" variant="outline" size="xs" onClick={() => void me.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{me.data.displayName}</span>
      <Badge
        variant={me.data.role === 'admin'
          ? 'default'
          : 'secondary'}
        className="rounded-full"
      >
        {ROLE_LABELS[me.data.role]}
      </Badge>
    </div>
  );
}
