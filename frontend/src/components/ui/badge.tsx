// components/ui/badge.tsx — shadcn/ui Badge with Pantone palette
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:   'border-transparent bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
        secondary: 'border-[#15364F] bg-[#0A1C2B] text-zinc-300',
        outline:   'border-[#15364F] text-zinc-300',
        // Official Pantone Palette Variants:
        norse:     'border-[#4CA5C7]/50 bg-[#4CA5C7]/15 text-[#7DC0D9]',
        blue:      'border-[#4CA5C7]/50 bg-[#4CA5C7]/15 text-[#7DC0D9]',
        orangered: 'border-[#E65A33]/50 bg-[#E65A33]/15 text-[#F0714E]',
        red:       'border-[#E65A33]/50 bg-[#E65A33]/15 text-[#F0714E]',
        poseidon:  'border-[#1E4B6E] bg-[#123955]/60 text-[#A8D7E8]',
        green:     'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
        // Complete replacement of amber & purple -> mapped to clean Pantone colors:
        amber:     'border-[#E65A33]/50 bg-[#E65A33]/15 text-[#F0714E]',
        purple:    'border-[#4CA5C7]/50 bg-[#4CA5C7]/15 text-[#7DC0D9]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
