import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

export type TableWithOrgId =
  | 'profiles'
  | 'locations'
  | 'departments'
  | 'positions'
  | 'shift_templates'
  | 'schedules'
  | 'schedule_entries'
  | 'staffing_requirements'
  | 'time_off_requests'
  | 'shift_swap_requests'
  | 'notifications'
  | 'app_settings'
  | 'payroll_settings'
  | 'contract_types'
  | 'contract_rest_rules'
  | 'employee_rest_rules'
  | 'payroll_periods'
  | 'payroll_entries'
  | 'holidays'
  | 'employee_equity_rollups'
  | 'employee_secondary_positions'
  | 'salary_history'
  | 'salary_adjustments'
  | 'payroll_provisions'
  | 'payroll_employer_cost'
  | 'absence_records'
  | 'tax_personal_deductions';

export class CrossTenantError extends Error {
  constructor(public table: string, public resourceId: string) {
    super(`Cross-tenant access denied: ${table}/${resourceId}`);
    this.name = 'CrossTenantError';
  }
}

export async function assertSameOrg(
  supabase: SupabaseClient<Database>,
  callerOrgId: string | null,
  resourceId: string,
  table: TableWithOrgId
): Promise<void> {
  if (callerOrgId === null) return;

  const { data, error } = await (supabase
    .from(table)
    .select('organization_id') as unknown as {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { organization_id: string } | null; error: unknown }> };
    })
    .eq('id', resourceId)
    .maybeSingle();

  if (error || !data) {
    throw new CrossTenantError(table, resourceId);
  }
  if ((data as { organization_id: string }).organization_id !== callerOrgId) {
    throw new CrossTenantError(table, resourceId);
  }
}

export async function getCallerContext(supabase: SupabaseClient<Database>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) throw new Response('Profile not found', { status: 401 });

  const isSuperAdmin = profile.role === 'super_admin';

  return {
    userId: profile.id,
    role: profile.role,
    orgId: isSuperAdmin ? null : (profile as { organization_id: string }).organization_id,
    isSuperAdmin,
  };
}
