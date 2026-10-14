import type { AuthUser } from '../auth';
import { getLeadEditFilterForUser } from '../permissions';

// Phone follow-ups and the group marker are editable by scoped staff, not all readers.
export function contactEditFilter(user: AuthUser) {
  return user.role === 'ground_rep' ? { assigned_ground_rep_id: user.id } : getLeadEditFilterForUser(user);
}
