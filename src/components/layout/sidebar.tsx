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
  User,
  Wallet,
  Inbox,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useDemoRequestsCount } from "@/hooks/use-demo-requests-count";
import { useBillingStatus } from "@/hooks/use-billing-status";
import { isSuperAdmin, canAdmin } from "@/lib/auth/can-manage";
import { isBillingEnabled } from "@/lib/billing/feature-flag";
import { APP_NAME, ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/lib/types";
import { AppLogo } from "@/components/shared/app-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Role = "super_admin" | "admin" | "manager" | "employee";

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
};

const topNavigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "admin", "manager", "employee"] },
  { name: "Horarios", href: "/schedule", icon: Calendar, roles: ["super_admin", "admin", "manager", "employee"] },
  { name: "Equidad", href: "/equidad", icon: BarChart3, roles: ["super_admin", "admin", "manager"] },
  { name: "Empleados", href: "/employees", icon: Users, roles: ["super_admin", "admin", "manager"] },
  { name: "Solicitudes", href: "/requests", icon: FileText, roles: ["super_admin", "admin", "manager", "employee"] },
  { name: "Facturación", href: "/facturacion", icon: CreditCard, roles: ["super_admin", "admin"] },
  { name: "Mi pago", href: "/mi-pago", icon: Wallet, roles: ["super_admin", "admin", "manager", "employee"] },
  { name: "Notificaciones", href: "/notifications", icon: Bell, roles: ["super_admin", "admin", "manager", "employee"] },
  { name: "Mi perfil", href: "/perfil", icon: User, roles: ["super_admin", "admin", "manager", "employee"] },
];

const payrollNavigation: NavItem[] = [
  { name: "Configuración", href: "/nomina/configuracion", icon: Wallet, roles: ["super_admin", "admin"] },
  { name: "Períodos", href: "/nomina/periodos", icon: FileText, roles: ["super_admin", "admin"] },
  { name: "Liquidaciones", href: "/nomina/liquidaciones", icon: FileText, roles: ["super_admin", "admin"] },
  { name: "Ausencias", href: "/nomina/ausencias", icon: CalendarDays, roles: ["super_admin", "admin", "manager"] },
];

const adminNavigation: NavItem[] = [
  { name: "Panel SaaS", href: "/super-admin", icon: LayoutDashboard, roles: ["super_admin"] },
  { name: "Solicitudes demo", href: "/admin/demo-requests", icon: Inbox, roles: ["super_admin"] },
];

const configNavigation: NavItem[] = [
  { name: "Sedes", href: "/locations", icon: MapPin, roles: ["super_admin", "admin"] },
  { name: "Departamentos", href: "/departments", icon: Building2, roles: ["super_admin", "admin", "manager"] },
  { name: "Posiciones", href: "/positions", icon: Briefcase, roles: ["super_admin", "admin", "manager"] },
  { name: "Turnos", href: "/shifts", icon: Clock, roles: ["super_admin", "admin", "manager"] },
  { name: "Necesidades", href: "/staffing", icon: ClipboardList, roles: ["super_admin", "admin", "manager"] },
  { name: "Tipos de contrato", href: "/contract-types", icon: FileSignature, roles: ["super_admin", "admin"] },
  { name: "Festivos", href: "/holidays", icon: CalendarDays, roles: ["super_admin", "admin", "manager"] },
  { name: "Ajustes", href: "/settings", icon: SlidersHorizontal, roles: ["super_admin", "admin"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut, activeOrg } = useAuth();

  const filteredTop = topNavigation.filter(
    (item) =>
      profile &&
      item.roles.includes(profile.role as Role) &&
      (item.href !== "/facturacion" || isBillingEnabled())
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

  const showAdminSection = isSuperAdmin((profile?.role ?? null) as UserRole | null);
  const demoRequestsCount = useDemoRequestsCount(showAdminSection);

  const showBillingBadge = canAdmin((profile?.role ?? null) as UserRole | null) && isBillingEnabled();
  const { isPastDue } = useBillingStatus(showBillingBadge);

  const adminActive = adminNavigation.some((item) => pathname.startsWith(item.href));
  const [adminOpen, setAdminOpen] = useState(adminActive);

  useEffect(() => {
    if (adminActive) setAdminOpen(true);
  }, [adminActive]);

  const renderBadge = (n: number) =>
    n > 0 ? (
      <span
        role="status"
        aria-label={`${n} solicitudes pendientes`}
        className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
      >
        {n > 99 ? "99+" : n}
      </span>
    ) : null;

  const renderLink = (item: NavItem, badge?: React.ReactNode) => {
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
        <span className="flex-1">{item.name}</span>
        {badge}
      </Link>
    );
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <AppLogo size={28} />
        <span className="ml-2 text-lg font-bold">{APP_NAME}</span>
      </div>

      {/* Navigation */}
      <nav aria-label="Navegación principal" className="flex-1 space-y-1 overflow-y-auto p-4">
        {filteredTop.map((item) =>
          renderLink(
            item,
            item.href === "/facturacion" && isPastDue
              ? renderBadge(1)
              : undefined
          )
        )}

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
                {filteredPayroll.map((item) => renderLink(item))}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        {showAdminSection && (
          <>
            <div className="my-2 border-t" />
            <Collapsible open={adminOpen} onOpenChange={setAdminOpen}>
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="flex-1 text-left">Admin SaaS</span>
                {renderBadge(demoRequestsCount)}
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    adminOpen && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 space-y-1 pl-3">
                {adminNavigation
                  .filter(
                    (item) =>
                      item.href !== "/admin/demo-requests" || !activeOrg
                  )
                  .map((item) =>
                    renderLink(
                      item,
                      item.href === "/admin/demo-requests"
                        ? renderBadge(demoRequestsCount)
                        : undefined
                    )
                  )}
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
                {filteredConfig.map((item) => renderLink(item))}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </nav>

      {/* User info */}
      <div className="border-t p-4">
        {profile ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {profile.first_name} {profile.last_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[profile.role]}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/perfil">
                  <User className="mr-2 h-4 w-4" />
                  Mi perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        )}
      </div>
    </div>
  );
}
