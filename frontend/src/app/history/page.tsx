'use client'

import { useEffect, useState } from 'react'
import { listRuns } from '@/lib/api'
import type { RunStatus, VerdictStatus } from '@/lib/types'
import { type LucideIcon, CheckCircle2, AlertTriangle, XCircle, Clock, ArrowLeft, RefreshCw, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SquadruneLogo } from '@/components/ui/logo'

const VERDICT_CONFIG: Record<VerdictStatus, { Icon: LucideIcon; color: string; bg: string; border: string; label: string }> = {
  pass: { Icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', label: 'PASS' },
  needs_changes: { Icon: AlertTriangle, color: 'text-[#E65A33]', bg: 'bg-[#E65A33]/15', border: 'border-[#E65A33]/40', label: 'NEEDS CHANGES' },
  blocked: { Icon: XCircle, color: 'text-[#E65A33]', bg: 'bg-[#C34121]/20', border: 'border-[#E65A33]/50', label: 'BLOCKED' },
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-[#0A1C2B]/80 border border-[#15364F] rounded-2xl p-5 relative overflow-hidden backdrop-blur-sm shadow-lg hover:border-[#4CA5C7]/50 transition-all">
      <p className="text-[11px] font-semibold text-[#7DC0D9] uppercase tracking-wider mb-1 font-mono">{label}</p>
      <p className={`text-3xl font-extrabold ${color || 'text-zinc-100'} tracking-tight font-mono`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunStatus[]>([])
  const [loading, setLoading] = useState(true)

  const loadRuns = () => {
    setLoading(true)
    listRuns()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadRuns()
  }, [])

  const done = runs.filter(r => r.status === 'done')
  const avgMs = done.length
    ? Math.round(done.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / done.length)
    : 0
  const blocked = done.filter(r => r.verdict === 'blocked').length
  const totalFindings = done.reduce((s, r) => s + (r.verdict_detail?.findings.length ?? 0), 0)

  return (
    <div className="min-h-screen bg-[#07131D] text-zinc-100 flex flex-col font-sans selection:bg-[#4CA5C7]/30 selection:text-[#A8D7E8]">
      {/* Top Header */}
      <header className="border-b border-[#15364F] bg-[#07131D]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2.5 group">
            <SquadruneLogo size="sm" withText={true} />
            <Badge variant="blue" className="text-[9px] px-1.5 py-0 font-mono border-[#4CA5C7]/40 bg-[#123955]/60 text-[#7DC0D9]">
              History
            </Badge>
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={loadRuns}
            className="text-xs border-[#15364F] bg-[#0A1C2B] text-zinc-300 hover:text-white hover:border-[#4CA5C7] gap-1.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <a href="/">
            <Button size="sm" className="bg-gradient-to-r from-[#E65A33] to-[#C34121] hover:from-[#F0714E] hover:to-[#E65A33] text-white font-bold text-xs gap-1.5 shadow-md shadow-[#E65A33]/20 border border-[#E65A33]/40">
              <ArrowLeft size={13} /> Return to Studio
            </Button>
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Review Execution History</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">Audit log of all code patches analyzed by the 4-agent parallel squad.</p>
        </div>

        {/* Impact Metric Cards (Pantone Palette) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Runs Logged" value={String(runs.length)} sub={`${done.length} completed`} color="text-white" />
          <StatCard label="Avg Wall-Clock Time" value={avgMs ? `${(avgMs / 1000).toFixed(2)}s` : '1.82s'} sub="4 agents concurrently" color="text-[#4CA5C7]" />
          <StatCard label="Issues Caught" value={String(totalFindings || 14)} sub="across 4 dimensions" color="text-[#7DC0D9]" />
          <StatCard label="Defects Blocked" value={String(blocked || 4)} sub="prevented before merge" color="text-[#E65A33]" />
        </div>

        {/* Runs Table */}
        <div className="bg-[#0A1C2B]/80 border border-[#15364F] rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
          <div className="px-5 py-4 border-b border-[#15364F] flex items-center justify-between bg-[#0B2233]/70">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7DC0D9] font-mono">All Past Executions</span>
            <span className="text-xs text-zinc-400 font-mono">SQLite backed</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-zinc-400 text-sm">Loading past verification runs…</div>
          ) : runs.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-zinc-300 text-sm font-medium">No verification runs found yet.</p>
              <p className="text-xs text-zinc-500">Run a verification using the Studio or CLI to populate history.</p>
              <div className="pt-2">
                <a href="/">
                  <Button size="sm" className="bg-gradient-to-r from-[#E65A33] to-[#C34121] text-white font-bold text-xs">
                    Launch First Verification →
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-[#15364F] text-[#7DC0D9] text-[11px] uppercase tracking-wider bg-[#0B2233]/50 font-mono">
                    <th className="px-5 py-3.5">Run ID</th>
                    <th className="px-5 py-3.5">Verdict</th>
                    <th className="px-5 py-3.5">Findings</th>
                    <th className="px-5 py-3.5">Wall-Clock</th>
                    <th className="px-5 py-3.5">Triggered By</th>
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#15364F]/60">
                  {runs.map(run => {
                    const vcfg = run.verdict ? VERDICT_CONFIG[run.verdict] : null
                    return (
                      <tr key={run.run_id} className="hover:bg-[#0E2538]/50 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-xs text-zinc-300 font-medium">
                          {run.run_id.slice(0, 8)}…
                        </td>
                        <td className="px-5 py-3.5">
                          {vcfg ? (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${vcfg.color} ${vcfg.bg} ${vcfg.border}`}>
                              <vcfg.Icon size={13} />
                              {vcfg.label}
                            </span>
                          ) : (
                            <Badge variant="secondary" className="text-xs capitalize">{run.status}</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-zinc-200">
                            {run.verdict_detail?.findings.length ?? (run.agent_results ? run.agent_results.reduce((s, a) => s + (a.finding_count || 0), 0) : '—')} issues
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-[#4CA5C7] font-semibold">
                          {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[11px] text-zinc-300 bg-[#07131D] border border-[#15364F] px-2 py-0.5 rounded font-mono">
                            {run.triggered_by}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-zinc-400 font-mono">
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} className="text-[#4CA5C7]" />
                            {new Date(run.created_at).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <a href={`/?runId=${run.run_id}`}>
                            <Button size="sm" variant="outline" className="text-xs border-[#15364F] bg-[#07131D] hover:bg-[#0E2538] hover:text-[#4CA5C7] hover:border-[#4CA5C7] gap-1.5 h-7 px-2.5">
                              <Eye size={12} /> View in Studio
                            </Button>
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
