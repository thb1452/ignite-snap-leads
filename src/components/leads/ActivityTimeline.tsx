import { motion } from "framer-motion";
import { Phone, Mail, MessageSquare, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface LeadActivity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface ActivityTimelineProps {
  activities: LeadActivity[];
}

const getActivityIcon = (status: string) => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('call')) return Phone;
  if (statusLower.includes('email')) return Mail;
  if (statusLower.includes('sms') || statusLower.includes('text')) return MessageSquare;
  if (statusLower.includes('interested')) return CheckCircle2;
  if (statusLower.includes('no answer') || statusLower.includes('not interested')) return XCircle;
  return AlertCircle;
};

const getActivityColor = (status: string) => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('interested') || statusLower.includes('offer')) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (statusLower.includes('no answer') || statusLower.includes('not interested')) return 'text-slate-500 bg-slate-50 border-slate-200';
  if (statusLower.includes('call')) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (statusLower.includes('email')) return 'text-purple-600 bg-purple-50 border-purple-200';
  if (statusLower.includes('sms')) return 'text-green-600 bg-green-50 border-green-200';
  return 'text-ink-600 bg-slate-50 border-slate-200';
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 text-center">
        <Clock className="h-12 w-12 mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-medium text-ink-700 mb-1">No activity yet</p>
        <p className="text-xs text-ink-400">Send your first outreach to get started</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 shadow-[0_1px_0_0_rgba(16,24,40,.04)] bg-white p-5 md:p-6">
      <div className="text-sm font-medium mb-4 text-ink-700 font-ui">Activity Timeline</div>
      <ol className="relative border-s border-slate-200 ml-3 space-y-4">
        {activities.map((activity, index) => {
          const Icon = getActivityIcon(activity.status);
          const colorClass = getActivityColor(activity.status);
          
          return (
            <motion.li
              key={activity.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="ms-4"
            >
              <div className={`absolute -left-[13px] mt-1.5 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center ${colorClass}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-ink-800 text-sm">{activity.status}</div>
                  <span className="text-xs text-ink-400 whitespace-nowrap">
                    {formatTimeAgo(activity.created_at)}
                  </span>
                </div>
                {activity.notes && (
                  <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{activity.notes}</p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
