'use client';

import { Badge } from '@omni/ui/components/badge';
import { Button } from '@omni/ui/components/button';
import { Skeleton } from '@omni/ui/components/skeleton';
import { useMe } from '@/lib/use-me';

export function UserIdentity() {
  const me = useMe();

  if (me.isLoading || (me.isPending && !me.data)) {
    return <Skeleton className="h-4 w-24" role="status" aria-label="Loading profile" />;
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
      <span className="max-w-28 truncate text-sm font-medium sm:max-w-xs">{me.data.displayName}</span>
      {me.data.role === 'admin'
        ? <Badge>Admin</Badge>
        : null}
    </div>
  );
}
