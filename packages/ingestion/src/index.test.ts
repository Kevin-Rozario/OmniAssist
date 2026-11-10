import { describe, expect, it } from 'vitest';
import { INGESTION_PACKAGE_NAME } from './index';

describe('@omni/ingestion scaffold', () => {
  it('exports the package name', () => {
    expect(INGESTION_PACKAGE_NAME).toBe('@omni/ingestion');
  });
});
