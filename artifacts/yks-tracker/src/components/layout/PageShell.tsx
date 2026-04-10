import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidthClassName?: string;
};

type PageHeaderProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

type PageSectionProps = {
  children: ReactNode;
  className?: string;
};

export function PageShell({
  children,
  className,
  contentClassName,
  maxWidthClassName = "max-w-7xl",
}: PageShellProps) {
  return (
    <div className={cn("relative min-h-full w-full overflow-x-hidden px-4 py-6 text-slate-900 sm:px-6 sm:py-8 dark:text-white", className)}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[-9rem] top-[-7rem] h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-[-8rem] top-[28%] h-56 w-56 rounded-full bg-accent/14 blur-3xl" />
      </div>

      <div className={cn("relative mx-auto flex w-full flex-col gap-6", maxWidthClassName, contentClassName)}>{children}</div>
    </div>
  );
}

export function PageHeader({ icon, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "rounded-[1.7rem] border border-border/60 bg-white/78 px-5 py-5 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.32)] backdrop-blur-xl sm:px-6 dark:border-white/8 dark:bg-slate-950/56",
        className,
      )}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_16px_36px_-28px_rgba(76,111,255,0.5)] dark:border-primary/15 dark:bg-primary/14 dark:text-primary-foreground">
              {icon}
            </div>
          ) : null}
          <div>
            <h1 className="text-[1.8rem] font-medium tracking-[-0.045em] text-foreground sm:text-[2.1rem]">{title}</h1>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}

export function PageSection({ children, className }: PageSectionProps) {
  return (
    <section
      className={cn(
        "rounded-[1.5rem] border border-border/55 bg-white/74 p-5 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:p-6 dark:border-white/8 dark:bg-slate-950/48",
        className,
      )}
    >
      {children}
    </section>
  );
}
