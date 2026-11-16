import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "retro-button inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "bg-canvas-deep text-ink-primary border border-ink-primary hover:bg-surface-elevated hover:border-primary hover:text-primary transition-all duration-150",
        emerald:
          "bg-primary text-canvas-deep font-semibold hover:bg-primary-hover",
        secondary:
          "bg-canvas-subtle text-ink-primary border border-hairline hover:bg-surface hover:border-hairline-prominent",
        outline:
          "bg-transparent text-ink-primary border border-hairline hover:bg-canvas-subtle hover:border-hairline-prominent",
        ghost:
          "bg-transparent text-ink-secondary hover:text-ink-primary hover:bg-surface",
        destructive:
          "bg-error/10 text-error border border-error/20 hover:bg-error/20",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
