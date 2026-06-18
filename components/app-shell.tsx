import clsx from "clsx";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarClock,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShieldCheck,
  TrendingUp
} from "lucide-react";
import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard", label: "Campaigns", icon: BarChart3 },
  { href: "/dashboard", label: "Alerts", icon: AlertTriangle },
  { href: "/dashboard", label: "Telegram", icon: MessageCircle },
  { href: "/dashboard", label: "Scheduler", icon: CalendarClock },
  { href: "/dashboard", label: "Agent", icon: Bot },
  { href: "/dashboard", label: "Scaling", icon: TrendingUp },
  { href: "/dashboard", label: "Safety", icon: ShieldCheck },
  { href: "/dashboard", label: "Settings", icon: Settings }
];

type AppShellProps = {
  activePath: string;
  children: React.ReactNode;
};

export function AppShell({ activePath, children }: AppShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-line bg-white/85 px-4 py-5 lg:block">
        <Link href="/dashboard" className="block rounded-lg bg-ink p-4 text-white">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-skyglass">Meta Ads Agent</span>
          <p className="mt-2 text-lg font-semibold leading-6">Read-only monitoring and Telegram reports</p>
        </Link>
        <nav className="mt-5 flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === activePath;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                  active ? "bg-skyglass text-palm" : "text-ink/70 hover:bg-field hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">Meta Ads / Telegram / daily monitoring</p>
              <p className="text-sm font-semibold text-ink">Workspace: local service-business ad performance</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-md border border-line bg-field px-3 py-2 text-sm font-medium sm:inline-flex">
                Read-only mode
              </span>
              <span className="rounded-full bg-palm px-3 py-2 text-xs font-semibold text-white">MA</span>
            </div>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
            {navItems.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const active = item.href === activePath;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
                    active ? "border-palm bg-skyglass text-palm" : "border-line bg-white text-ink/70"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="w-full px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
