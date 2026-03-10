import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAlerts, UserAlert } from '@/hooks/useAlerts';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

function AlertItem({ alert, onRead }: { alert: UserAlert; onRead: (id: string) => void }) {
  const navigate = useNavigate();
  const address = alert.properties
    ? `${alert.properties.address}, ${alert.properties.city}`
    : 'Unknown property';

  return (
    <button
      onClick={() => {
        if (!alert.is_read) onRead(alert.id);
        if (alert.property_id) navigate(`/properties`);
      }}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:bg-muted/50 ${
        !alert.is_read ? 'bg-accent/10' : ''
      }`}
    >
      <p className={`text-sm leading-snug ${!alert.is_read ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
        {alert.title}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">{address}</p>
      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
      </p>
    </button>
  );
}

export function NotificationBell() {
  const { alerts, unreadCount, markRead, markAllRead } = useAlerts();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {alerts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            alerts.slice(0, 20).map((alert) => (
              <AlertItem key={alert.id} alert={alert} onRead={markRead} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
