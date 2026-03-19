// src/components/ui/button.tsx
// Claude.ai-inspired button component with smooth animations

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-stone-900 text-white shadow-sm hover:bg-stone-800 hover:shadow-md",
        primary:
          "bg-amber-600 text-white shadow-sm hover:bg-amber-500 hover:shadow-md hover:shadow-amber-500/20",
        destructive:
          "bg-red-600 text-white shadow-sm hover:bg-red-500 hover:shadow-md",
        outline:
          "border border-stone-200 bg-white text-stone-700 shadow-sm hover:bg-stone-50 hover:border-stone-300 hover:text-stone-900",
        secondary:
          "bg-stone-100 text-stone-700 hover:bg-stone-200 hover:text-stone-900",
        ghost:
          "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
        link:
          "text-amber-600 underline-offset-4 hover:underline hover:text-amber-700",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
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
