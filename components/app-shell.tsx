import clsx from "clsx";
import {
  BriefcaseBusiness,
  CreditCard,
  FileText,
  LayoutDashboard,
  MailCheck,
  Settings,
  Shield,
  Sparkles,
  UserCircle,
  UsersRound
} from "lucide-react";
import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Command", icon: LayoutDashboard },
  { href: "/dashboard", label: "Resume", icon: FileText },
  { href: "/dashboard", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/dashboard", label: "AI Tailor", icon: Sparkles },
  { href: "/dashboard", label: "Apply", icon: MailCheck },
  { href: "/admin", label: "Admin", icon: UsersRound },
  { href: "/dashboard", label: "Billing", icon: CreditCard },
  { href: "/dashboard", label: "Security", icon: Shield },
  { href: "/account", label: "Account", icon: UserCircle },
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
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-skyglass">ApplySharp</span>
          <p className="mt-2 text-lg font-semibold leading-6">AI job search and resume tailoring</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">Resume truth engine / ATS / one-click apply</p>
              <p className="text-sm font-semibold text-ink">User workspace: Malaysia job market</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-md border border-line bg-field px-3 py-2 text-sm font-medium sm:inline-flex">
                Pro trial
              </span>
              <span className="rounded-full bg-palm px-3 py-2 text-xs font-semibold text-white">AS</span>
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
