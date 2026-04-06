import { Link, useLocation } from "wouter";
import { PenTool, LayoutGrid, BookOpen, Sun, Moon, FolderKanban, BarChart3, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

function getInitialDark(): boolean {
  try {
    const stored = localStorage.getItem("yks-dark-mode");
    if (stored !== null) return stored === "true";
  } catch {}
  return false;
}

export function Sidebar({ children }: { children: React.ReactNode }) {
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
    { href: "/notes/tyt", icon: NotebookPen, label: "Notlar TYT" },
    { href: "/notes/ayt", icon: NotebookPen, label: "Notlar AYT" },
    { href: "/tests", icon: BookOpen, label: "Testlerim ve Oluştur" },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background selection:bg-primary/20">
      <aside className="glass-panel hidden w-72 flex-col rounded-none border-r md:flex">
        <div className="flex items-center gap-3 p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-[1.35rem] border border-white/60 bg-white/70 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/5">
            <PenTool className="h-5 w-5 text-primary" />
          </div>
          <span className="font-display text-xl font-semibold tracking-[-0.04em] text-foreground">
            YKS Tracker
          </span>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-[1.25rem] px-4 py-3 font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                {isActive && (
                  <div className="absolute left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-primary" />
                )}
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-transform duration-200",
                    isActive ? "scale-110" : "group-hover:scale-110",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border/50 p-4">
          <button
            onClick={() => setIsDark(!isDark)}
            className="flex w-full items-center gap-3 rounded-[1.25rem] px-4 py-3 font-medium text-muted-foreground transition-all duration-200 hover:bg-foreground/[0.04] hover:text-foreground"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {isDark ? "Aydınlık Mod" : "Karanlık Mod"}
          </button>
        </div>
      </aside>

      <nav className="glass-panel fixed bottom-0 left-3 right-3 z-50 mb-3 flex h-16 items-center justify-around rounded-[1.4rem] px-6 md:hidden">
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
              "radial-gradient(circle at top, hsl(var(--primary) / 0.08), transparent 34%), linear-gradient(180deg, transparent, hsl(var(--background) / 0.24))",
          }}
        />
        <div className="relative h-full">{children}</div>
      </main>
    </div>
  );
}

