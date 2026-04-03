"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";

interface NavbarProps {
  onMenuClick: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { profile } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center border-b bg-card px-4 lg:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Abrir menú"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Button>

      <div className="flex-1" />

      {/* Notifications */}
      <Link href="/notifications">
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notificaciones (${unreadCount} sin leer)`
              : "Notificaciones"
          }
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </Link>

      {/* User avatar */}
      {profile && (
        <div className="ml-3 flex items-center gap-2">
          <div
            className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground"
            aria-label={`${profile.first_name} ${profile.last_name}`}
          >
            {profile.first_name[0]}
            {profile.last_name[0]}
          </div>
        </div>
      )}
    </header>
  );
}
