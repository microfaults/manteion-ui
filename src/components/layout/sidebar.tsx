import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  BoxesIcon,
  Database,
  FlaskConical,
  Network,
  Play,
  Settings2,
  ShieldAlert,
  Waypoints,
  Workflow,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "Observe",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
      { to: "/services", label: "Services", icon: Network },
    ],
  },
  {
    title: "Configure",
    items: [
      { to: "/rules", label: "Rules", icon: ShieldAlert },
      { to: "/faults", label: "Faults", icon: Activity },
      { to: "/workflows", label: "Workflows", icon: Workflow },
      { to: "/datasets", label: "Datasets", icon: Database },
    ],
  },
  {
    title: "Run",
    items: [
      { to: "/experiments", label: "Experiments", icon: FlaskConical },
      { to: "/runs", label: "Runs", icon: Play },
      { to: "/attacks", label: "Attacks", icon: Waypoints },
    ],
  },
  {
    title: "Settings",
    items: [{ to: "/settings/environments", label: "Environments", icon: Settings2 }],
  },
];

export function Sidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const env = (import.meta.env?.VITE_DEFAULT_ENV as string | undefined) ?? "online-boutique";

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      {/* Brand + environment */}
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <BoxesIcon className="size-5 text-sidebar-primary" aria-hidden />
          Faults Lab
        </div>
        <div className="mt-1 text-xs text-sidebar-foreground/60">{env}</div>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {section.title}
            </div>
            <ul>
              {section.items.map((item) => {
                const isActive = currentPath === item.to || currentPath.startsWith(`${item.to}/`);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}
                    >
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-sidebar-primary"
                        />
                      )}
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-sidebar-border px-5 py-3 text-[10px] text-sidebar-foreground/40">
        manteion-ui · v0.1
      </div>
    </nav>
  );
}
