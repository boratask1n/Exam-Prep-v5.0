"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar p-4 [--cell-size:2.5rem] bg-popover text-popover-foreground rounded-2xl border border-border/80 shadow-md",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("tr-TR", { month: "long" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between px-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          "h-9 w-9 select-none p-0 aria-disabled:opacity-30",
          "inline-flex items-center justify-center rounded-xl",
          "text-muted-foreground hover:text-foreground",
          "bg-transparent hover:bg-accent",
          "transition-all duration-150 ease-out cursor-pointer",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          "h-9 w-9 select-none p-0 aria-disabled:opacity-30",
          "inline-flex items-center justify-center rounded-xl",
          "text-muted-foreground hover:text-foreground",
          "bg-transparent hover:bg-accent",
          "transition-all duration-150 ease-out cursor-pointer",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-9 w-full items-center justify-center px-10",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-9 w-full items-center justify-center gap-1.5 text-base font-bold tracking-tight text-foreground",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "bg-popover absolute inset-0 opacity-0 cursor-pointer",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-bold text-base tracking-tight text-foreground",
          captionLayout === "label"
            ? ""
            : "[&>svg]:text-muted-foreground flex h-8 items-center gap-1 rounded-lg pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse space-y-1.5",
        weekdays: cn("flex my-2 border-b border-border/50 pb-2", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground flex-1 select-none text-center text-xs font-semibold tracking-wide",
          defaultClassNames.weekday
        ),
        week: cn("mt-1 flex w-full justify-between gap-1", defaultClassNames.week),
        week_number_header: cn(
          "w-[--cell-size] select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-muted-foreground select-none text-[0.8rem]",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center flex items-center justify-center",
          defaultClassNames.day
        ),
        range_start: cn(
          "bg-primary/20 rounded-l-2xl",
          defaultClassNames.range_start
        ),
        range_middle: cn("bg-primary/10 rounded-none", defaultClassNames.range_middle),
        range_end: cn("bg-primary/20 rounded-r-2xl", defaultClassNames.range_end),
        today: cn(
          "font-bold underline decoration-primary decoration-2 underline-offset-4",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground/60 font-medium aria-selected:opacity-100",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground/30 opacity-30 cursor-not-allowed",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-5 stroke-[2.2]", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-5 stroke-[2.2]", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <button
      ref={ref}
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      data-today={modifiers.today}
      className={cn(
        // Base layout
        "relative flex aspect-square h-[--cell-size] w-[--cell-size] flex-col items-center justify-center gap-1",
        "rounded-2xl text-sm font-medium leading-none",
        "transition-all duration-150 ease-out",
        "outline-none select-none cursor-pointer",

        // Default state: ALL day numbers are clearly visible and legible!
        "text-foreground font-medium hover:bg-accent hover:text-accent-foreground",

        // Today indicator
        "data-[today=true]:font-bold data-[today=true]:text-primary",

        // Single selected — Theme primary background (no hardcoded blue!)
        "data-[selected-single=true]:bg-primary",
        "data-[selected-single=true]:text-primary-foreground font-bold",
        "data-[selected-single=true]:shadow-sm",
        "data-[selected-single=true]:scale-105",

        // Range start
        "data-[range-start=true]:bg-primary text-primary-foreground font-bold rounded-r-none",

        // Range middle
        "data-[range-middle=true]:bg-primary/10 data-[range-middle=true]:text-primary rounded-none",

        // Range end
        "data-[range-end=true]:bg-primary text-primary-foreground font-bold rounded-l-none",

        // Focus ring
        "group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-ring group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10",

        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
