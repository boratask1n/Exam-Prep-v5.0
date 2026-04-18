import { Link, useLocation } from "wouter";
import { PenTool, LayoutGrid, BookOpen, Sun, Moon, FolderKanban, BarChart3, NotebookPen, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

function getInitialDark(): boolean {
  try {
    const stored = localStorage.getItem("yks-dark-mode");
    if (stored !== null) return stored === "true";
  } catch {}
  return false;
}

type SidebarProps = {
  children: React.ReactNode;
  userName?: string;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
};

export function Sidebar({ children, userName, onLogout, onDeleteAccount }: SidebarProps) {
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
    try {
      localStorage.setItem("yks-dark-mode", String(isDark));
    } catch {}
  }, [isDark]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);

  const navItems = [
    { href: "/", icon: LayoutGrid, label: "Analiz" },
    { href: "/analysis/charts", icon: BarChart3, label: "Grafikler" },
    { href: "/pool", icon: FolderKanban, label: "Soru Havuzu" },
    { href: "/questions/review", icon: Repeat2, label: "Soru Tekrarı" },
    { href: "/notes/feed", icon: NotebookPen, label: "Not Akışı" },
    { href: "/notes/tyt", icon: NotebookPen, label: "TYT Notlar" },
    { href: "/notes/ayt", icon: NotebookPen, label: "AYT Notlar" },
    { href: "/tests", icon: BookOpen, label: "Test Merkezi" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background selection:bg-primary/20">
      <aside className="hidden w-[17rem] flex-col border-r border-border/60 bg-white/76 shadow-[16px_0_50px_-44px_rgba(15,23,42,0.4)] backdrop-blur-xl md:flex dark:border-white/8 dark:bg-slate-950/62">
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-primary/18 bg-primary/10 shadow-[0_16px_32px_-28px_rgba(76,111,255,0.42)] dark:border-primary/15 dark:bg-primary/14">
            <PenTool className="h-5 w-5 text-primary" />
          </div>
          <span className="font-display text-[1.08rem] font-semibold tracking-[-0.04em] text-foreground">
            YKS Tracker
          </span>
        </div>

        <div className="px-5 pb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/75">
          Çalışma Alanı
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-3">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-[1.15rem] px-3.5 py-3 text-[0.95rem] font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/9 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:bg-primary/14 dark:text-white"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                {isActive && (
                  <div className="absolute left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary/80" />
                )}
                <item.icon
                  className={cn(
                    "h-4.5 w-4.5 transition-transform duration-200",
                    isActive ? "scale-105 text-primary" : "group-hover:scale-105",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border/50 p-3">
          {userName ? (
            <div className="mb-2 rounded-[1rem] border border-border/55 bg-background/70 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/75">Aktif kullanıcı</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{userName}</p>
            </div>
          ) : null}
          <button
            onClick={() => setIsDark(!isDark)}
            className="flex w-full items-center gap-3 rounded-[1.15rem] px-4 py-3 text-[0.95rem] font-medium text-muted-foreground transition-all duration-200 hover:bg-foreground/[0.04] hover:text-foreground"
          >
            {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            {isDark ? "Aydınlık Mod" : "Karanlık Mod"}
          </button>
          {onLogout ? (
            <button
              onClick={onLogout}
              className="mt-1.5 flex w-full items-center gap-3 rounded-[1.15rem] px-4 py-3 text-[0.95rem] font-medium text-rose-500 transition-all duration-200 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200"
            >
              Oturumu Kapat
            </button>
          ) : null}
          {onDeleteAccount ? (
            <button
              onClick={onDeleteAccount}
              className="mt-1 flex w-full items-center gap-3 rounded-[1.15rem] px-4 py-2.5 text-[0.86rem] font-medium text-muted-foreground transition-all duration-200 hover:bg-rose-500/8 hover:text-rose-600 dark:hover:text-rose-200"
            >
              Hesabı Sil
            </button>
          ) : null}
        </div>
      </aside>

      <nav className="fixed bottom-0 left-3 right-3 z-50 mb-3 flex h-16 items-center justify-around rounded-[1.4rem] border border-border/60 bg-white/82 px-6 shadow-[0_22px_40px_-32px_rgba(15,23,42,0.34)] backdrop-blur-xl md:hidden dark:border-white/8 dark:bg-slate-950/74">
        {navItems.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-full w-16 flex-col items-center justify-center gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "fill-primary/15")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="relative h-screen flex-1 overflow-y-auto pb-16 md:pb-0">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at top, hsl(var(--primary) / 0.055), transparent 31%), linear-gradient(180deg, transparent, hsl(var(--background) / 0.18))",
          }}
        />
        <div className="relative h-full">{children}</div>
      </main>
    </div>
  );
}

