"use client";

import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  Repeat,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import type { NotificationType } from "@/lib/types";

const ICON_MAP: Record<NotificationType, React.ReactNode> = {
  schedule_published: <Calendar className="h-5 w-5 text-blue-500" />,
  shift_change: <Clock className="h-5 w-5 text-amber-500" />,
  request_update: <FileText className="h-5 w-5 text-green-500" />,
  swap_request: <Repeat className="h-5 w-5 text-purple-500" />,
  general: <Bell className="h-5 w-5 text-gray-500" />,
};

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } =
    useNotifications();

  function handleClick(id: string, link: string | null, isRead: boolean) {
    if (!isRead) {
      markAsRead(id);
    }
    if (link) {
      router.push(link);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notificaciones</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} sin leer`
              : "Todas las notificaciones leídas"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium mb-1">Sin notificaciones</h3>
          <p className="text-sm text-muted-foreground">
            Cuando haya novedades, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-accent/50",
                !notification.is_read && "border-primary/20 bg-primary/5"
              )}
              onClick={() =>
                handleClick(
                  notification.id,
                  notification.link,
                  notification.is_read
                )
              }
            >
              <CardContent className="flex items-start gap-4 p-4">
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {ICON_MAP[notification.type] || ICON_MAP.general}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={cn(
                        "text-sm",
                        !notification.is_read ? "font-semibold" : "font-medium"
                      )}
                    >
                      {notification.title}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(notification.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {notification.message}
                  </p>
                </div>

                {/* Unread dot */}
                {!notification.is_read && (
                  <div className="flex-shrink-0 mt-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
