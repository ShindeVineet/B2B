import type { AuthUser } from '../auth';
import { getLeadEditFilterForUser } from '../permissions';

// Phone follow-ups and the group marker are editable by scoped staff, not all readers.
export function contactEditFilter(user: AuthUser) {
  // Store Associates work from a shared calling view and may log calls against
  // any open lead. Assignment ownership remains B2B Head-only elsewhere.
  if (user.role === 'store_associate') return {};
  return user.role === 'ground_rep' ? { assigned_ground_rep_id: user.id } : getLeadEditFilterForUser(user);
}
