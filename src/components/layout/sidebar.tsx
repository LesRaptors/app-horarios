"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Users,
  MapPin,
  Building2,
  Briefcase,
  Clock,
  ClipboardList,
  FileText,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { APP_NAME, ROLE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "employee"] },
  { name: "Horarios", href: "/schedule", icon: Calendar, roles: ["admin", "manager", "employee"] },
  { name: "Empleados", href: "/employees", icon: Users, roles: ["admin", "manager"] },
  { name: "Sedes", href: "/locations", icon: MapPin, roles: ["admin"] },
  { name: "Departamentos", href: "/departments", icon: Building2, roles: ["admin", "manager"] },
  { name: "Posiciones", href: "/positions", icon: Briefcase, roles: ["admin", "manager"] },
  { name: "Turnos", href: "/shifts", icon: Clock, roles: ["admin", "manager"] },
  { name: "Necesidades", href: "/staffing", icon: ClipboardList, roles: ["admin", "manager"] },
  { name: "Solicitudes", href: "/requests", icon: FileText, roles: ["admin", "manager", "employee"] },
  { name: "Notificaciones", href: "/notifications", icon: Bell, roles: ["admin", "manager", "employee"] },
  { name: "Configuración", href: "/settings", icon: Settings, roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  const filteredNav = navigation.filter(
    (item) => profile && item.roles.includes(profile.role)
  );

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Calendar className="h-6 w-6 text-primary" />
        <span className="ml-2 text-lg font-bold">{APP_NAME}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {filteredNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t p-4">
        {profile && (
          <div className="mb-3">
            <p className="text-sm font-medium">
              {profile.first_name} {profile.last_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[profile.role]}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
