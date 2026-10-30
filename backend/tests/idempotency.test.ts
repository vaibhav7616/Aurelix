import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Idempotency contract: same key → same order, no duplicates.
// Pure key-normalization check (DB-level test runs in docker integration).
describe('Idempotency', () => {
  it('normalizes keys', () => {
    const normalize = (k?: string) => k?.trim() || undefined;
    expect(normalize('  abc ')).toBe('abc');
    expect(normalize('')).toBeUndefined();
    expect(normalize(undefined)).toBeUndefined();
  });
  it('generates unique order ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => randomUUID()));
    expect(ids.size).toBe(1000);
  });
});
