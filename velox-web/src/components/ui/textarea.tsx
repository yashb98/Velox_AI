// src/components/ui/textarea.tsx
// Claude.ai-inspired textarea component with warm focus states

import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[100px] w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900",
          "shadow-sm transition-all duration-200",
          "placeholder:text-stone-400",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-500",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-stone-50",
          "hover:border-stone-300",
          "resize-y",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
