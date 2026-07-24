import { useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export interface DatePickerProps {
  value?: string | Date | null;
  onChange?: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Tarih seçin...",
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const selectedDate = value
    ? typeof value === "string"
      ? new Date(value + (value.includes("T") ? "" : "T12:00:00"))
      : value
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "group relative flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5",
            "border border-border/80 bg-card/60 backdrop-blur-sm",
            "text-sm font-medium transition-all duration-200 ease-out",
            "hover:border-primary/40 hover:bg-card hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
            "focus-visible:outline-none focus-visible:border-primary/60 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/80 disabled:hover:shadow-none",
            open && "border-primary/50 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            "bg-primary/10 border border-primary/15 transition-all duration-200",
            "group-hover:bg-primary/15 group-hover:border-primary/25",
            open && "bg-primary/20 border-primary/30"
          )}>
            <CalendarIcon className={cn(
              "h-3.5 w-3.5 transition-colors duration-200",
              value ? "text-primary" : "text-muted-foreground/60 group-hover:text-primary"
            )} />
          </span>

          <span className="flex-1 text-left">
            {selectedDate && !isNaN(selectedDate.getTime()) ? (
              <span className="text-foreground font-semibold">
                {format(selectedDate, "d MMMM yyyy", { locale: tr })}
              </span>
            ) : (
              <span className="text-muted-foreground/70">{placeholder}</span>
            )}
          </span>

          <ChevronDown className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200",
            open && "rotate-180 text-primary"
          )} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="p-0 w-auto overflow-hidden border-none bg-transparent shadow-none"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date && onChange) {
              onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          initialFocus
          locale={tr}
        />
      </PopoverContent>
    </Popover>
  );
}
