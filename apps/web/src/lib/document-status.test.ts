import { expect, it } from 'vitest';
import { documentStatusBadgeVariant, documentStatusLabel } from './document-status';

it('maps document statuses to badge variants and labels', () => {
  expect(documentStatusBadgeVariant('ready')).toBe('default');
  expect(documentStatusBadgeVariant('failed')).toBe('destructive');
  expect(documentStatusBadgeVariant('processing')).toBe('outline');
  expect(documentStatusBadgeVariant('pending')).toBe('secondary');

  expect(documentStatusLabel('ready')).toBe('Ready');
  expect(documentStatusLabel('failed')).toBe('Failed');
  expect(documentStatusLabel('processing')).toBe('Processing');
  expect(documentStatusLabel('pending')).toBe('Pending');
});
