import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

function NotifItem({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  const navigate = useNavigate();
  const isUnread = !n.read_at;

  return (
    <button
      onClick={() => {
        if (isUnread) onRead(n.id);
        if (n.link) navigate(n.link);
      }}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:bg-muted/50 ${
        isUnread ? 'bg-accent/10' : ''
      }`}
    >
      <p className={`text-sm leading-snug ${isUnread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
        {n.title}
      </p>
      {n.body && (
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
      )}
      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
      </p>
    </button>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

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
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <NotifItem key={n.id} n={n} onRead={markRead} />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
