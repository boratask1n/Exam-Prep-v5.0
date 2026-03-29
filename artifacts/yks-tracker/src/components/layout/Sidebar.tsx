import { Link, useLocation } from "wouter";
import { PenTool, LayoutGrid, BookOpen, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

function getInitialDark(): boolean {
  try {
    const stored = localStorage.getItem("yks-dark-mode");
    if (stored !== null) return stored === "true";
  } catch {}
  return true;
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isDark, setIsDark] = useState(getInitialDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
    try { localStorage.setItem("yks-dark-mode", String(isDark)); } catch {}
  }, [isDark]);

  // Apply on mount without waiting for state change
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);

  const navItems = [
    { href: "/", icon: LayoutGrid, label: "Soru Havuzu" },
    { href: "/tests", icon: BookOpen, label: "Testlerim & Oluştur" },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-72 flex-col border-r border-border/50 bg-card/50 backdrop-blur-xl z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <PenTool className="text-white h-5 w-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            YKS Tracker
          </span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 group relative",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary rounded-r-full" />
                )}
                <item.icon className={cn("h-5 w-5 transition-transform duration-200", isActive ? "scale-110" : "group-hover:scale-110")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-border/50">
          <button
            onClick={() => setIsDark(!isDark)}
            className="flex items-center w-full gap-3 px-4 py-3 rounded-xl font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-200"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {isDark ? "Aydınlık Mod" : "Karanlık Mod"}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/80 backdrop-blur-xl border-t border-border/50 z-50 flex items-center justify-around px-6">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "fill-primary/20")} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto relative pb-16 md:pb-0">
        <div className="absolute inset-0 bg-[url('/images/hero-bg.png')] bg-cover bg-center opacity-[0.03] pointer-events-none mix-blend-screen" />
        <div className="relative h-full">{children}</div>
      </main>
    </div>
  );
}
