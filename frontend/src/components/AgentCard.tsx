'use client'

import { type LucideIcon, ShieldCheck, GitBranch, FileText, TestTube, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import type { AgentName, AgentStatus, Severity } from '@/lib/types'
import { AGENT_META } from '@/lib/types'

const ICONS: Record<string, LucideIcon> = {
  ShieldCheck, GitBranch, FileText, TestTube,
}

interface AgentCardProps {
  name: AgentName
  status: AgentStatus
  severity: Severity
  findingCount: number
  durationMs?: number  // eslint-disable-line
}

function StatusIcon({ status, color }: { status: AgentStatus; color: string }) {
  if (status === 'running') return <Loader2 size={16} className="animate-spin" style={{ color }} />
  if (status === 'done') return <CheckCircle size={16} style={{ color }} />
  if (status === 'failed') return <XCircle size={16} className="text-red-500" />
  return <div className="w-4 h-4 rounded-full border border-zinc-600" />
}

export function AgentCard({ name, status, severity, findingCount, durationMs }: AgentCardProps) {
  const meta = AGENT_META[name]
  const IconComp = ICONS[meta.icon] ?? ShieldCheck
  const isRunning = status === 'running'
  const isDone = status === 'done'
  const hasFindings = findingCount > 0
  const isHighSev = severity === 'high'

  const borderColor = isDone || isRunning ? meta.color : '#27272a'
  const bgOpacity = isRunning ? 'bg-zinc-900/80' : isDone ? 'bg-zinc-900/60' : 'bg-zinc-900/30'

  return (
    <div
      className={`relative rounded-xl border p-5 flex flex-col gap-3 transition-all duration-300 ${bgOpacity}`}
      style={{
        borderColor,
        boxShadow: isRunning
          ? `0 0 20px ${meta.color}30`
          : isDone && isHighSev
          ? '0 0 16px #ef444430'
          : 'none',
        animation: isRunning ? 'pulse-border 2s ease-in-out infinite' : 'none',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconComp size={18} style={{ color: meta.color }} />
          <span className="font-semibold text-sm text-zinc-100">{meta.label}</span>
        </div>
        <StatusIcon status={status} color={meta.color} />
      </div>

      {/* Description */}
      <p className="text-xs text-zinc-500 leading-relaxed">{meta.description}</p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-zinc-800">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            color: status === 'idle' ? '#71717a' : meta.color,
            backgroundColor: status === 'idle' ? '#18181b' : `${meta.color}18`,
          }}
        >
          {status === 'idle' ? 'Waiting' : status === 'running' ? 'Analyzing…' : status === 'failed' ? 'Failed' : `${findingCount} finding${findingCount !== 1 ? 's' : ''}`}
        </span>
        {durationMs !== undefined && isDone && (
          <span className="text-xs text-zinc-600 font-mono">{durationMs}ms</span>
        )}
        {isRunning && (
          <span className="text-xs text-zinc-500 animate-pulse">Running</span>
        )}
      </div>

      {/* High severity glow accent */}
      {isDone && isHighSev && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}
    </div>
  )
}
