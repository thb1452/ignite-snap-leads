/** Pure CRM validation and date rules shared by UI and isolated tests. */
export const OUTCOMES = ['reached_owner', 'no_answer', 'wrong_number', 'research', 'offer_sent', 'appointment', 'do_not_contact'] as const;
export type Outcome = typeof OUTCOMES[number];
export const outcomeLabel = (value: string) => value.replace(/_/g, ' ');
export const crmKey = (userId: string | undefined, kind?: string, id?: string) =>
  ['crm', userId ?? 'signed-out', ...(kind ? [kind] : []), ...(id ? [id] : [])] as const;
export const propertyLink = (id: string) => `/properties?propertyId=${encodeURIComponent(id)}`;
export function parseMoney(input: string): number | null {
  if (!input.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(input.trim())) throw new Error('Enter a non-negative amount with at most two decimal places.');
  const value = Number(input);
  if (!Number.isFinite(value) || value > 999999999999.99) throw new Error('Amount is too large.');
  return value;
}
export function nextActionInput(action: string, localDue: string): { next_action: string | null; next_follow_up_at: string | null } {
  const title = action.trim();
  if (title.length > 500) throw new Error('Keep the next action under 500 characters.');
  if (!!title !== !!localDue) throw new Error('Enter both a next action and a due date, or clear both.');
  if (!title) return { next_action: null, next_follow_up_at: null };
  const due = new Date(localDue);
  if (!Number.isFinite(due.getTime())) throw new Error('Choose a valid due date.');
  return { next_action: title, next_follow_up_at: due.toISOString() };
}
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}
export function dueBucket(iso: string | null, now = new Date()): 'overdue' | 'today' | 'upcoming' | 'unscheduled' {
  if (!iso) return 'unscheduled';
  const due = new Date(iso);
  if (!Number.isFinite(due.getTime())) return 'unscheduled';
  if (due.getTime() < now.getTime()) return 'overdue';
  return due.toDateString() === now.toDateString() ? 'today' : 'upcoming';
}
export function validateContact(input: {name:string; phone:string; email:string; source:string}) {
  if (!input.name.trim() || input.name.length > 160) throw new Error('Enter a name up to 160 characters.');
  if (!input.source.trim() || input.source.length > 500) throw new Error('Record where this contact information came from.');
  if (input.phone.length > 50 || (input.phone && !/^[+\d\s().x-]+$/.test(input.phone))) throw new Error('Check the phone number.');
  if (input.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254)) throw new Error('Check the email address.');
}
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : '') + text.replace(/"/g,'""')}"`;
}
