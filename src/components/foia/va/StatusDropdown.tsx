import { cn } from '@/lib/utils';
import type { FoiaRequestStatus } from '@/types/foia';
import { STATUS_LABELS, STATUS_COLORS } from '@/types/foia';

interface StatusDropdownProps {
  value: FoiaRequestStatus;
  onChange: (value: FoiaRequestStatus) => void;
  disabled?: boolean;
}

const STATUSES: FoiaRequestStatus[] = [
  'pending',
  'sent',
  'rejected',
  'fulfilled',
  'no_portal',
  'needs_review',
];

export function StatusDropdown({ value, onChange, disabled }: StatusDropdownProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FoiaRequestStatus)}
      disabled={disabled}
      className={cn(
        'border rounded-lg px-2 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-500 disabled:opacity-60',
        STATUS_COLORS[value],
        'border-current/20'
      )}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} className="bg-white text-slate-900">
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
