// components/ui/button.tsx — shadcn/ui Button
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-r from-[#E65A33] to-[#C34121] text-white shadow-[0_4px_24px_rgba(230,90,51,0.35)] hover:shadow-[0_6px_32px_rgba(230,90,51,0.5)] hover:-translate-y-px active:translate-y-0',
        norse:   'bg-gradient-to-r from-[#4CA5C7] to-[#123955] text-white shadow-[0_4px_24px_rgba(76,165,199,0.35)] hover:shadow-[0_6px_32px_rgba(76,165,199,0.5)] hover:-translate-y-px active:translate-y-0',
        ghost:   'bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100',
        outline: 'border border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
      },
      size: {
        sm:  'h-8 px-3 text-xs',
        md:  'h-10 px-4',
        lg:  'h-12 px-6 text-base',
        icon:'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
  )
)
Button.displayName = 'Button'

export { Button, buttonVariants }
