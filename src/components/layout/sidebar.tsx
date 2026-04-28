"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  BarChart3,
  Users,
  MapPin,
  Building2,
  Briefcase,
  Clock,
  ClipboardList,
  FileText,
  Bell,
  Settings,
  SlidersHorizontal,
  FileSignature,
  CalendarDays,
  ChevronDown,
  LogOut,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { APP_NAME, ROLE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Role = "admin" | "manager" | "employee";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
};

const topNavigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "employee"] },
  { name: "Horarios", href: "/schedule", icon: Calendar, roles: ["admin", "manager", "employee"] },
  { name: "Equidad", href: "/equidad", icon: BarChart3, roles: ["admin", "manager"] },
  { name: "Empleados", href: "/employees", icon: Users, roles: ["admin", "manager"] },
  { name: "Solicitudes", href: "/requests", icon: FileText, roles: ["admin", "manager", "employee"] },
  { name: "Mi pago", href: "/mi-pago", icon: Wallet, roles: ["admin", "manager", "employee"] },
  { name: "Notificaciones", href: "/notifications", icon: Bell, roles: ["admin", "manager", "employee"] },
];

const payrollNavigation: NavItem[] = [
  { name: "Configuración", href: "/nomina/configuracion", icon: Wallet, roles: ["admin"] },
  { name: "Períodos", href: "/nomina/periodos", icon: FileText, roles: ["admin"] },
  { name: "Ausencias", href: "/nomina/ausencias", icon: CalendarDays, roles: ["admin", "manager"] },
];

const configNavigation: NavItem[] = [
  { name: "Sedes", href: "/locations", icon: MapPin, roles: ["admin"] },
  { name: "Departamentos", href: "/departments", icon: Building2, roles: ["admin", "manager"] },
  { name: "Posiciones", href: "/positions", icon: Briefcase, roles: ["admin", "manager"] },
  { name: "Turnos", href: "/shifts", icon: Clock, roles: ["admin", "manager"] },
  { name: "Necesidades", href: "/staffing", icon: ClipboardList, roles: ["admin", "manager"] },
  { name: "Tipos de contrato", href: "/contract-types", icon: FileSignature, roles: ["admin"] },
  { name: "Festivos", href: "/holidays", icon: CalendarDays, roles: ["admin", "manager"] },
  { name: "Ajustes", href: "/settings", icon: SlidersHorizontal, roles: ["admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  const filteredTop = topNavigation.filter(
    (item) => profile && item.roles.includes(profile.role as Role)
  );
  const filteredConfig = configNavigation.filter(
    (item) => profile && item.roles.includes(profile.role as Role)
  );

  const configActive = filteredConfig.some((item) =>
    pathname.startsWith(item.href)
  );

  const [configOpen, setConfigOpen] = useState(configActive);

  useEffect(() => {
    if (configActive) setConfigOpen(true);
  }, [configActive]);

  const filteredPayroll = payrollNavigation.filter(
    (item) => profile && item.roles.includes(profile.role as Role)
  );

  const payrollActive = filteredPayroll.some((item) =>
    pathname.startsWith(item.href)
  );

  const [payrollOpen, setPayrollOpen] = useState(payrollActive);

  useEffect(() => {
    if (payrollActive) setPayrollOpen(true);
  }, [payrollActive]);

  const renderLink = (item: NavItem) => {
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
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Calendar className="h-6 w-6 text-primary" />
        <span className="ml-2 text-lg font-bold">{APP_NAME}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {filteredTop.map(renderLink)}

        {filteredPayroll.length > 0 && (
          <>
            <div className="my-2 border-t" />
            <Collapsible open={payrollOpen} onOpenChange={setPayrollOpen}>
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Wallet className="h-4 w-4" />
                <span className="flex-1 text-left">Nómina</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    payrollOpen && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-1 pl-3">
                {filteredPayroll.map(renderLink)}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {filteredConfig.length > 0 && (
          <>
            <div className="my-2 border-t" />
            <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Settings className="h-4 w-4" />
                <span className="flex-1 text-left">Configuración</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    configOpen && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-1 pl-3">
                {filteredConfig.map(renderLink)}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
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
