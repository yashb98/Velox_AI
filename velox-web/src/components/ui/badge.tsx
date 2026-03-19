// src/components/ui/badge.tsx
// Claude.ai-inspired badge component

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-stone-900 text-white",
        primary:
          "border-transparent bg-amber-100 text-amber-800",
        secondary:
          "border-stone-200 bg-stone-100 text-stone-700",
        success:
          "border-transparent bg-emerald-100 text-emerald-800",
        destructive:
          "border-transparent bg-red-100 text-red-800",
        outline:
          "border-stone-300 bg-transparent text-stone-600",
        ghost:
          "border-transparent bg-transparent text-stone-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
