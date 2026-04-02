import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium tracking-[-0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
" hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
           "border border-primary/80 bg-primary text-primary-foreground shadow-[0_12px_30px_-18px_hsl(var(--primary)/0.7)] hover:brightness-[1.03]",
        destructive:
          "border border-destructive/80 bg-destructive text-destructive-foreground shadow-[0_12px_28px_-18px_hsl(var(--destructive)/0.6)] hover:brightness-[1.02]",
        outline:
          "border border-border/80 bg-card/72 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_12px_30px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl hover:bg-card",
        secondary:
          "border border-border/70 bg-secondary/85 text-secondary-foreground hover:bg-secondary",
        ghost: "border border-transparent text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-10 px-4.5 py-2.5",
        sm: "min-h-8 px-3.5 text-xs",
        lg: "min-h-11 px-8 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
