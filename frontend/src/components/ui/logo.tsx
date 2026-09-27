import React from 'react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  withText?: boolean
  className?: string
}

export function SquadruneLogo({ size = 'md', withText = true, className = '' }: LogoProps) {
  const pixelSizes = {
    sm: 28,
    md: 36,
    lg: 48,
    xl: 64,
  }

  const px = pixelSizes[size]

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* SVG Rune Icon */}
      <div
        className="relative shrink-0 flex items-center justify-center transition-transform hover:scale-105 duration-200"
        style={{ width: px, height: px }}
      >
        <svg viewBox="0 0 64 64" fill="none" className="w-full h-full drop-shadow-[0_0_12px_rgba(76,165,199,0.35)]">
          <defs>
            <linearGradient id="poseidonShieldComp" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1B4D70" />
              <stop offset="45%" stopColor="#123955" />
              <stop offset="100%" stopColor="#081A28" />
            </linearGradient>

            <linearGradient id="orangeRedCoreComp" x1="32" y1="16" x2="32" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F27958" />
              <stop offset="40%" stopColor="#E65A33" />
              <stop offset="100%" stopColor="#C34121" />
            </linearGradient>

            <filter id="coreGlowComp" x="18" y="14" width="28" height="36" filterUnits="userSpaceOnUse">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Faceted Outer Shield: Poseidon Dark Navy */}
          <polygon
            points="32,3 58,16 58,44 32,61 6,44 6,16"
            fill="url(#poseidonShieldComp)"
            stroke="#4CA5C7"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Inner Inscribed Rune: Norse Light Blue */}
          <polygon
            points="32,9 52,19 52,41 32,54 12,41 12,19"
            fill="none"
            stroke="#4CA5C7"
            strokeWidth="1.2"
            strokeOpacity="0.45"
            strokeDasharray="2.5 1.5"
          />

          {/* 4 Specialized Subagent Ray Terminals */}
          <circle cx="32" cy="11" r="2.2" fill="#4CA5C7" />
          <circle cx="50" cy="40" r="2.2" fill="#4CA5C7" />
          <circle cx="32" cy="52" r="2.2" fill="#4CA5C7" />
          <circle cx="14" cy="40" r="2.2" fill="#4CA5C7" />

          {/* Parallel Vector Lines */}
          <line x1="32" y1="13" x2="32" y2="20" stroke="#4CA5C7" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="50" y1="40" x2="41" y2="36" stroke="#4CA5C7" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="14" y1="40" x2="23" y2="36" stroke="#4CA5C7" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="32" y1="52" x2="32" y2="44" stroke="#4CA5C7" strokeWidth="1.8" strokeLinecap="round" />

          {/* Core Synthesis Lightning Sigil: Orange-Red */}
          <path
            d="M34,17 L22,34 L31,34 L28,47 L42,30 L33,30 Z"
            fill="url(#orangeRedCoreComp)"
            filter="url(#coreGlowComp)"
          />
          <path
            d="M34,17 L22,34 L31,34 L28,47 L42,30 L33,30 Z"
            stroke="#FFFFFF"
            strokeWidth="0.8"
            strokeOpacity="0.9"
          />
        </svg>
      </div>

      {/* Brand Typography */}
      {withText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-[17px] tracking-tight text-white leading-none">
              Squad<span className="text-[#4CA5C7]">rune</span>
            </span>
          </div>
          <span className="text-[9.5px] font-mono font-medium text-[#7DC0D9] tracking-wider uppercase mt-0.5 leading-none">
            Parallel Verification
          </span>
        </div>
      )}
    </div>
  )
}

export default SquadruneLogo
