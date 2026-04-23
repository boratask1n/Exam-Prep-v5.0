import { Link, useLocation } from "wouter";
import { LayoutGrid, BookOpen, Sun, Moon, FolderKanban, NotebookPen, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { href: "/", icon: LayoutGrid, label: "Analiz" },
  { href: "/pool", icon: FolderKanban, label: "Soru Havuzu" },
  { href: "/questions/review", icon: Repeat2, label: "Soru Tekrarı" },
  { href: "/notes/feed", icon: NotebookPen, label: "Not Akışı" },
  { href: "/notes", icon: NotebookPen, label: "Notlar" },
  { href: "/tests", icon: BookOpen, label: "Test Merkezi" },
];

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
  const [logoPopping, setLogoPopping] = useState(false);
  const logoTimerRef = useRef<number | null>(null);
  const duckAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeDuckAudiosRef = useRef<Set<HTMLAudioElement>>(new Set());

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

  useEffect(() => {
    return () => {
      if (logoTimerRef.current) window.clearTimeout(logoTimerRef.current);
      if (duckAudioRef.current) {
        duckAudioRef.current.pause();
        duckAudioRef.current = null;
      }
      activeDuckAudiosRef.current.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      activeDuckAudiosRef.current.clear();
    };
  }, []);

  const playDuckQuack = () => {
    if (!duckAudioRef.current) {
      duckAudioRef.current = new Audio("/brand/duck-quack.mp3");
      duckAudioRef.current.preload = "auto";
      duckAudioRef.current.volume = 0.9;
    }

    const baseAudio = duckAudioRef.current;
    const audio = baseAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = 0.9;
    activeDuckAudiosRef.current.add(audio);

    const cleanup = () => {
      activeDuckAudiosRef.current.delete(audio);
      audio.onended = null;
      audio.onerror = null;
    };

    audio.onended = cleanup;
    audio.onerror = cleanup;

    void audio.play().catch(() => {
      cleanup();
      duckAudioRef.current = null;
      const fallbackAudio = new Audio("/brand/duck-quack.mp3");
      fallbackAudio.volume = 0.9;
      void fallbackAudio.play().catch(() => {});
    });
  };

  const handleLogoClick = () => {
    playDuckQuack();

    if (logoTimerRef.current) window.clearTimeout(logoTimerRef.current);
    setLogoPopping(false);
    window.requestAnimationFrame(() => {
      setLogoPopping(true);
      logoTimerRef.current = window.setTimeout(() => setLogoPopping(false), 560);
    });
  };

  const isItemActive = (href: string) => {
    if (href === "/") return location === "/" || location.startsWith("/analysis");
    if (href === "/notes") {
      return location === "/notes" || location === "/notes/tyt" || location === "/notes/ayt";
    }
    return location === href || location.startsWith(`${href}/`);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background selection:bg-primary/20">
      <aside className="hidden w-[17rem] flex-col border-r border-border/60 bg-white/94 shadow-[10px_0_30px_-28px_rgba(15,23,42,0.32)] md:flex dark:border-white/8 dark:bg-slate-950/90">
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          <button
            type="button"
            onClick={handleLogoClick}
            className={cn(
              "duck-logo-button flex h-12 w-12 items-center justify-center overflow-hidden rounded-[1.15rem] border border-primary/20 bg-white shadow-[0_18px_34px_-26px_rgba(147,51,234,0.55)] transition-transform hover:-translate-y-0.5 dark:border-primary/18 dark:bg-white/8",
              logoPopping && "duck-logo-pop",
            )}
            aria-label="Duck sesini çal"
            title="Quack!"
          >
            <img
              src="/brand/exam-duck-logo-256.png"
              alt="Exam Duck"
              className="h-11 w-11 object-contain"
              draggable={false}
            />
          </button>
          <div>
            <span className="block font-display text-[1.1rem] font-semibold tracking-[-0.035em] text-foreground">
              Exam Duck
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              Koç Duck ile Çalışmaya Başla
            </span>
          </div>
        </div>

        <div className="px-5 pb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/75">
          Çalışma Alanı
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-3">
          {navItems.map((item) => {
            const isActive = isItemActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-[1.15rem] px-3.5 py-3 text-[0.95rem] font-medium transition-colors duration-150",
                  isActive
                    ? "bg-primary/9 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] dark:bg-primary/14 dark:text-white"
                    : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                {isActive && (
                  <div className="absolute left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary/80" />
                )}
                <item.icon
                  className={cn("h-4.5 w-4.5", isActive && "text-primary")}
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
            className="flex w-full items-center gap-3 rounded-[1.15rem] px-4 py-3 text-[0.95rem] font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
          >
            {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            {isDark ? "Aydınlık Mod" : "Karanlık Mod"}
          </button>
          {onLogout ? (
            <button
              onClick={onLogout}
              className="mt-1.5 flex w-full items-center gap-3 rounded-[1.15rem] px-4 py-3 text-[0.95rem] font-medium text-rose-500 transition-colors duration-150 hover:bg-rose-500/10 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-200"
            >
              Oturumu Kapat
            </button>
          ) : null}
          {onDeleteAccount ? (
            <button
              onClick={onDeleteAccount}
              className="mt-1 flex w-full items-center gap-3 rounded-[1.15rem] px-4 py-2.5 text-[0.86rem] font-medium text-muted-foreground transition-colors duration-150 hover:bg-rose-500/8 hover:text-rose-600 dark:hover:text-rose-200"
            >
              Hesabı Sil
            </button>
          ) : null}
        </div>
      </aside>

      <nav className="fixed bottom-0 left-3 right-3 z-50 mb-3 flex h-16 items-center justify-around rounded-[1.4rem] border border-border/60 bg-white/94 px-6 shadow-[0_16px_30px_-26px_rgba(15,23,42,0.30)] md:hidden dark:border-white/8 dark:bg-slate-950/90">
        {navItems.map((item) => {
          const isActive = isItemActive(item.href);

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
        <div className="relative h-full">{children}</div>
      </main>
    </div>
  );
}
