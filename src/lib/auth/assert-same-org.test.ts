import { describe, it, expect, vi } from 'vitest';
import { assertSameOrg, getCallerContext, CrossTenantError } from './assert-same-org';
import type { SupabaseClient } from '@supabase/supabase-js';

function mockSupabaseFor(orgIdResult: string | null | undefined, errorResult: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: orgIdResult === undefined ? null : { organization_id: orgIdResult },
    error: errorResult,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as SupabaseClient;
}

describe('assertSameOrg', () => {
  const ORG_A = '00000000-0000-0000-0000-000000000001';
  const ORG_B = '00000000-0000-0000-0000-000000000002';

  it('no throw cuando callerOrgId === resource.organization_id', async () => {
    const sb = mockSupabaseFor(ORG_A);
    await expect(assertSameOrg(sb, ORG_A, 'res-1', 'profiles')).resolves.toBeUndefined();
  });

  it('throws CrossTenantError cuando orgs distintos', async () => {
    const sb = mockSupabaseFor(ORG_B);
    await expect(assertSameOrg(sb, ORG_A, 'res-1', 'profiles'))
      .rejects.toBeInstanceOf(CrossTenantError);
  });

  it('throws CrossTenantError cuando recurso no existe', async () => {
    const sb = mockSupabaseFor(undefined);
    await expect(assertSameOrg(sb, ORG_A, 'missing', 'profiles'))
      .rejects.toBeInstanceOf(CrossTenantError);
  });

  it('super_admin (callerOrgId=null) skipea check', async () => {
    const sb = mockSupabaseFor(ORG_B);
    await expect(assertSameOrg(sb, null, 'res-1', 'profiles')).resolves.toBeUndefined();
  });

  it('throws CrossTenantError ante error de Supabase', async () => {
    const sb = mockSupabaseFor(undefined, new Error('db down'));
    await expect(assertSameOrg(sb, ORG_A, 'res-1', 'profiles'))
      .rejects.toBeInstanceOf(CrossTenantError);
  });
});
