import type { DocumentStatus } from '@omni/types';

export function documentStatusBadgeVariant(
  status: DocumentStatus,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'ready':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'processing':
      return 'outline';
    case 'pending':
      return 'secondary';
  }
}

export function documentStatusLabel(status: DocumentStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    case 'processing':
      return 'Processing';
    case 'pending':
      return 'Pending';
  }
}
