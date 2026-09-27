'use client'

import React, { useEffect, useRef } from 'react'

export interface AsciiWavesProps {
  characters?: string
  color?: string
  waveTension?: number
  waveTwist?: number
  invert?: boolean
  noiseScale?: number
  elementSize?: number
  speed?: number
  hasCursorInteraction?: boolean
  intensity?: number
  interactionIntensity?: number
  className?: string
  palette?: 'pantone' | 'single'
  accentColor?: string
  highlightColor?: string
}

/**
 * AsciiWaves
 * High-performance, fluid ASCII character wave effect
 * Designed with Pantone Poseidon, Norse Blue, and Orange-Red.
 */
export function AsciiWaves({
  characters = ' .:-+*=%@#',
  color = '#4CA5C7', // PANTONE 15-4427 TCX (Norse Blue)
  waveTension = 0.5,
  waveTwist = 0.15,
  invert = false,
  noiseScale = 1.0,
  elementSize = 15,
  speed = 0.8,
  hasCursorInteraction = true,
  intensity = 1.0,
  interactionIntensity = 1.2,
  className = '',
  palette = 'pantone',
  accentColor = '#123955', // PANTONE 19-4033 TCX (Poseidon)
  highlightColor = '#E65A33', // PANTONE 17-1449 TCX (Orange-Red bright)
}: AsciiWavesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mouseRef = useRef({ x: -1000, y: -1000, targetX: -1000, targetY: -1000, active: false })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let animationFrameId: number
    let startTime = performance.now()

    // Handle Resize
    const handleResize = () => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.scale(dpr, dpr)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    // Cursor tracking
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current.targetX = e.clientX - rect.left
      mouseRef.current.targetY = e.clientY - rect.top
      mouseRef.current.active = true
    }

    const handleMouseLeave = () => {
      mouseRef.current.active = false
    }

    if (hasCursorInteraction) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseleave', handleMouseLeave)
    }

    // Palette interpolation helper:
    // val 0.0 -> 0.4: Poseidon Dark Navy Blue (#123955)
    // val 0.4 -> 0.75: Norse Light Blue (#4CA5C7)
    // val 0.75 -> 1.0: Orange-Red (#C34121 / #E65A33)
    const getPantoneColor = (normVal: number): string => {
      if (palette !== 'pantone') {
        return color
      }
      if (normVal < 0.35) {
        // Deep Poseidon Navy (#12, 57, 85)
        const alpha = 0.25 + normVal * 0.8
        return `rgba(76, 165, 199, ${alpha.toFixed(2)})`
      } else if (normVal < 0.72) {
        // Norse Blue (#76, 165, 199)
        const alpha = 0.55 + (normVal - 0.35) * 1.1
        return `rgba(76, 165, 199, ${Math.min(1, alpha).toFixed(2)})`
      } else {
        // Orange-Red (#230, 90, 51)
        const alpha = 0.85 + (normVal - 0.72) * 0.5
        return `rgba(230, 90, 51, ${Math.min(1, alpha).toFixed(2)})`
      }
    }

    // Render loop
    const chars = characters.split('')
    const numChars = chars.length

    const render = (now: number) => {
      const elapsed = (now - startTime) * 0.001 * speed
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height

      if (width === 0 || height === 0) {
        animationFrameId = requestAnimationFrame(render)
        return
      }

      ctx.clearRect(0, 0, width, height)

      // Smooth mouse position
      const mouse = mouseRef.current
      if (mouse.active) {
        mouse.x += (mouse.targetX - mouse.x) * 0.08
        mouse.y += (mouse.targetY - mouse.y) * 0.08
      }

      const cellSize = Math.max(10, elementSize)
      const cols = Math.ceil(width / cellSize)
      const rows = Math.ceil(height / cellSize)

      ctx.font = `600 ${Math.floor(cellSize * 0.82)}px "JetBrains Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const cx = width / 2
      const cy = height / 2

      for (let r = 0; r < rows; r++) {
        const y = r * cellSize + cellSize / 2
        for (let c = 0; c < cols; c++) {
          const x = c * cellSize + cellSize / 2

          // Normalize coordinates
          const nx = (x - cx) / (width * 0.5) * noiseScale
          const ny = (y - cy) / (height * 0.5) * noiseScale
          const dist = Math.hypot(nx, ny)

          // Angular twist
          const angle = Math.atan2(ny, nx) + dist * waveTwist * Math.PI

          // Multi-harmonic wave function
          const w1 = Math.sin(nx * (3.0 * waveTension) + elapsed * 1.4)
          const w2 = Math.cos(ny * (2.8 * waveTension) + elapsed * 1.1)
          const w3 = Math.sin(angle * 2.5 - elapsed * 1.8 + dist * 3.5)
          const w4 = Math.sin((nx + ny) * 2.0 - elapsed * 0.9)

          let wave = (w1 + w2 + w3 + w4) * 0.25 * intensity

          // Cursor ripple interaction
          if (hasCursorInteraction && mouse.active) {
            const dx = x - mouse.x
            const dy = y - mouse.y
            const mDist = Math.hypot(dx, dy)
            const maxRadius = 180
            if (mDist < maxRadius) {
              const ripple = Math.sin((mDist / maxRadius) * Math.PI * 4 - elapsed * 5)
              const decay = (1 - mDist / maxRadius) * interactionIntensity
              wave += ripple * decay * 0.6
            }
          }

          // Map wave (-1 .. 1) to normalized (0 .. 1)
          let norm = (wave + 1) * 0.5
          norm = Math.max(0, Math.min(1, norm))

          if (invert) {
            norm = 1 - norm
          }

          // Determine character
          const charIndex = Math.min(
            numChars - 1,
            Math.max(0, Math.floor(norm * (numChars - 1)))
          )
          const char = chars[charIndex]

          // Style and draw glyph
          ctx.fillStyle = getPantoneColor(norm)
          ctx.fillText(char, x, y)
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      if (hasCursorInteraction) {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [
    characters,
    color,
    waveTension,
    waveTwist,
    invert,
    noiseScale,
    elementSize,
    speed,
    hasCursorInteraction,
    intensity,
    interactionIntensity,
    palette,
    accentColor,
    highlightColor,
  ])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none select-none z-0 ${className}`}
      style={{ display: 'block' }}
    />
  )
}

export default AsciiWaves
