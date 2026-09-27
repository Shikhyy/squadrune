'use client'

import { CheckCircle, AlertTriangle, XOctagon, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import type { Verdict, Finding } from '@/lib/types'
import { AGENT_META } from '@/lib/types'

const STATUS_CONFIG = {
  pass: { label: 'PASS', color: '#10B981', bg: '#10B98118', Icon: CheckCircle },
  needs_changes: { label: 'NEEDS CHANGES', color: '#E65A33', bg: '#E65A3318', Icon: AlertTriangle },
  blocked: { label: 'BLOCKED', color: '#ef4444', bg: '#ef444418', Icon: XOctagon },
}

const SEV_COLOR = {
  high: '#ef4444',
  medium: '#E65A33',
  low: '#4CA5C7',
  none: '#71717a',
}

function FindingRow({ f }: { f: Finding }) {
  const agentMeta = f.agent ? (AGENT_META as Record<string, any>)[f.agent] : null
  return (
    <div className="flex gap-3 py-2 border-b border-zinc-800/50 last:border-0">
      <span
        className="text-xs font-bold uppercase px-2 py-0.5 rounded-full shrink-0 self-start mt-0.5"
        style={{ color: SEV_COLOR[f.severity] ?? '#71717a', background: `${SEV_COLOR[f.severity] ?? '#71717a'}18` }}
      >
        {f.severity}
      </span>
      {agentMeta && (
        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 self-start mt-0.5" style={{ color: agentMeta.color, background: `${agentMeta.color}18` }}>
          {agentMeta.label}
        </span>
      )}
      <p className="text-sm text-zinc-300 leading-relaxed font-mono text-xs">{f.description}</p>
    </div>
  )
}

export function VerdictBanner({ verdict }: { verdict: Verdict }) {
  const [expanded, setExpanded] = useState(true)
  const cfg = STATUS_CONFIG[verdict.status] ?? STATUS_CONFIG.needs_changes
  const { Icon } = cfg

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all duration-500"
      style={{ borderColor: cfg.color, background: cfg.bg }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Icon size={22} style={{ color: cfg.color }} />
        <div className="flex-1">
          <span className="font-bold text-lg tracking-wide" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          <p className="text-sm text-zinc-400 mt-0.5 leading-relaxed">{verdict.summary}</p>
        </div>
        <div className="flex items-center gap-3">
          {verdict.duration_ms && (
            <span className="text-xs text-zinc-600 font-mono">{verdict.duration_ms}ms</span>
          )}
          {expanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
        </div>
      </button>

      {/* Findings */}
      {expanded && verdict.findings.length > 0 && (
        <div className="px-5 pb-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 py-3 uppercase tracking-wider font-semibold">
            {verdict.findings.length} Finding{verdict.findings.length !== 1 ? 's' : ''}
          </p>
          {verdict.findings.map((f, i) => <FindingRow key={i} f={f} />)}
        </div>
      )}

      {expanded && verdict.findings.length === 0 && (
        <div className="px-5 pb-4 border-t border-zinc-800 pt-3">
          <p className="text-sm text-zinc-500">No findings — all checks passed.</p>
        </div>
      )}
    </div>
  )
}
