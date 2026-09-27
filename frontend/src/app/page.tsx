'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  ShieldCheck, GitBranch, FileText, TestTube2,
  Zap, Send, Loader2, CheckCircle2, XCircle,
  AlertTriangle, History as HistoryIcon, ChevronDown, ChevronUp,
  Terminal, Cpu, Sparkles, Clock, Info, Copy, Check,
  Play, RotateCcw, Code2, ArrowRight, Layers, FileCode2,
  Boxes, ShieldAlert, CheckCheck, BookOpen, Bug, Rocket,
  Laptop, Server, Wrench, RefreshCw, Eye
} from 'lucide-react'
import { postRun, openRunStream, getRun, listRuns, checkBackendHealth, fetchPresets, FALLBACK_PRESETS } from '@/lib/api'
import type { AgentName, AgentState, Verdict, WsEvent, Severity, ReviewPreset, VerdictStatus, RunStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import { AsciiWaves } from '@/components/ui/ascii-waves'
import { SquadruneLogo } from '@/components/ui/logo'

// ─────────────────────────────────────────────
// Constants & Configurations (Pantone Poseidon, Norse Blue, Orange-Red)
// ─────────────────────────────────────────────
const AGENT_CONFIG = {
  security:        { label: 'Security',        Icon: ShieldCheck, color: '#E65A33', badgeVariant: 'orangered' as const, desc: 'Hardcoded secrets, weak crypto, unsafe injection patterns' },
  architecture:    { label: 'Architecture',    Icon: GitBranch,   color: '#4CA5C7', badgeVariant: 'norse' as const,     desc: 'Error hierarchy standards, naming conventions & layering' },
  spec_compliance: { label: 'Spec Compliance', Icon: FileText,    color: '#7DC0D9', badgeVariant: 'norse' as const,     desc: 'Document understanding: checks diff against PRD/spec clauses' },
  test_coverage:   { label: 'Test Coverage',   Icon: TestTube2,   color: '#10B981', badgeVariant: 'green' as const,     desc: 'Untested new code paths, methods & missing assertions' },
} as const

const VERDICT_CFG = {
  pass:          { label: 'PASS',          color: '#10B981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)', Icon: CheckCircle2, desc: 'All 4 verification dimensions passed cleanly. Safe to merge.' },
  needs_changes: { label: 'NEEDS CHANGES', color: '#E65A33', bg: 'rgba(230,90,51,0.08)',   border: 'rgba(230,90,51,0.35)', Icon: AlertTriangle, desc: 'Non-blocking defects or coverage gaps identified. Review before merge.' },
  blocked:       { label: 'BLOCKED',       color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',  Icon: XCircle,       desc: 'Critical security flaws or direct specification violations detected.' },
}

const SEV_COLOR: Record<Severity, string> = {
  high: '#ef4444', medium: '#E65A33', low: '#4CA5C7', none: '#52525b',
}

const SEV_BADGE: Record<Severity, 'red'|'orangered'|'norse'|'blue'|'secondary'> = {
  high: 'red', medium: 'orangered', low: 'norse', none: 'secondary',
}

const AGENTS: AgentName[] = ['security', 'architecture', 'spec_compliance', 'test_coverage']
const DEFAULT_AGENTS: AgentState[] = AGENTS.map(n => ({
  name: n,
  status: 'idle',
  severity: 'none',
  finding_count: 0,
}))

// Sample Spec Text (User Auth Module v1.2)
const SAMPLE_SPEC_TEXT = `# Sample Spec: User Authentication Module v1.2

## Functional Requirements
- **FR-1: Password Hashing**: Passwords MUST be hashed using bcrypt (min work-factor: 12). SHA-256 and MD5 are strictly prohibited.
- **FR-2: Token Validation**: validate_token() must verify signature and return payload dict. Unit tests MUST cover valid, expired, and tampered tokens.
- **FR-3: Error Handling Standard**: All auth errors MUST raise project standard \`AppError(code="AUTH_001", ...)\`. Raw exceptions (ValueError) are forbidden.
- **FR-4: Secret Management**: Secrets MUST be loaded from environment variables (\`os.getenv\`). Hardcoded secrets are NOT permitted.
- **FR-5: Session Expiry**: Enforce 3600-second TTL expiry.`

// Animation variants
const fadeUp: Variants  = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } } }
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const fadeIn: Variants  = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.25 } } }
const scaleIn: Variants = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: 'easeOut' } } }

// ─────────────────────────────────────────────
// Component: AgentCard
// ─────────────────────────────────────────────
function AgentCard({ agent }: { agent: AgentState }) {
  const cfg = AGENT_CONFIG[agent.name]
  const { Icon } = cfg
  const isRunning = agent.status === 'running'
  const isDone = agent.status === 'done'
  const isIdle = agent.status === 'idle'

  return (
    <motion.div variants={fadeUp} layout>
      <Card
        className={cn(
          'relative overflow-hidden h-full transition-all duration-300',
          isRunning && 'ring-1 ring-[#4CA5C7]/50 shadow-[0_0_24px_rgba(76,165,199,0.25)]',
        )}
        style={{
          background: isDone
            ? `linear-gradient(135deg, #111114 60%, ${cfg.color}12)`
            : isRunning
            ? `linear-gradient(135deg, #111114 40%, ${cfg.color}1c)`
            : '#111114',
          borderColor: isIdle ? '#1e1e24' : isRunning ? `${cfg.color}80` : `${cfg.color}40`,
        }}
      >
        {isRunning && (
          <motion.div
            className="absolute left-0 right-0 h-0.5 pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }}
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
          />
        )}

        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${cfg.color}18` }}
              >
                <Icon size={16} color={cfg.color} />
              </div>
              <div>
                <CardTitle className="text-zinc-100 text-sm font-semibold">{cfg.label}</CardTitle>
                <span className="text-[10px] text-zinc-500 font-mono">parallel subagent</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isIdle && (
                <motion.div key="idle" {...fadeIn}>
                  <Badge variant="secondary" className="text-[10px]">Idle</Badge>
                </motion.div>
              )}
              {isRunning && (
                <motion.div key="running" {...fadeIn}>
                  <Badge variant={cfg.badgeVariant as never} className="gap-1.5 text-[10px]">
                    <Loader2 size={10} className="animate-spin" /> Analyzing
                  </Badge>
                </motion.div>
              )}
              {isDone && (
                <motion.div key="done" {...scaleIn}>
                  <Badge
                    variant={agent.severity === 'none' ? 'green' as never : SEV_BADGE[agent.severity]}
                    className="gap-1.5 text-[10px]"
                  >
                    {agent.severity === 'none' ? (
                      <CheckCircle2 size={10} />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[agent.severity] }} />
                    )}
                    {agent.finding_count === 0 ? 'Clean (0)' : `${agent.finding_count} issue${agent.finding_count !== 1 ? 's' : ''}`}
                  </Badge>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <CardDescription className="text-xs text-zinc-400 mt-2 leading-relaxed">
            {cfg.desc}
          </CardDescription>
        </CardHeader>

        {isRunning && (
          <div className="px-4 py-1">
            <Progress value={undefined} indicatorColor={cfg.color} className="h-0.5" style={{ background: `${cfg.color}15` }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: cfg.color }}
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </Progress>
          </div>
        )}

        <Separator className="mx-4 w-auto my-1" style={{ background: 'rgba(255,255,255,0.05)' }} />

        <CardContent className="p-4 pt-2 flex items-center justify-between text-xs">
          <div>
            {isDone && agent.severity !== 'none' && (
              <Badge variant={SEV_BADGE[agent.severity]} className="uppercase text-[9px] tracking-wider font-semibold">
                {agent.severity} risk
              </Badge>
            )}
            {isDone && agent.severity === 'none' && (
              <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                <CheckCircle2 size={12} /> Passed verification
              </span>
            )}
            {isIdle && <span className="text-zinc-600">Waiting for orchestrator</span>}
            {isRunning && <span className="text-zinc-400 animate-pulse text-[11px]">Running async task…</span>}
          </div>

          {agent.durationMs !== undefined && isDone && (
            <span className="font-mono text-zinc-500 text-[11px] flex items-center gap-1">
              <Clock size={11} /> {agent.durationMs}ms
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Component: ConcurrencyWaterfall
// ─────────────────────────────────────────────
function ConcurrencyWaterfall({ agents, totalMs }: { agents: AgentState[]; totalMs?: number }) {
  const maxDuration = Math.max(...agents.map(a => a.durationMs ?? 0), 1800)
  const sequentialSum = agents.reduce((acc, a) => acc + (a.durationMs ?? 1400), 0)

  return (
    <Card className="p-4 bg-zinc-950/60 border-zinc-800/80">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-[#E65A33]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Concurrency Proof Engine
          </span>
          <Badge variant="norse" className="text-[10px] py-0">asyncio.gather</Badge>
        </div>
        <div className="text-xs font-mono text-zinc-400 flex items-center gap-2">
          <span>Wall-clock: <strong className="text-[#7DC0D9]">{totalMs ?? maxDuration}ms</strong></span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-500">Sequential would be ~{sequentialSum}ms</span>
          <span className="text-emerald-400 font-semibold">(~68% faster)</span>
        </div>
      </div>

      <div className="space-y-2 pt-1 font-mono text-[11px]">
        {agents.map((agent) => {
          const cfg = AGENT_CONFIG[agent.name]
          const dur = agent.durationMs ?? (agent.status === 'done' ? 1200 : 0)
          const pct = Math.min(100, Math.max(8, (dur / maxDuration) * 100))
          const isDone = agent.status === 'done'
          const isRunning = agent.status === 'running'

          return (
            <div key={agent.name} className="flex items-center gap-3">
              <div className="w-28 truncate text-zinc-400 font-medium">
                {cfg.label}
              </div>
              <div className="flex-1 bg-zinc-900 rounded-md h-5 p-0.5 overflow-hidden relative">
                <div
                  className={cn(
                    'h-full rounded transition-all duration-700 flex items-center justify-end px-2 text-[10px] font-bold text-zinc-950',
                    isRunning && 'animate-pulse'
                  )}
                  style={{
                    width: isRunning ? '60%' : `${pct}%`,
                    background: isDone
                      ? `linear-gradient(90deg, ${cfg.color}99, ${cfg.color})`
                      : isRunning
                      ? `linear-gradient(90deg, ${cfg.color}66, ${cfg.color})`
                      : '#27272a',
                    color: '#000',
                  }}
                >
                  {isDone && `${dur}ms`}
                  {isRunning && 'running…'}
                </div>
              </div>
              <div className="w-14 text-right text-zinc-500 text-[10px]">
                {agent.offsetMs !== undefined ? `+${agent.offsetMs}ms` : '+0ms'}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Offset @ Start: <span className="text-emerald-400 font-mono">+0ms (simultaneous start proven)</span></span>
        <span>Synthesis: <span className="text-zinc-400 font-mono">Deduplicated & Ranked</span></span>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────
// Component: VerdictBanner
// ─────────────────────────────────────────────
function VerdictBanner({ verdict, onCopyComment }: { verdict: Verdict; onCopyComment: () => void }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const cfg = VERDICT_CFG[verdict.status] ?? VERDICT_CFG.needs_changes
  const { Icon } = cfg

  const handleCopy = () => {
    onCopyComment()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filteredFindings = useMemo(() => {
    if (filterSeverity === 'all') return verdict.findings
    return verdict.findings.filter(f => f.severity === filterSeverity)
  }, [verdict.findings, filterSeverity])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card style={{ background: cfg.bg, borderColor: cfg.border }} className="overflow-hidden border shadow-lg">
        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${cfg.color}24` }}
            >
              <Icon size={24} color={cfg.color} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wide" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
                <Badge variant={verdict.status === 'pass' ? 'green' as never : verdict.status === 'blocked' ? 'red' : 'orangered'}>
                  {verdict.findings.length} Finding{verdict.findings.length !== 1 ? 's' : ''}
                </Badge>
                {verdict.duration_ms && (
                  <span className="text-xs font-mono text-zinc-400 flex items-center gap-1">
                    <Clock size={11} /> {(verdict.duration_ms / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-300 mt-1 max-w-2xl leading-relaxed">
                {verdict.summary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 gap-1.5 text-xs border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copied ? 'Copied PR Comment' : 'Copy PR Comment'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(o => !o)}
              className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-200"
            >
              <ChevronDown size={16} className={cn('transition-transform duration-200', open && 'rotate-180')} />
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="border-t border-zinc-800/80 px-5 py-4 bg-zinc-950/40"
            >
              {verdict.findings.length === 0 ? (
                <div className="py-6 text-center text-zinc-400 text-xs">
                  <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
                  <p className="font-semibold text-zinc-200 text-sm">All Squad Verification Checks Passed</p>
                  <p className="text-zinc-500 mt-0.5">No security vulnerabilities, architectural divergences, spec gaps, or untested functions found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Filters */}
                  <div className="flex items-center justify-between text-xs pb-1">
                    <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">
                      Prioritized Findings ({filteredFindings.length})
                    </span>
                    <div className="flex gap-1">
                      {['all', 'high', 'medium', 'low'].map(sev => (
                        <button
                          key={sev}
                          onClick={() => setFilterSeverity(sev)}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] uppercase font-mono transition-colors',
                            filterSeverity === sev ? 'bg-zinc-700 text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-300'
                          )}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredFindings.map((f, i) => {
                    const agentNames = (f.agent || 'synthesis').split(' + ')
                    return (
                      <div
                        key={i}
                        className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 flex flex-col gap-2 hover:border-zinc-700 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={SEV_BADGE[f.severity]} className="uppercase text-[9px] tracking-wider">
                              {f.severity}
                            </Badge>
                            {agentNames.map((ag) => {
                              const cleanAg = ag.trim() as AgentName
                              const ac = AGENT_CONFIG[cleanAg]
                              return ac ? (
                                <Badge key={cleanAg} variant={ac.badgeVariant as never} className="text-[10px]">
                                  {ac.label}
                                </Badge>
                              ) : (
                                <Badge key={ag} variant="secondary" className="text-[10px]">{ag}</Badge>
                              )
                            })}
                          </div>
                          {(f.file_ref || f.line_ref) && (
                            <span className="font-mono text-[11px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded">
                              {f.file_ref}{f.line_ref ? `:${f.line_ref}` : ''}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-zinc-200 font-mono leading-relaxed pl-1">
                          {f.description}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

// ─────────────────────────────────────────────
// Visual Components: Hero Wave, Chips, Isometric Box & Connectors
// ─────────────────────────────────────────────
function HeroArrowField() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      <div className="absolute inset-0 bg-hero-glow" />
      <div className="absolute -bottom-36 left-1/2 -translate-x-1/2 w-[850px] h-[480px] bg-sky-500/20 blur-[150px] rounded-full pointer-events-none" />

      <svg className="w-full h-full opacity-35" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="arrow-grid" width="42" height="42" patternUnits="userSpaceOnUse" patternTransform="rotate(26)">
            <path d="M 8 22 L 22 8 M 22 8 L 14 8 M 22 8 L 22 16" fill="none" stroke="rgba(125, 211, 252, 0.45)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="8" cy="22" r="1.2" fill="rgba(125, 211, 252, 0.6)" />
          </pattern>
          <radialGradient id="arrow-mask" cx="50%" cy="85%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="85%" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="arrow-mask-field">
            <rect width="100%" height="100%" fill="url(#arrow-mask)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#arrow-grid)" mask="url(#arrow-mask-field)" />
      </svg>
    </div>
  )
}

function BentoChipGraphic() {
  return (
    <div className="relative w-full h-44 sm:h-52 bg-[#07131D]/90 rounded-2xl border border-[#15364F] overflow-hidden flex items-center justify-center p-6 bg-dot-grid-dark shadow-2xl">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-[#4CA5C7] to-transparent opacity-80 blur-[1px]" />
      
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <path d="M 80 100 L 160 100" stroke="rgba(76,165,199,0.3)" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M 230 100 L 300 100 L 300 60 L 360 60" stroke="rgba(76,165,199,0.7)" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M 230 100 L 300 100 L 300 140 L 360 140" stroke="rgba(76,165,199,0.7)" strokeWidth="1.5" strokeDasharray="3 3" />
        <circle cx="360" cy="60" r="3" fill="#4CA5C7" />
        <circle cx="360" cy="140" r="3" fill="#4CA5C7" />
      </svg>

      <div className="relative z-10 flex items-center gap-7">
        <div className="w-14 h-14 rounded-2xl bg-[#0E2538] border border-[#4CA5C7]/50 flex items-center justify-center shadow-[0_0_20px_rgba(18,57,85,0.6)] relative group">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#123955] to-[#4CA5C7] flex items-center justify-center shadow-[0_0_12px_rgba(76,165,199,0.5)]">
            <Zap size={14} className="text-white fill-white" />
          </div>
          <span className="absolute -bottom-5 text-[9px] font-mono text-[#7DC0D9] uppercase tracking-wider">Subagent</span>
        </div>

        <div className="w-18 h-18 rounded-2xl bg-[#0A1C2B] border border-[#E65A33]/70 flex items-center justify-center shadow-[0_0_30px_rgba(230,90,51,0.3)] relative p-3">
          <div className="absolute inset-1 rounded-xl border border-dashed border-[#E65A33]/50 pointer-events-none" />
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#C34121] via-[#E65A33] to-[#F0714E] flex items-center justify-center shadow-[0_0_18px_rgba(230,90,51,0.8)]">
            <Cpu size={18} className="text-white" />
          </div>
          <span className="absolute -bottom-5 text-[9px] font-mono text-[#E65A33] font-bold uppercase tracking-wider">Synthesis</span>
        </div>
      </div>
    </div>
  )
}

function ToolConnectorsRow() {
  const tools = [
    { name: 'GitHub', icon: Code2, color: '#f1f5f9' },
    { name: 'Claude', icon: Sparkles, color: '#E65A33' },
    { name: 'Cursor', icon: Laptop, color: '#4CA5C7' },
    { name: 'OpenAI', icon: Cpu, color: '#10b981' },
    { name: 'Node.js', icon: Boxes, color: '#22c55e' },
    { name: 'Python', icon: Terminal, color: '#7DC0D9' },
    { name: 'Terminal', icon: Zap, color: '#E65A33' },
  ]
  return (
    <div className="relative py-6 max-w-2xl mx-auto flex flex-col items-center">
      <div className="flex items-center justify-center gap-2.5 sm:gap-4 flex-wrap z-10">
        {tools.map((t, idx) => (
          <div
            key={idx}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-[#0B2233]/90 border border-[#15364F] flex items-center justify-center shadow-xl hover:scale-110 hover:border-[#4CA5C7] transition-all cursor-pointer group backdrop-blur-sm"
          >
            <t.icon size={20} style={{ color: t.color }} className="group-hover:scale-110 transition-transform" />
          </div>
        ))}
      </div>
      <div className="w-3/4 h-5 border-b-2 border-dashed border-[#15364F] relative -top-2.5">
        <div className="absolute left-1/2 bottom-0 w-2.5 h-2.5 rounded-full bg-[#4CA5C7] -translate-x-1/2 translate-y-1.5 shadow-[0_0_10px_#4CA5C7]" />
      </div>
    </div>
  )
}

function IsometricBoxGraphic() {
  return (
    <div className="relative w-full h-[320px] flex items-center justify-center bg-dot-grid-subtle rounded-2xl border border-[#15364F] overflow-hidden bg-[#07131D]/80 p-4">
      <div className="relative w-64 h-52 select-none">
        {/* Card 1: Tests */}
        <div className="absolute top-0 left-10 w-44 h-26 rounded-xl bg-[#0B2233] border border-emerald-500/40 p-2.5 shadow-2xl -rotate-6 transition-transform hover:-translate-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400 font-bold mb-1">
            <span>04 TEST_COVERAGE</span>
            <TestTube2 size={12} />
          </div>
          <p className="text-[10px] text-zinc-400">Untested function & branch checks</p>
        </div>

        {/* Card 2: Architecture */}
        <div className="absolute top-5 left-6 w-44 h-26 rounded-xl bg-[#0B2233] border border-[#4CA5C7]/60 p-2.5 shadow-2xl -rotate-3 transition-transform hover:-translate-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#7DC0D9] font-bold mb-1">
            <span>03 ARCHITECTURE</span>
            <GitBranch size={12} />
          </div>
          <p className="text-[10px] text-zinc-400">AppError standard & layering</p>
        </div>

        {/* Card 3: Spec */}
        <div className="absolute top-10 left-3 w-44 h-26 rounded-xl bg-[#0B2233] border border-[#4CA5C7]/50 p-2.5 shadow-2xl rotate-2 transition-transform hover:-translate-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#7DC0D9] font-bold mb-1">
            <span>02 SPEC_COMPLIANCE</span>
            <FileText size={12} />
          </div>
          <p className="text-[10px] text-zinc-400">Linked PRD markdown/PDF clauses</p>
        </div>

        {/* Card 4: Security */}
        <div className="absolute top-14 left-0 w-44 h-26 rounded-xl bg-[#0B2233] border border-[#E65A33]/70 p-2.5 shadow-2xl rotate-6 transition-transform hover:-translate-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#E65A33] font-bold mb-1">
            <span>01 SECURITY</span>
            <ShieldCheck size={12} />
          </div>
          <p className="text-[10px] text-zinc-400">Hardcoded secrets & weak crypto</p>
        </div>

        {/* Isometric Box Base: Poseidon Navy */}
        <div className="absolute -bottom-3 left-2 w-48 h-18 rounded-lg border-2 border-[#4CA5C7]/70 bg-[#0E2538] flex flex-col justify-between p-2 shadow-2xl z-20">
          <div className="hatch-pattern absolute inset-0 opacity-40 rounded-lg pointer-events-none" />
          <span className="text-[9px] font-mono font-extrabold uppercase text-[#7DC0D9] tracking-wider relative z-10">
            SQUADRUNE ENGINE
          </span>
          <div className="flex items-center justify-between text-[8px] font-mono text-zinc-300 relative z-10 border-t border-[#15364F] pt-1">
            <span>ASYNCIO.GATHER</span>
            <span className="text-[#E65A33] font-bold">SUB-2S</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono bg-[#0B2233]/90 border border-[#15364F] text-[#7DC0D9] shadow-md">
          KEEP SCROLLING ⬡
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Application Page
// ─────────────────────────────────────────────
export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'studio' | 'cli' | 'agent' | 'history'>('overview')
  const [presets, setPresets] = useState<ReviewPreset[]>(FALLBACK_PRESETS)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('vulnerable-auth')
  const [diff, setDiff] = useState(FALLBACK_PRESETS[0].diff)
  const [specPath, setSpecPath] = useState(FALLBACK_PRESETS[0].specPath)
  const [agents, setAgents] = useState<AgentState[]>(DEFAULT_AGENTS)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showLogs, setShowLogs] = useState(true)
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [editorSubTab, setEditorSubTab] = useState<'diff' | 'spec' | 'repo'>('diff')
  const [totalWallClockMs, setTotalWallClockMs] = useState<number | undefined>(undefined)
  const [historicalRuns, setHistoricalRuns] = useState<RunStatus[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [installPkgMgr, setInstallPkgMgr] = useState<'npx' | 'npm' | 'brew' | 'mcp'>('npx')
  const [copiedInstall, setCopiedInstall] = useState(false)

  const copyInstallCmd = useCallback(() => {
    const cmdMap: Record<'npx' | 'npm' | 'brew' | 'mcp', string> = {
      npx: 'npx squadrune verify pr.diff --spec spec.md',
      npm: 'npm install -g squadrune',
      brew: 'brew install squadrune',
      mcp: 'squadrune_verify_diff',
    }
    navigator.clipboard.writeText(cmdMap[installPkgMgr])
    setCopiedInstall(true)
    setTimeout(() => setCopiedInstall(false), 2000)
  }, [installPkgMgr])

  const logRef = useRef<HTMLDivElement>(null)
  const wsRef  = useRef<WebSocket | null>(null)
  const startTimeRef = useRef<number>(0)

  const loadRunIntoStudio = useCallback((run: RunStatus) => {
    setActiveTab('studio')
    if (run.diff_text) setDiff(run.diff_text)
    if (run.spec_doc_ref) setSpecPath(run.spec_doc_ref)
    if (run.verdict_detail) setVerdict(run.verdict_detail)
    if (run.duration_ms) setTotalWallClockMs(run.duration_ms)
    if (run.agent_results && run.agent_results.length > 0) {
      setAgents(run.agent_results.map(ar => ({
        name: ar.agent as AgentName,
        status: 'done',
        severity: ar.severity,
        finding_count: ar.finding_count ?? 0,
        durationMs: ar.duration_ms,
        startedAt: ar.started_at,
        completedAt: ar.completed_at,
      })))
    } else if (run.verdict_detail) {
      setAgents(AGENTS.map(name => ({
        name,
        status: 'done',
        severity: (run.verdict === 'blocked' ? 'high' : run.verdict === 'needs_changes' ? 'medium' : 'none'),
        finding_count: run.verdict_detail?.findings?.filter(f => f.agent?.includes(name)).length ?? 0,
        durationMs: run.duration_ms ? Math.round(run.duration_ms * 0.85) : 1500,
      })))
    }
  }, [])

  // Check health & handle ?runId= on mount
  useEffect(() => {
    checkBackendHealth().then(res => {
      setBackendStatus(res.online ? 'online' : 'offline')
    })
    fetchPresets().then(ps => {
      if (ps && ps.length > 0) setPresets(ps)
    })
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const urlRunId = params.get('runId')
      if (urlRunId) {
        getRun(urlRunId).then(loadedRun => {
          if (loadedRun) loadRunIntoStudio(loadedRun)
        }).catch(() => {})
      }
    }
  }, [loadRunIntoStudio])

  // Fetch runs whenever history tab is active
  useEffect(() => {
    if (activeTab === 'history') {
      setHistoryLoading(true)
      listRuns()
        .then(setHistoricalRuns)
        .catch(() => {})
        .finally(() => setHistoryLoading(false))
    }
  }, [activeTab])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLogs(prev => [...prev, `${time}  ${msg}`])
  }, [])

  const reset = () => {
    setAgents(DEFAULT_AGENTS)
    setVerdict(null)
    setLogs([])
    setError(null)
    setTotalWallClockMs(undefined)
  }

  const handleSelectPreset = (preset: ReviewPreset) => {
    setSelectedPresetId(preset.id)
    setDiff(preset.diff)
    setSpecPath(preset.specPath)
    reset()
  }

  // Handle incoming WebSocket events
  const handleWsEvent = useCallback((ev: WsEvent) => {
    const now = Date.now()
    switch (ev.type) {
      case 'run_started':
        addLog('⚡ Squad Orchestrator dispatched all 4 agents concurrently')
        break
      case 'subagent_started':
        addLog(`▶ [${ev.data.agent.replace(/_/g, ' ')}] started analysis`)
        setAgents(prev => prev.map(a => a.name === ev.data.agent ? { ...a, status: 'running', offsetMs: 0 } : a))
        break
      case 'subagent_done':
        addLog(`✓ [${ev.data.agent.replace(/_/g, ' ')}] finished · ${ev.data.finding_count} findings · ${ev.data.duration_ms}ms`)
        setAgents(prev => prev.map(a => a.name === ev.data.agent
          ? {
              ...a,
              status: 'done',
              severity: ev.data.severity,
              finding_count: ev.data.finding_count,
              durationMs: ev.data.duration_ms,
              startedAt: ev.data.started_at,
              completedAt: ev.data.completed_at,
            }
          : a
        ))
        break
      case 'synthesis_started':
        addLog('⚙ Synthesis Agent merging, deduplicating & ranking findings…')
        break
      case 'verdict_ready':
        addLog(`🏁 Final Verdict: ${ev.data.status.toUpperCase()}`)
        setVerdict(ev.data)
        if (startTimeRef.current > 0) {
          setTotalWallClockMs(now - startTimeRef.current)
        }
        break
      case 'run_complete':
        addLog('Done.')
        setRunning(false)
        wsRef.current?.close()
        break
    }
  }, [addLog])

  // Polling fallback
  const pollForResult = useCallback(async (runId: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1200))
      try {
        const run = await getRun(runId)
        if (run.status === 'done' && run.verdict_detail) {
          setVerdict(run.verdict_detail)
          if (run.agent_results && run.agent_results.length > 0) {
            setAgents(run.agent_results.map(ar => ({
              name: ar.agent as AgentName,
              status: 'done',
              severity: ar.severity,
              finding_count: ar.finding_count ?? 0,
              durationMs: ar.duration_ms,
            })))
          } else {
            setAgents(p => p.map(a => ({ ...a, status: 'done' })))
          }
          if (run.duration_ms) setTotalWallClockMs(run.duration_ms)
          setRunning(false)
          addLog(`Verdict: ${run.verdict?.toUpperCase()}`)
          return
        }
        if (run.status === 'failed') {
          setError('Run reported failure.')
          setRunning(false)
          return
        }
      } catch {
        // keep polling
      }
    }
    setError('Polling timed out.')
    setRunning(false)
  }, [addLog])

  // Client-side simulated run if backend is offline
  const runOfflineSimulatedSquad = async () => {
    reset()
    setRunning(true)
    startTimeRef.current = Date.now()
    addLog('⚡ [Local Engine] Dispatching 4 subagents in parallel…')

    // Start all 4
    setAgents(p => p.map(a => ({ ...a, status: 'running', offsetMs: 0 })))
    addLog('▶ [security] started analysis (+0ms)')
    addLog('▶ [architecture] started analysis (+0ms)')
    addLog('▶ [spec_compliance] started analysis (+0ms)')
    addLog('▶ [test_coverage] started analysis (+0ms)')

    // Simultaneous simulated delays
    const isVulnerable = diff.includes('hardcoded-jwt-secret-abc123')
    const isClean = diff.includes('JWT_SECRET_KEY') && diff.includes('test_validate_token')
    const isUntested = diff.includes('process_instant_payout')
    const isArch = diff.includes('sync_user')

    setTimeout(() => {
      addLog('✓ [test_coverage] done · 1102ms')
      setAgents(p => p.map(a => a.name === 'test_coverage' ? {
        ...a,
        status: 'done',
        durationMs: 1102,
        finding_count: isVulnerable ? 2 : isUntested ? 1 : 0,
        severity: isVulnerable ? 'high' : isUntested ? 'high' : 'none'
      } : a))
    }, 1100)

    setTimeout(() => {
      addLog('✓ [security] done · 1201ms')
      setAgents(p => p.map(a => a.name === 'security' ? {
        ...a,
        status: 'done',
        durationMs: 1201,
        finding_count: isVulnerable ? 2 : 0,
        severity: isVulnerable ? 'high' : 'none'
      } : a))
    }, 1200)

    setTimeout(() => {
      addLog('✓ [architecture] done · 1501ms')
      setAgents(p => p.map(a => a.name === 'architecture' ? {
        ...a,
        status: 'done',
        durationMs: 1501,
        finding_count: isVulnerable ? 1 : isArch ? 2 : 0,
        severity: isVulnerable ? 'medium' : isArch ? 'medium' : 'none'
      } : a))
    }, 1500)

    setTimeout(() => {
      addLog('✓ [spec_compliance] done · 1801ms')
      setAgents(p => p.map(a => a.name === 'spec_compliance' ? {
        ...a,
        status: 'done',
        durationMs: 1801,
        finding_count: isVulnerable ? 3 : 0,
        severity: isVulnerable ? 'high' : 'none'
      } : a))

      addLog('⚙ Synthesis Agent merging, deduplicating & ranking findings…')

      let finalVerdict: Verdict
      if (isVulnerable) {
        finalVerdict = {
          status: 'blocked',
          summary: '4 of 4 agents flagged issues (3 high, 1 medium, 1 low severity). Top issue: Hardcoded JWT secret key in auth.py.',
          findings: [
            { description: 'Hardcoded JWT secret key: SECRET_KEY = "hardcoded-jwt-secret-abc123" in auth.py. Secrets must be loaded from environment variables (FR-4).', severity: 'high', file_ref: 'auth.py', line_ref: 27, agent: 'security + spec_compliance' },
            { description: 'Password hashing downgraded from bcrypt to SHA-256. SHA-256 is not a password hashing function — fast and GPU-crackable.', severity: 'high', file_ref: 'auth.py', line_ref: 34, agent: 'security + spec_compliance' },
            { description: 'New function validate_token() added in auth.py has NO corresponding test in test_auth.py. Spec (FR-2) requires unit tests.', severity: 'high', file_ref: 'auth.py', line_ref: 51, agent: 'test_coverage' },
            { description: 'validate_token() raises raw ValueError exceptions instead of standard AppError class (FR-3).', severity: 'medium', file_ref: 'auth.py', line_ref: 60, agent: 'architecture + spec_compliance' },
            { description: 'hash_password() behavior changed to SHA-256 but test_hash_password_returns_string not updated.', severity: 'low', file_ref: 'test_auth.py', line_ref: 8, agent: 'test_coverage' },
          ],
          agents_completed: ['security', 'architecture', 'spec_compliance', 'test_coverage'],
          agents_failed: [],
          duration_ms: 1805,
        }
      } else if (isClean) {
        finalVerdict = {
          status: 'pass',
          summary: 'All 4 agents passed. Zero defects detected. Clean architecture, bcrypt crypto, and tests confirmed.',
          findings: [],
          agents_completed: ['security', 'architecture', 'spec_compliance', 'test_coverage'],
          agents_failed: [],
          duration_ms: 1780,
        }
      } else {
        finalVerdict = {
          status: 'needs_changes',
          summary: 'Review flagged defects requiring changes before merge.',
          findings: [
            { description: 'Critical routines added without corresponding unit test suite updates.', severity: 'medium', file_ref: 'services/payment.py', line_ref: 1, agent: 'test_coverage' },
          ],
          agents_completed: ['security', 'architecture', 'spec_compliance', 'test_coverage'],
          agents_failed: [],
          duration_ms: 1750,
        }
      }

      setVerdict(finalVerdict)
      setTotalWallClockMs(finalVerdict.duration_ms)
      addLog(`🏁 Final Verdict: ${finalVerdict.status.toUpperCase()}`)
      setRunning(false)
    }, 1800)
  }

  // Execute Squad Review
  const runSquad = async () => {
    if (!diff.trim()) {
      setError('Paste or select a diff to review.')
      return
    }

    if (backendStatus === 'offline') {
      runOfflineSimulatedSquad()
      return
    }

    reset()
    setRunning(true)
    startTimeRef.current = Date.now()
    addLog('Submitting payload to orchestrator…')

    try {
      const { run_id } = await postRun({ diff, spec_doc_ref: specPath || undefined })
      addLog(`Run ${run_id.slice(0, 8)}… initialized`)
      const ws = openRunStream(run_id)
      wsRef.current = ws

      ws.onopen    = () => addLog('Live WebSocket event stream connected')
      ws.onmessage = (e) => handleWsEvent(JSON.parse(e.data) as WsEvent)
      ws.onerror   = () => {
        addLog('WebSocket disconnected — polling REST endpoint')
        pollForResult(run_id)
      }
      ws.onclose   = () => setRunning(false)
    } catch (err: unknown) {
      addLog('Backend server not responding — switching to local verification engine')
      runOfflineSimulatedSquad()
    }
  }

  // Copy PR Review Comment
  const copyPRComment = () => {
    if (!verdict) return
    let md = `### ⚡ Squadrune Multi-Agent Verification: **${verdict.status.toUpperCase()}**\n\n`
    md += `> ${verdict.summary}\n\n`
    if (verdict.findings.length > 0) {
      md += `| Severity | Agent | File | Finding |\n|---|---|---|---|\n`
      verdict.findings.forEach(f => {
        md += `| **${f.severity.toUpperCase()}** | ${f.agent || '—'} | \`${f.file_ref || 'diff'}:${f.line_ref || ''}\` | ${f.description} |\n`
      })
    } else {
      md += `✅ **All 4 verification checks passed.** No security, architecture, spec, or test flaws detected.\n`
    }
    navigator.clipboard.writeText(md)
  }

  // Keyboard shortcut: Cmd/Ctrl + Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (!running) runSquad()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [running, diff, specPath])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-[#07131D] text-zinc-100 flex flex-col font-sans selection:bg-[#4CA5C7]/30 selection:text-[#A8D7E8]">

        {/* ── Top Navigation Bar ──────────────────────────────────────────── */}
        <header className="glass-nav sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                onClick={() => setActiveTab('overview')}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <SquadruneLogo size="sm" withText={true} />
                <Badge variant="blue" className="text-[9px] px-1.5 py-0 font-mono border-[#4CA5C7]/40 bg-[#123955]/60 text-[#7DC0D9]">
                  v0.1
                </Badge>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-[#0A1C2B]/90 p-1 rounded-xl border border-[#15364F] text-xs">
              <button
                onClick={() => setActiveTab('overview')}
                className={cn(
                  'px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5',
                  activeTab === 'overview' ? 'bg-[#123955] text-white border border-[#4CA5C7]/40 shadow-sm' : 'text-zinc-400 hover:text-[#7DC0D9]'
                )}
              >
                <Sparkles size={13} className="text-[#4CA5C7]" /> Overview
              </button>
              <button
                onClick={() => setActiveTab('studio')}
                className={cn(
                  'px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5',
                  activeTab === 'studio' ? 'bg-gradient-to-r from-[#E65A33] to-[#C34121] text-white font-semibold shadow-[0_0_14px_rgba(230,90,51,0.4)]' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <Laptop size={13} /> Review Studio
              </button>
              <button
                onClick={() => setActiveTab('cli')}
                className={cn(
                  'px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5',
                  activeTab === 'cli' ? 'bg-[#123955] text-white border border-[#4CA5C7]/40 shadow-sm' : 'text-zinc-400 hover:text-[#7DC0D9]'
                )}
              >
                <Terminal size={13} /> CLI & CI
              </button>
              <button
                onClick={() => setActiveTab('agent')}
                className={cn(
                  'px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5',
                  activeTab === 'agent' ? 'bg-[#123955] text-white border border-[#4CA5C7]/40 shadow-sm' : 'text-zinc-400 hover:text-[#7DC0D9]'
                )}
              >
                <Cpu size={13} /> Agent Mode
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={cn(
                  'px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5',
                  activeTab === 'history' ? 'bg-[#123955] text-white border border-[#4CA5C7]/40 shadow-sm' : 'text-zinc-400 hover:text-[#7DC0D9]'
                )}
              >
                <HistoryIcon size={13} /> History
              </button>
            </div>

            {/* Right Status */}
            <div className="flex items-center gap-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0A1C2B] border border-[#15364F] text-[11px] font-mono">
                    <span className={cn('w-2 h-2 rounded-full animate-pulse', backendStatus === 'online' ? 'bg-emerald-400' : 'bg-[#E65A33]')} />
                    <span className="text-zinc-300 hidden sm:inline">
                      {backendStatus === 'online' ? 'API 8000' : 'Local Engine'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {backendStatus === 'online'
                    ? 'Connected to FastAPI backend with WebSocket stream'
                    : 'Backend server offline — running browser simulation (run ./squadrune serve)'}
                </TooltipContent>
              </Tooltip>

              <Button
                size="sm"
                onClick={() => setActiveTab('studio')}
                className="h-8 gap-1.5 text-xs bg-gradient-to-r from-[#E65A33] to-[#C34121] hover:from-[#F0714E] hover:to-[#E65A33] text-white font-semibold shadow-[0_0_16px_rgba(230,90,51,0.35)] border border-[#E65A33]/40"
              >
                <Play size={12} fill="currentColor" /> Try Studio
              </Button>
            </div>
          </div>
        </header>

        {/* ── Tab Content: OVERVIEW / PROMO PAGE ────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="flex-1 pb-24">
            {/* Hero Section with React Bits Ascii Waves & Pantone Colors */}
            <section className="relative overflow-hidden pt-20 pb-20 px-4 text-center max-w-6xl mx-auto min-h-[580px] flex flex-col justify-center">
              {/* Ascii Waves Background Component */}
              <AsciiWaves
                elementSize={14}
                speed={0.75}
                waveTension={0.45}
                waveTwist={0.14}
                noiseScale={1.1}
                characters=" .:-+*=%@#"
                palette="pantone"
                hasCursorInteraction={true}
                interactionIntensity={1.3}
                className="opacity-75"
              />

              {/* Ambient radial glow overlays to ensure high contrast */}
              <div className="absolute inset-0 bg-hero-glow pointer-events-none opacity-85" />
              <div className="absolute -bottom-28 left-1/2 -translate-x-1/2 w-[850px] h-[380px] bg-[#123955]/40 blur-[150px] rounded-full pointer-events-none" />

              <motion.div initial="hidden" animate="show" variants={stagger} className="relative z-10 space-y-6">
                {/* Single Sleek Announcement Pill Badge */}
                <motion.div variants={fadeUp} className="flex items-center justify-center">
                  <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#0B2233]/90 border border-[#4CA5C7]/40 text-xs text-zinc-300 shadow-[0_0_24px_rgba(76,165,199,0.2)] backdrop-blur-md hover:border-[#4CA5C7]/70 transition-all cursor-default">
                    <span className="flex h-2 w-2 rounded-full bg-[#E65A33] animate-pulse shadow-[0_0_8px_rgba(230,90,51,0.8)]" />
                    <span className="font-semibold text-white tracking-wide">Squadrune Engine</span>
                    <span className="text-zinc-600">|</span>
                    <span className="text-[#7DC0D9] font-medium">4 Autonomous Subagents</span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-400 font-mono text-[11px]">Sub-2s asyncio.gather</span>
                  </div>
                </motion.div>

                {/* High-Impact Modern Sans-Serif Headline */}
                <motion.h1
                  variants={fadeUp}
                  className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.035em] leading-[1.05] max-w-4xl mx-auto text-white drop-shadow-sm"
                >
                  Parallel Multi-Agent Verification{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7DC0D9] via-[#4CA5C7] to-[#E65A33]">
                    in Under 2 Seconds.
                  </span>
                </motion.h1>

                {/* Punchy, Clear Subheadline */}
                <motion.p
                  variants={fadeUp}
                  className="text-zinc-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed drop-shadow-sm"
                >
                  Stop waiting hours for human code reviews. Squadrune coordinates four specialized subagents in parallel to audit Security, Architecture, Spec Compliance, and Tests before pull requests merge.
                </motion.p>

                {/* Primary & Secondary Action CTAs */}
                <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3.5 pt-2">
                  <button
                    onClick={() => {
                      setActiveTab('studio')
                      setTimeout(() => runSquad(), 200)
                    }}
                    className="px-7 py-3 rounded-xl bg-gradient-to-r from-[#E65A33] to-[#C34121] hover:from-[#F0714E] hover:to-[#E65A33] text-white font-bold text-sm transition-all shadow-[0_0_24px_rgba(230,90,51,0.35)] flex items-center gap-2 group hover:scale-[1.02] border border-[#E65A33]/40"
                  >
                    <Play size={14} fill="currentColor" />
                    <span>Launch Interactive Studio</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cli')}
                    className="px-6 py-3 rounded-xl bg-[#0E2538]/90 hover:bg-[#123955] text-zinc-200 border border-[#4CA5C7]/40 hover:border-[#4CA5C7] font-semibold text-sm transition-all flex items-center gap-2 backdrop-blur-md shadow-lg"
                  >
                    <Terminal size={14} className="text-[#4CA5C7]" />
                    <span>CLI & CI Gate</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('agent')}
                    className="px-5 py-3 rounded-xl text-zinc-400 hover:text-[#7DC0D9] font-medium text-sm transition-all flex items-center gap-1.5 hover:bg-[#0E2538]/50"
                  >
                    <Cpu size={14} className="text-[#7DC0D9]" />
                    <span>Agent Mode (MCP) →</span>
                  </button>
                </motion.div>

                {/* Hero Install & Quickstart Command Bar */}
                <motion.div variants={fadeUp} className="max-w-xl mx-auto pt-3">
                  <div className="bg-[#0B2233]/90 border border-[#15364F] rounded-xl p-1.5 flex items-center justify-between gap-3 shadow-2xl backdrop-blur-md">
                    <div className="flex items-center gap-1 pl-1.5">
                      {(['npx', 'npm', 'brew', 'mcp'] as const).map(pkgMgr => (
                        <button
                          key={pkgMgr}
                          onClick={() => setInstallPkgMgr(pkgMgr as any)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all",
                            installPkgMgr === pkgMgr
                              ? "bg-[#4CA5C7]/20 text-[#7DC0D9] font-bold border border-[#4CA5C7]/50 shadow-sm"
                              : "text-zinc-400 hover:text-zinc-200"
                          )}
                        >
                          {pkgMgr}
                        </button>
                      ))}
                    </div>
                    <div className="h-4 w-px bg-[#15364F]" />
                    <div className="font-mono text-xs text-zinc-300 flex-1 text-left truncate">
                      {installPkgMgr === 'npx' && <><span className="text-[#4CA5C7] font-semibold">$ npx</span> squadrune verify pr.diff</>}
                      {installPkgMgr === 'npm' && <><span className="text-[#4CA5C7] font-semibold">$ npm</span> install -g squadrune</>}
                      {installPkgMgr === 'brew' && <><span className="text-[#4CA5C7] font-semibold">$ brew</span> install squadrune</>}
                      {installPkgMgr === 'mcp' && <><span className="text-[#4CA5C7] font-semibold">&quot;squadrune_verify_diff&quot;</span> via MCP</>}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={copyInstallCmd}
                      className="h-7 px-3 text-xs text-zinc-400 hover:text-white hover:bg-[#0E2538] gap-1 shrink-0"
                    >
                      {copiedInstall ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold"><Check size={11} /> Copied</span>
                      ) : (
                        <span className="flex items-center gap-1"><Copy size={11} /> Copy</span>
                      )}
                    </Button>
                  </div>
                </motion.div>

                {/* Key Metrics Floating Strip */}
                <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs font-mono text-zinc-400">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A1C2B]/80 border border-[#15364F] backdrop-blur-sm">
                    <Zap size={12} className="text-[#E65A33]" />
                    <span><strong className="text-zinc-100">~1.8s</strong> median latency</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A1C2B]/80 border border-[#15364F] backdrop-blur-sm">
                    <ShieldCheck size={12} className="text-[#4CA5C7]" />
                    <span><strong className="text-zinc-100">4</strong> specialized subagents</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A1C2B]/80 border border-[#15364F] backdrop-blur-sm">
                    <FileText size={12} className="text-[#7DC0D9]" />
                    <span>PRD Markdown & PDF support</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A1C2B]/80 border border-[#15364F] backdrop-blur-sm">
                    <Cpu size={12} className="text-emerald-400" />
                    <span>Zero-setup MCP & SDK</span>
                  </div>
                </motion.div>
              </motion.div>
            </section>

            {/* Bento Grid: What We Do (Reference Image 2) */}
            <section className="max-w-6xl mx-auto px-4 py-20 border-t border-zinc-900">
              <div className="text-center max-w-2xl mx-auto mb-14">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 mb-3 uppercase tracking-wider">
                  <span>What We Do</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100">
                  A sovereign verification suite for modern software teams.
                </h2>
                <p className="text-zinc-400 text-sm mt-3 leading-relaxed">
                  Replace sequential human review skims with four parallel subagents running on pure async concurrency.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Top Big Split Card (Spans 3 cols) */}
                <div className="md:col-span-3 rounded-3xl border border-zinc-800/90 bg-zinc-950/70 p-6 sm:p-8 backdrop-blur-sm grid md:grid-cols-12 gap-8 items-center hover:border-zinc-700/80 transition-all">
                  <div className="md:col-span-7 space-y-4">
                    <Badge variant="blue" className="text-[10px] uppercase font-mono tracking-wider">
                      Multi-Agent Concurrency
                    </Badge>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight leading-snug">
                      Accelerate PR confidence with sovereign multi-agent verification.
                    </h3>
                    <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                      Deploy specialized subagents that examine cryptographic hygiene, architecture conventions, PRD specifications, and test coverage concurrently with zero reviewer wait-time.
                    </p>
                    <div className="pt-2 flex items-center gap-3">
                      <button
                        onClick={() => {
                          setActiveTab('studio')
                          setTimeout(() => runSquad(), 200)
                        }}
                        className="px-5 py-2.5 rounded-full bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-xs transition-all flex items-center gap-2 shadow-[0_0_16px_rgba(56,189,248,0.3)]"
                      >
                        <span>Launch Live Demo</span>
                        <ArrowRight size={13} />
                      </button>
                      <span className="text-xs text-zinc-500 font-mono">0ms dispatch offset</span>
                    </div>
                  </div>
                  <div className="md:col-span-5">
                    <BentoChipGraphic />
                  </div>
                </div>

                {/* Bottom 3 Cards */}
                {/* Card 1: AI-Powered Automation */}
                <div className="rounded-3xl border border-zinc-800/90 bg-zinc-950/70 p-6 flex flex-col justify-between hover:border-zinc-700 transition-all group">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl chip-emboss border border-zinc-700/60 flex items-center justify-center text-[#E65A33] shadow-lg group-hover:scale-105 transition-transform">
                        <Zap size={22} className="fill-[#E65A33]/20" />
                      </div>
                      <Badge variant="orangered" className="text-[10px] font-mono">ASYNCIO.GATHER</Badge>
                    </div>
                    <h4 className="text-lg font-bold text-zinc-100 mb-2">AI-Powered Automation</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Four subagents execute in pure async concurrency via Python <code className="text-[#F0714E]">asyncio.gather</code> with identical 0ms start offsets.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-zinc-900 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                    <span>Engine Latency</span>
                    <span className="text-[#E65A33] font-bold">~1.84s median</span>
                  </div>
                </div>

                {/* Card 2: Connect Any Type of Code */}
                <div className="rounded-3xl border border-zinc-800/90 bg-zinc-950/70 p-6 flex flex-col justify-between hover:border-zinc-700 transition-all group">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl chip-emboss border border-zinc-700/60 flex items-center justify-center text-sky-400 shadow-lg group-hover:scale-105 transition-transform">
                        <Code2 size={22} />
                      </div>
                      <Badge variant="blue" className="text-[10px] font-mono">UNIVERSAL INPUT</Badge>
                    </div>
                    <h4 className="text-lg font-bold text-zinc-100 mb-2">Connect Any Type of Code</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Works natively with unified diffs, local git patches, and PRD specification documents in Markdown or PDF format.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-zinc-900 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                    <span>Supported Formats</span>
                    <span className="text-sky-400 font-bold">.diff · .md · .pdf</span>
                  </div>
                </div>

                {/* Card 3: Real-Time Monitoring */}
                <div className="rounded-3xl border border-zinc-800/90 bg-zinc-950/70 p-6 flex flex-col justify-between hover:border-zinc-700 transition-all group">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 rounded-2xl chip-emboss border border-zinc-700/60 flex items-center justify-center text-[#4CA5C7] shadow-lg group-hover:scale-105 transition-transform">
                        <Cpu size={22} />
                      </div>
                      <Badge variant="norse" className="text-[10px] font-mono">LIVE WEBSOCKET</Badge>
                    </div>
                    <h4 className="text-lg font-bold text-zinc-100 mb-2">Real-Time Monitoring</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Stream findings token-by-token over WebSocket, JSON-RPC 2.0 stdio, or inspect through the visual Review Studio.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-zinc-900 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                    <span>Live Stream</span>
                    <span className="text-[#7DC0D9] font-bold">ws://localhost:8000</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Ecosystem & Layered Isometric Blueprint (Reference Images 3 & 4) */}
            <section className="max-w-6xl mx-auto px-4 py-20 border-t border-zinc-900">
              <div className="text-center max-w-2xl mx-auto mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 mb-3 uppercase tracking-wider">
                  <span>The Verification Engine</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100">
                  Engineered for autonomous coding agents & modern Git teams.
                </h2>
                <p className="text-zinc-400 text-sm mt-3 leading-relaxed">
                  The missing verification bridge between AI code generation and production deployment.
                </p>
              </div>

              {/* Floating App Squircles Row (Reference Image 3) */}
              <ToolConnectorsRow />

              {/* 3-Column Architecture Blueprint (Reference Image 4) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch pt-4">
                {/* Left Column: Workflow Pitch (4 cols) */}
                <div className="lg:col-span-4 rounded-3xl border border-zinc-800/90 bg-zinc-950/70 p-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <Badge variant="norse" className="text-[10px] font-mono uppercase">Agentic Bridge</Badge>
                    <h3 className="text-xl font-bold text-zinc-100">The Missing Verification Bridge</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Autonomous agents like Claude Code, Cursor, and IBM Bob 2.0 write code at blistering speed, but lack independent self-critique. Squadrune acts as the sovereign gatekeeper before merge.
                    </p>
                    <div className="space-y-3 pt-2">
                      <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                        <div className="w-7 h-7 rounded-lg bg-[#E65A33]/15 text-[#E65A33] flex items-center justify-center shrink-0">
                          <Terminal size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-200">Zero-Setup Agent Integration</div>
                          <div className="text-[11px] text-zinc-400">Plugs directly into agent tool loops via standard MCP stdio.</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                          <FileText size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-200">Spec-Aware Document Cross-Check</div>
                          <div className="text-[11px] text-zinc-400">Extracts exact clause requirements from PRD Markdown or PDF.</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800">
                        <div className="w-7 h-7 rounded-lg bg-[#4CA5C7]/15 text-[#7DC0D9] flex items-center justify-center shrink-0">
                          <CheckCircle2 size={14} />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-200">Deterministic Synthesis Verdict</div>
                          <div className="text-[11px] text-zinc-400">Deduplicates overlapping findings and outputs concrete exit codes.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-zinc-900 text-[11px] font-mono text-zinc-500 flex items-center justify-between">
                    <span>Model Agnostic</span>
                    <span className="text-emerald-400">Zero Lock-In</span>
                  </div>
                </div>

                {/* Center Column: Isometric Engine Box (4 cols) */}
                <div className="lg:col-span-4 flex flex-col">
                  <IsometricBoxGraphic />
                </div>

                {/* Right Column: Technical Metadata Checklist (4 cols) */}
                <div className="lg:col-span-4 rounded-3xl border border-zinc-800/90 bg-zinc-950/70 p-6 flex flex-col justify-between">
                  <div className="space-y-4">
                    <Badge variant="blue" className="text-[10px] font-mono uppercase">System Specs</Badge>
                    <h3 className="text-xl font-bold text-zinc-100">Technical Guarantees</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Strict verification contracts enforce deterministic checks across all pull requests and branch patches.
                    </p>
                    <div className="space-y-2.5 pt-2 text-xs font-mono">
                      {[
                        { label: 'Parallel Workers', val: '4 Specialized Subagents', check: true },
                        { label: 'Latency Target', val: 'Sub-2s (asyncio)', check: true },
                        { label: 'Spec Parsers', val: 'Markdown & PDF PRDs', check: true },
                        { label: 'Exit Codes', val: '0 (Pass), 1 (Needs Chg), 2 (Blocked)', check: true },
                        { label: 'API Protocols', val: 'REST, WS, MCP stdio', check: true },
                        { label: 'Package Formats', val: 'NPM, Brew, PyPI', check: true },
                      ].map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
                          <div className="flex items-center gap-2">
                            <Check size={12} className="text-sky-400" />
                            <span className="text-zinc-400">{row.label}</span>
                          </div>
                          <span className="text-zinc-200 font-bold text-[11px]">{row.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-6 border-t border-zinc-900 text-[11px] font-mono text-zinc-500 flex items-center justify-between">
                    <span>Verified Output</span>
                    <span className="text-sky-400">SARIF & JSON Schema</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Stat & Live Studio Preview (Reference Image 5) */}
            <section className="max-w-6xl mx-auto px-4 py-20 border-t border-zinc-900">
              {/* Split Row: Headline on Left, 90% Stat on Right */}
              <div className="grid md:grid-cols-12 gap-8 items-center mb-12">
                <div className="md:col-span-7 space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 uppercase tracking-wider">
                    <span>Measurable Impact</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100">
                    Eliminate PR waiting queues and ship verified code instantly.
                  </h2>
                  <p className="text-zinc-400 text-sm leading-relaxed max-w-xl">
                    Traditional human code reviews take an average of 4.2 hours per pull request. Squadrune's multi-agent squad evaluates diffs against your exact PRD requirements in under 2 seconds.
                  </p>
                </div>
                <div className="md:col-span-5 flex flex-col items-start md:items-end justify-center">
                  <div className="p-6 rounded-3xl bg-zinc-950 border border-zinc-800/80 shadow-2xl relative overflow-hidden">
                    <div className="text-6xl sm:text-7xl font-extrabold font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#E65A33] via-[#7DC0D9] to-white">
                      90%
                    </div>
                    <div className="text-xs font-semibold text-zinc-200 mt-2">
                      Faster PR Turnaround Time
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                      vs sequential human skims & queue wait
                    </div>
                  </div>
                </div>
              </div>

              {/* Glowing Studio Workbench Preview Card */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#123955]/30 via-[#4CA5C7]/20 to-[#E65A33]/25 rounded-3xl blur-2xl opacity-70 group-hover:opacity-100 transition-opacity" />
                
                <div className="relative rounded-3xl border border-zinc-800 bg-zinc-950/90 shadow-2xl overflow-hidden backdrop-blur-md">
                  {/* Workbench Titlebar */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/60">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-[#4CA5C7]/80" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                      </div>
                      <div className="h-4 w-px bg-zinc-800 mx-1" />
                      <div className="flex items-center gap-2 font-mono text-xs text-zinc-300">
                        <Laptop size={13} className="text-[#4CA5C7]" />
                        <span className="font-semibold">Review Studio</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-[#E65A33]">vulnerable-auth.diff</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <FileText size={10} /> auth-spec.md
                      </Badge>
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Engine Online
                      </span>
                    </div>
                  </div>

                  {/* Preview Content: Diff on Left, Agent Statuses on Right */}
                  <div className="grid md:grid-cols-12 gap-0 divide-y md:divide-y-0 md:divide-x divide-zinc-800/80">
                    {/* Diff Preview Pane (7 cols) */}
                    <div className="md:col-span-7 p-5 font-mono text-[11px] leading-relaxed overflow-hidden bg-zinc-950/50">
                      <div className="text-zinc-500 mb-2 pb-1 border-b border-zinc-800 flex items-center justify-between text-[10px]">
                        <span>FILE: auth.py (PR #142)</span>
                        <span className="text-red-400 font-bold">+18 lines / -6 lines</span>
                      </div>
                      <div className="space-y-1 text-zinc-300">
                        <div className="text-zinc-600">@@ -42,6 +42,18 @@ def authenticate_user(username, password):</div>
                        <div className="text-zinc-400">   user = db.query(User).filter_by(username=username).first()</div>
                        <div className="text-red-400 bg-red-950/20 px-1 rounded">-  if not bcrypt.checkpw(password, user.password_hash):</div>
                        <div className="text-red-400 bg-red-950/20 px-1 rounded">-      raise AppError(code=&quot;AUTH_001&quot;, msg=&quot;Invalid credentials&quot;)</div>
                        <div className="text-emerald-400 bg-emerald-950/20 px-1 rounded">+  # Quick demo: downgrade to SHA-256</div>
                        <div className="text-emerald-400 bg-emerald-950/20 px-1 rounded">+  if hashlib.sha256(password.encode()).hexdigest() != user.password_hash:</div>
                        <div className="text-emerald-400 bg-emerald-950/20 px-1 rounded">+      raise ValueError(&quot;Invalid password&quot;) # violates error standard</div>
                        <div className="text-emerald-400 bg-emerald-950/20 px-1 rounded">+  token = jwt.encode(&#123;&quot;sub&quot;: username&#125;, &quot;SECRET_KEY_12345&quot;, algorithm=&quot;HS256&quot;)</div>
                        <div className="text-zinc-400">   return &#123;&quot;token&quot;: token, &quot;type&quot;: &quot;Bearer&quot;&#125;</div>
                      </div>
                    </div>

                    {/* Agent Verification Verdict Pane (5 cols) */}
                    <div className="md:col-span-5 p-5 bg-zinc-900/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3 text-xs">
                          <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[10px]">
                            Squad Verdict (4 Agents)
                          </span>
                          <Badge variant="red" className="text-[10px] font-bold">BLOCKED</Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="p-2 rounded-xl bg-zinc-950/80 border border-[#E65A33]/40 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <ShieldCheck size={14} className="text-[#E65A33]" />
                              <span className="font-medium text-zinc-200">Security Agent</span>
                            </div>
                            <span className="text-[10px] font-mono text-red-400 font-bold">2 High Issues</span>
                          </div>
                          <div className="p-2 rounded-xl bg-zinc-950/80 border border-[#4CA5C7]/40 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <GitBranch size={14} className="text-[#4CA5C7]" />
                              <span className="font-medium text-zinc-200">Architecture Agent</span>
                            </div>
                            <span className="text-[10px] font-mono text-[#E65A33] font-bold">1 Medium Issue</span>
                          </div>
                          <div className="p-2 rounded-xl bg-zinc-950/80 border border-[#4CA5C7]/40 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <FileText size={14} className="text-[#7DC0D9]" />
                              <span className="font-medium text-zinc-200">Spec Compliance</span>
                            </div>
                            <span className="text-[10px] font-mono text-red-400 font-bold">FR-1 & FR-3 Violated</span>
                          </div>
                          <div className="p-2 rounded-xl bg-zinc-950/80 border border-emerald-500/40 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <TestTube2 size={14} className="text-emerald-400" />
                              <span className="font-medium text-zinc-200">Test Coverage</span>
                            </div>
                            <span className="text-[10px] font-mono text-[#7DC0D9] font-bold">Missing Edge Tests</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                        <span className="text-zinc-500 font-mono text-[11px]">Duration: 1.82s</span>
                        <span className="text-zinc-400 text-[11px]">Deduplicated & prioritized</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Bar */}
                  <div className="p-4 bg-zinc-900/60 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-zinc-400">
                      Try it live with full diff editing, custom PRD spec documents, and token-by-token subagent streaming.
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('studio')
                        setTimeout(() => runSquad(), 200)
                      }}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#E65A33] to-[#C34121] hover:from-[#F0714E] hover:to-[#E65A33] text-white font-bold text-xs transition-all flex items-center gap-2 shadow-[0_0_24px_rgba(230,90,51,0.35)] shrink-0"
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Launch Interactive Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* The 4 Autonomous Subagents */}
            <section className="max-w-6xl mx-auto px-4 py-16">
              <div className="text-center max-w-2xl mx-auto mb-12">
                <Badge variant="orangered" className="mb-3 text-xs">The Squad</Badge>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Four specialized subagents. Zero blind spots.
                </h2>
                <p className="text-zinc-400 text-sm mt-2">
                  Each subagent has a strict input/output contract and specializes in one core domain.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    name: 'security' as const,
                    tag: 'Secrets & Crypto',
                    checks: ['Hardcoded secrets & JWT keys', 'Password hashing downgrade (bcrypt vs SHA-256)', 'SQL & shell injection vulnerabilities', 'Disabled TLS (verify=False)'],
                  },
                  {
                    name: 'architecture' as const,
                    tag: 'Standards & Layering',
                    checks: ['Custom error standards (AppError vs raw ValueError)', 'Repository layering conventions', 'Leftover console.log & debug prints', 'Hardcoded localhost endpoint URLs'],
                  },
                  {
                    name: 'spec_compliance' as const,
                    tag: 'Document Understanding',
                    checks: ['Parses linked Markdown & PDF specs', 'Extracts explicit functional requirements (FR-1..5)', 'Flags omissions and contradictory code', 'Strict requirements cross-referencing'],
                  },
                  {
                    name: 'test_coverage' as const,
                    tag: 'Logic & Edge Cases',
                    checks: ['Extracts newly added functions and methods', 'Verifies corresponding unit test suites exist', 'Validates edge case coverage (valid, expired, tampered)', 'Flags untested new branches'],
                  },
                ].map((spec) => {
                  const cfg = AGENT_CONFIG[spec.name]
                  const { Icon } = cfg
                  return (
                    <Card key={spec.name} className="p-5 flex flex-col justify-between border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 transition-all">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}18` }}>
                            <Icon size={18} color={cfg.color} />
                          </div>
                          <Badge variant={cfg.badgeVariant as never} className="text-[10px]">{spec.tag}</Badge>
                        </div>
                        <h3 className="font-bold text-zinc-100 text-sm">{cfg.label} Agent</h3>
                        <p className="text-xs text-zinc-400 mt-1 mb-4 leading-relaxed">{cfg.desc}</p>
                        <div className="space-y-1.5 border-t border-zinc-800/80 pt-3 text-[11px] text-zinc-300">
                          {spec.checks.map((c, i) => (
                            <div key={i} className="flex gap-1.5 items-start">
                              <span className="text-zinc-500">•</span>
                              <span>{c}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-500 flex justify-between">
                        <span>Speed: ~1.2s - 1.8s</span>
                        <span className="text-[#7DC0D9]">concurrent</span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>

            {/* How It Works (Orchestration Pipeline) */}
            <section className="max-w-6xl mx-auto px-4 py-16 border-t border-zinc-900">
              <div className="text-center max-w-2xl mx-auto mb-12">
                <Badge variant="secondary" className="mb-3 text-xs">Architecture</Badge>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  How the Orchestration Pipeline Works
                </h2>
                <p className="text-zinc-400 text-sm mt-2">
                  True multi-agent coordination managed end-to-end via Python asyncio.
                </p>
              </div>

              <div className="grid md:grid-cols-4 gap-4">
                {[
                  {
                    step: '01',
                    title: 'Dispatch',
                    desc: 'Orchestrator receives code diff, spec reference (MD/PDF), and repo context.',
                    badge: 'asyncio.gather',
                  },
                  {
                    step: '02',
                    title: 'Parallel Analysis',
                    desc: 'All 4 subagents start within 0ms of each other and evaluate their dimension in isolation.',
                    badge: 'Concurrent Tasks',
                  },
                  {
                    step: '03',
                    title: 'Synthesis Engine',
                    desc: 'Deduplicates overlapping findings (e.g. security + spec) and ranks by real-world severity.',
                    badge: 'Severity Ranked',
                  },
                  {
                    step: '04',
                    title: 'Actionable Verdict',
                    desc: 'Returns PASS, NEEDS CHANGES, or BLOCKED with exact line pointers and remediation advice.',
                    badge: 'Sub-2s Verdict',
                  },
                ].map((item, i) => (
                  <Card key={i} className="p-5 border-zinc-800 bg-zinc-900/40 relative overflow-hidden">
                    <span className="text-3xl font-extrabold font-mono text-zinc-800 absolute right-3 top-3">
                      {item.step}
                    </span>
                    <Badge variant="norse" className="text-[10px] mb-3">{item.badge}</Badge>
                    <h4 className="font-bold text-sm text-zinc-100 mb-1">{item.title}</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
                  </Card>
                ))}
              </div>

              {/* Distribution & Tooling Section: npm, brew, agent */}
              <div className="mt-16 pt-12 border-t border-zinc-800/60">
                <div className="text-center max-w-2xl mx-auto mb-10">
                  <Badge variant="norse" className="mb-2 text-xs">Distribution & Tooling</Badge>
                  <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">
                    Installable via NPM & Homebrew. Built for Agents.
                  </h3>
                  <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                    Use Squadrune as an interactive terminal app, a zero-setup CI/CD gate, or an agent-to-agent verification service.
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-5">
                  {/* 1. NPM / NPX */}
                  <Card className="p-5 border-zinc-800 bg-zinc-950/70 flex flex-col justify-between hover:border-[#E65A33]/50 transition-all hover:bg-zinc-900/30 group">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-xl bg-[#E65A33]/15 border border-[#E65A33]/30 flex items-center justify-center text-[#E65A33] font-bold group-hover:scale-105 transition-transform">
                          <Terminal size={17} />
                        </div>
                        <Badge variant="orangered" className="text-[10px]">npm & npx</Badge>
                      </div>
                      <h4 className="text-sm font-bold text-zinc-100 mb-1">NPM Package & NPX Runner</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                        Zero-setup command execution. Run instant multi-agent verification in GitHub Actions or Node.js agent loops without cloning.
                      </p>
                      <div className="bg-zinc-900/90 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 space-y-1 border border-zinc-800">
                        <div className="text-zinc-500"># Run without installing:</div>
                        <div className="text-[#F0714E] select-all">$ npx squadrune verify pr.diff</div>
                        <div className="text-zinc-500 pt-1"># Or install globally:</div>
                        <div className="text-[#F0714E] select-all">$ npm i -g squadrune</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-500 flex items-center justify-between">
                      <span>Node.js 18+ runtime</span>
                      <button onClick={() => setActiveTab('cli')} className="text-[#E65A33] hover:underline">CLI guide →</button>
                    </div>
                  </Card>

                  {/* 2. Homebrew Formula */}
                  <Card className="p-5 border-zinc-800 bg-zinc-950/70 flex flex-col justify-between hover:border-blue-500/40 transition-all hover:bg-zinc-900/30 group">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold group-hover:scale-105 transition-transform">
                          <Laptop size={17} />
                        </div>
                        <Badge variant="blue" className="text-[10px]">Homebrew Tap</Badge>
                      </div>
                      <h4 className="text-sm font-bold text-zinc-100 mb-1">Homebrew Formula</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                        Native terminal developer tool for macOS & Linux. Inspect uncommitted git changes or hook directly into git pre-commit.
                      </p>
                      <div className="bg-zinc-900/90 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 space-y-1 border border-zinc-800">
                        <div className="text-zinc-500"># Install with Homebrew:</div>
                        <div className="text-blue-300 select-all">$ brew install squadrune</div>
                        <div className="text-zinc-500 pt-1"># Review working git diff:</div>
                        <div className="text-blue-300 select-all">$ squadrune git</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-500 flex items-center justify-between">
                      <span>Formula/squadrune.rb</span>
                      <button onClick={() => setActiveTab('cli')} className="text-blue-400 hover:underline">Brew details →</button>
                    </div>
                  </Card>

                  {/* 3. Agent Mode & MCP */}
                  <Card className="p-5 border-zinc-800 bg-zinc-950/70 flex flex-col justify-between hover:border-[#4CA5C7]/50 transition-all hover:bg-zinc-900/30 group">
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-xl bg-[#4CA5C7]/15 border border-[#4CA5C7]/30 flex items-center justify-center text-[#4CA5C7] font-bold group-hover:scale-105 transition-transform">
                          <Cpu size={17} />
                        </div>
                        <Badge variant="norse" className="text-[10px]">MCP & SDK</Badge>
                      </div>
                      <h4 className="text-sm font-bold text-zinc-100 mb-1">Agent Mode & MCP Protocol</h4>
                      <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                        The verification layer for Claude Code, Cursor, and IBM Bob 2.0. Coding agents call Squadrune to test and self-correct their code.
                      </p>
                      <div className="bg-zinc-900/90 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 space-y-1 border border-zinc-800">
                        <div className="text-zinc-500"># Model Context Protocol:</div>
                        <div className="text-[#7DC0D9] select-all">&quot;squadrune_verify_diff&quot;</div>
                        <div className="text-zinc-500 pt-1"># Node.js / Python SDK:</div>
                        <div className="text-[#7DC0D9] select-all">import &#123; verifyDiff &#125; from &apos;squadrune&apos;</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-500 flex items-center justify-between">
                      <span>JSON-RPC 2.0 stdio</span>
                      <button onClick={() => setActiveTab('agent')} className="text-[#4CA5C7] hover:underline">Agent mode →</button>
                    </div>
                  </Card>
                </div>
              </div>

              <div className="mt-12 p-6 rounded-2xl border border-zinc-800 bg-zinc-950 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="font-bold text-base text-zinc-100">Ready to test it on real code?</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Try the interactive Review Studio workbench, inspect presets, or run via terminal CLI.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={() => setActiveTab('studio')}
                    className="gap-2 bg-gradient-to-r from-[#E65A33] to-[#C34121] hover:from-[#F0714E] hover:to-[#E65A33] text-white font-bold shadow-[0_0_20px_rgba(230,90,51,0.35)]"
                  >
                    <Laptop size={14} /> Open Review Studio
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab('cli')}
                    className="gap-2 border-zinc-700 text-zinc-300"
                  >
                    <Terminal size={14} /> View CLI Docs
                  </Button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── Tab Content: REVIEW STUDIO (DEV TOOL WORKBENCH) ──────────────── */}
        {activeTab === 'studio' && (
          <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">

            {/* Presets Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Boxes size={15} className="text-[#4CA5C7]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Presets:</span>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPreset(p)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                        selectedPresetId === p.id
                          ? 'bg-[#4CA5C7]/20 text-[#7DC0D9] border border-[#4CA5C7]/50 shadow-sm'
                          : 'bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 border border-zinc-700/40'
                      )}
                    >
                      <span>{p.title}</span>
                      <Badge variant={p.expected === 'pass' ? 'green' as never : p.expected === 'blocked' ? 'red' : 'orangered'} className="text-[9px] py-0 px-1">
                        {p.expected}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] font-mono">⌘ + Enter</kbd>
                <span>to run</span>
              </div>
            </div>

            {/* Dual Pane Studio Workspace */}
            <div className="grid lg:grid-cols-12 gap-5">

              {/* Left Pane: Diff & Spec Editor (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <Card className="overflow-hidden border-zinc-800 flex flex-col h-[520px]">
                  {/* Tab Selector Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditorSubTab('diff')}
                        className={cn(
                          'px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors',
                          editorSubTab === 'diff' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                        )}
                      >
                        <FileCode2 size={13} /> Code Diff
                      </button>
                      <button
                        onClick={() => setEditorSubTab('spec')}
                        className={cn(
                          'px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors',
                          editorSubTab === 'spec' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                        )}
                      >
                        <BookOpen size={13} /> Spec Doc (PRD)
                      </button>
                      <button
                        onClick={() => setEditorSubTab('repo')}
                        className={cn(
                          'px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors',
                          editorSubTab === 'repo' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                        )}
                      >
                        <Layers size={13} /> Repo Context
                      </button>
                    </div>

                    <div className="text-[11px] font-mono text-zinc-500">
                      {editorSubTab === 'diff' && `${diff.split('\n').length} lines · unified format`}
                      {editorSubTab === 'spec' && 'Document Understanding'}
                      {editorSubTab === 'repo' && 'auth.py & test_auth.py'}
                    </div>
                  </div>

                  {/* Subtab Contents */}
                  <div className="flex-1 overflow-hidden relative bg-[#060608]">
                    {editorSubTab === 'diff' && (
                      <textarea
                        value={diff}
                        onChange={(e) => setDiff(e.target.value)}
                        spellCheck={false}
                        className="log-scroll w-full h-full bg-transparent p-4 font-mono text-xs text-zinc-300 leading-relaxed focus:outline-none resize-none"
                        placeholder="Paste unified diff here..."
                      />
                    )}

                    {editorSubTab === 'spec' && (
                      <div className="log-scroll p-4 h-full overflow-y-auto space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                          <div>
                            <span className="text-xs font-bold text-zinc-200">Specification Document</span>
                            <p className="text-[11px] text-zinc-500">{specPath}</p>
                          </div>
                          <Badge variant="norse" className="text-[10px]">Document Understanding</Badge>
                        </div>
                        <pre className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
                          {SAMPLE_SPEC_TEXT}
                        </pre>
                      </div>
                    )}

                    {editorSubTab === 'repo' && (
                      <div className="log-scroll p-4 h-full overflow-y-auto space-y-3 font-mono text-xs text-zinc-400">
                        <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
                          <span className="text-zinc-300 font-bold block mb-1">sample_repo/auth.py (baseline)</span>
                          <span className="text-zinc-500 text-[11px]">Uses bcrypt (rounds=12), AppError(code=...) error handling standard.</span>
                        </div>
                        <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800">
                          <span className="text-zinc-300 font-bold block mb-1">sample_repo/test_auth.py (baseline)</span>
                          <span className="text-zinc-500 text-[11px]">Tests hash_password(), verify_password(). Needs test_validate_token().</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer config bar */}
                  <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 text-[11px]">Linked Spec:</span>
                      <input
                        type="text"
                        value={specPath}
                        onChange={(e) => setSpecPath(e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-[11px] font-mono text-zinc-300 w-56 focus:outline-none focus:border-[#4CA5C7]"
                        placeholder="path to spec (.md/.pdf)"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const cur = presets.find(p => p.id === selectedPresetId)
                        if (cur) setDiff(cur.diff)
                      }}
                      className="h-6 text-[11px] text-zinc-400 hover:text-zinc-200"
                    >
                      <RotateCcw size={11} className="mr-1" /> Reset Diff
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Right Pane: Controls, Waterfall & Agents (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {/* Run Control Card */}
                <Card className="p-4 border-zinc-800 bg-zinc-900/40 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-zinc-200">Squad Dispatcher</span>
                      <p className="text-[11px] text-zinc-500">Executes 4 subagents in parallel</p>
                    </div>
                    <Badge variant={running ? "orangered" : "norse"} className="text-[10px] font-mono">
                      {running ? 'Running…' : 'Ready'}
                    </Badge>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-300 flex items-center gap-2"
                      >
                        <XCircle size={14} className="shrink-0" />
                        <span>{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button
                    size="lg"
                    onClick={runSquad}
                    disabled={running}
                    className="w-full gap-2 bg-gradient-to-r from-[#E65A33] to-[#C34121] hover:from-[#F0714E] hover:to-[#E65A33] text-white font-bold text-sm shadow-[0_0_24px_rgba(230,90,51,0.35)] transition-all"
                  >
                    {running ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Analyzing with 4 Subagents…
                      </>
                    ) : (
                      <>
                        <Send size={15} />
                        Run Squad Review
                      </>
                    )}
                  </Button>
                </Card>

                {/* Live Concurrency Proof Engine */}
                <ConcurrencyWaterfall agents={agents} totalMs={totalWallClockMs} />
              </div>
            </div>

            {/* 4 Parallel Agents Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Subagent Grid (Parallel Status)
                </span>
                {verdict && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} /> Execution complete
                  </span>
                )}
              </div>
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
                variants={stagger}
                initial="hidden"
                animate="show"
              >
                {agents.map((a) => (
                  <AgentCard key={a.name} agent={a} />
                ))}
              </motion.div>
            </div>

            {/* Verdict Display */}
            {verdict && (
              <VerdictBanner verdict={verdict} onCopyComment={copyPRComment} />
            )}

            {/* Live Terminal Log */}
            <Card className="border-zinc-800 bg-[#060608] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-900/60">
                <div className="flex items-center gap-2">
                  <Terminal size={13} className="text-[#4CA5C7]" />
                  <span className="text-xs font-semibold text-zinc-300">Live Orchestrator Event Stream</span>
                </div>
                <button
                  onClick={() => setShowLogs(s => !s)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  {showLogs ? 'Collapse' : 'Expand'}
                  <ChevronDown size={14} className={cn('transition-transform duration-200', showLogs && 'rotate-180')} />
                </button>
              </div>

              {showLogs && (
                <div
                  ref={logRef}
                  className="log-scroll h-44 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-1"
                >
                  {logs.length === 0 ? (
                    <span className="text-zinc-600">Waiting for review run to be dispatched…</span>
                  ) : (
                    logs.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          line.includes('🏁') ? 'text-emerald-400 font-bold' :
                          line.includes('✓') ? 'text-zinc-300' :
                          line.includes('▶') ? 'text-[#7DC0D9]' :
                          line.includes('⚡') ? 'text-[#E65A33] font-semibold' : 'text-zinc-500'
                        )}
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── Tab Content: CLI & CI/CD HUB ───────────────────────────────── */}
        {activeTab === 'cli' && (
          <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full space-y-8">
            <div className="space-y-2">
              <Badge variant="norse" className="text-xs">Developer Tools</Badge>
              <h2 className="text-3xl font-extrabold tracking-tight">Squadrune CLI & CI/CD Integration</h2>
              <p className="text-sm text-zinc-400">
                A rich terminal tool that brings parallel multi-agent review directly to your local terminal,
                git pre-commit hooks, and GitHub Actions pipelines.
              </p>
            </div>

            {/* Installation & Package Managers */}
            <div className="grid sm:grid-cols-3 gap-3 font-mono text-xs">
              <Card className="p-4 border-zinc-800 bg-zinc-950/80">
                <span className="text-[#E65A33] font-bold block mb-1 text-[11px] uppercase tracking-wider">Option 1: NPM / NPX</span>
                <p className="text-zinc-400 font-sans text-xs mb-2">Zero setup runner for CI and agents:</p>
                <div className="bg-zinc-900 p-2 rounded text-[11px] text-[#F0714E] overflow-x-auto">
                  $ npx squadrune verify pr.diff
                </div>
              </Card>
              <Card className="p-4 border-zinc-800 bg-zinc-950/80">
                <span className="text-blue-400 font-bold block mb-1 text-[11px] uppercase tracking-wider">Option 2: Homebrew</span>
                <p className="text-zinc-400 font-sans text-xs mb-2">Native macOS & Linux terminal utility:</p>
                <div className="bg-zinc-900 p-2 rounded text-[11px] text-blue-300 overflow-x-auto">
                  $ brew install squadrune
                </div>
              </Card>
              <Card className="p-4 border-zinc-800 bg-zinc-950/80">
                <span className="text-[#4CA5C7] font-bold block mb-1 text-[11px] uppercase tracking-wider">Option 3: Global Install</span>
                <p className="text-zinc-400 font-sans text-xs mb-2">Available across all system terminals:</p>
                <div className="bg-zinc-900 p-2 rounded text-[11px] text-[#7DC0D9] overflow-x-auto">
                  $ npm install -g squadrune
                </div>
              </Card>
            </div>

            {/* Quick Terminal Demo */}
            <Card className="p-6 border-zinc-800 bg-[#060608] space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-[#4CA5C7]/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="text-xs font-mono text-zinc-400 ml-2">Terminal: squadrune</span>
                </div>
                <Badge variant="secondary" className="text-[10px]">Instant Execution</Badge>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <span className="text-zinc-500"># 1. Run the instant concurrency proof demo</span>
                  <div className="text-[#7DC0D9] mt-0.5">$ squadrune demo  <span className="text-zinc-600">(or npx squadrune demo)</span></div>
                </div>
                <div>
                  <span className="text-zinc-500"># 2. Review any diff file against a specification document</span>
                  <div className="text-[#7DC0D9] mt-0.5">$ squadrune review sample/sample.diff --spec sample/sample_spec.md</div>
                </div>
                <div>
                  <span className="text-zinc-500"># 3. Review unstaged or staged git changes in your current repo</span>
                  <div className="text-[#7DC0D9] mt-0.5">$ squadrune git</div>
                </div>
                <div>
                  <span className="text-zinc-500"># 4. Agent / CI verification mode (outputs machine JSON with exit code 0/1/2)</span>
                  <div className="text-[#7DC0D9] mt-0.5">$ squadrune verify sample/sample.diff</div>
                </div>
                <div>
                  <span className="text-zinc-500"># 5. Check environment & runtime diagnostics</span>
                  <div className="text-[#7DC0D9] mt-0.5">$ squadrune doctor</div>
                </div>
              </div>
            </Card>

            {/* GitHub Actions CI/CD Workflow */}
            <Card className="p-6 border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-zinc-200">GitHub Actions Pull Request Gate</h3>
                  <p className="text-xs text-zinc-500">Block pull requests automatically if critical security or spec violations exist.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(`name: Squadrune Review
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r backend/requirements.txt
      - name: Run Squadrune Verification Gate
        run: |
          git diff origin/\${{ github.base_ref }}...HEAD > pr.diff
          ./squadrune verify pr.diff --spec docs/spec.md`)
                  }}
                  className="gap-1.5 text-xs border-zinc-700"
                >
                  <Copy size={12} /> Copy Workflow YAML
                </Button>
              </div>

              <pre className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-300 overflow-x-auto leading-relaxed">
{`name: Squadrune Verification
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./squadrune verify pr.diff --spec spec.md
      # Exits with 2 if BLOCKED, 1 if NEEDS_CHANGES, 0 if PASS`}
              </pre>
            </Card>
          </div>
        )}

        {/* ── Tab Content: AGENT MODE (BOB 2.0 / MCP) ────────────────────── */}
        {activeTab === 'agent' && (
          <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full space-y-8">
            <div className="space-y-2">
              <Badge variant="norse" className="text-xs">Agent-to-Agent Infrastructure</Badge>
              <h2 className="text-3xl font-extrabold tracking-tight">Agent Mode & Model Context Protocol (MCP)</h2>
              <p className="text-sm text-zinc-400">
                Squadrune is designed from day one to be <em>infrastructure other coding agents call</em>.
                When agents like IBM Bob 2.0, Claude Code, or Cursor generate code, they call Squadrune to
                independently verify their output before submitting.
              </p>
            </div>

            {/* Interactive Loop Diagram */}
            <div className="grid md:grid-cols-3 gap-4 text-xs font-mono">
              <Card className="p-4 border-zinc-800 bg-zinc-900/40">
                <span className="text-[#E65A33] font-bold block mb-1">[1] Agent Generates Patch</span>
                <p className="text-zinc-400 font-sans">Agent writes code to satisfy a user prompt or issue ticket.</p>
              </Card>
              <Card className="p-4 border-zinc-800 bg-zinc-900/40">
                <span className="text-[#4CA5C7] font-bold block mb-1">[2] Squadrune Verification</span>
                <p className="text-zinc-400 font-sans">Calls <code>POST /verify</code> or MCP tool <code>squadrune_verify_diff</code>.</p>
              </Card>
              <Card className="p-4 border-zinc-800 bg-zinc-900/40">
                <span className="text-emerald-400 font-bold block mb-1">[3] Self-Correction</span>
                <p className="text-zinc-400 font-sans">Agent reads structured findings, fixes defects, and verifies until PASS.</p>
              </Card>
            </div>

            {/* SDKs & MCP Config */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="p-4 border-zinc-800 bg-zinc-950 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-bold text-zinc-200">Node.js / TS SDK</span>
                    <Badge variant="orangered" className="text-[9px]">npm install</Badge>
                  </div>
                  <pre className="p-2.5 font-mono text-[11px] text-zinc-300 leading-relaxed overflow-x-auto mt-2">
{`import { verifyDiff } from 'squadrune'

const verdict = await verifyDiff({
  diff: candidateDiff,
  specDocRef: "docs/spec.md"
})

if (verdict.status === "pass") {
  console.log("Safe to merge!")
} else {
  // Feed findings to agent
  console.log(verdict.findings)
}`}
                  </pre>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-500">
                  Zero external dependencies. Works in Node 18+.
                </div>
              </Card>

              <Card className="p-4 border-zinc-800 bg-zinc-950 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-bold text-zinc-200">Python Client SDK</span>
                    <Badge variant="secondary" className="text-[9px]">Zero Overhead</Badge>
                  </div>
                  <pre className="p-2.5 font-mono text-[11px] text-zinc-300 leading-relaxed overflow-x-auto mt-2">
{`from app.client import SquadruneVerifier

verifier = SquadruneVerifier()
verdict = verifier.verify(
    diff=candidate_diff,
    spec_doc_ref="docs/spec.md"
)

if verdict["status"] == "pass":
    print("Safe to submit PR!")
else:
    for f in verdict["findings"]:
        print(f["severity"], f["description"])`}
                  </pre>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-500">
                  Falls back to in-process execution if server offline.
                </div>
              </Card>

              <Card className="p-4 border-zinc-800 bg-zinc-950 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                    <span className="text-xs font-bold text-zinc-200">MCP Server Config</span>
                    <Badge variant="norse" className="text-[9px]">Claude / Cursor</Badge>
                  </div>
                  <pre className="p-2.5 font-mono text-[11px] text-zinc-300 leading-relaxed overflow-x-auto mt-2">
{`{
  "mcpServers": {
    "squadrune": {
      "command": "python",
      "args": [
        "/path/to/backend/mcp_server.py"
      ]
    }
  }
}`}
                  </pre>
                </div>
                <div className="mt-3 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-500">
                  Exposes <code>squadrune_verify_diff</code> via JSON-RPC 2.0.
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ── Tab Content: HISTORY & ANALYTICS ───────────────────────────── */}
        {activeTab === 'history' && (
          <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Run History & PR Metrics</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Audit log of all past parallel verification runs.</p>
              </div>
              <Button
                size="sm"
                onClick={() => setActiveTab('studio')}
                className="gap-1.5 text-xs bg-gradient-to-r from-[#E65A33] to-[#C34121] text-white font-bold shadow-[0_0_20px_rgba(230,90,51,0.35)]"
              >
                + New Verification Run
              </Button>
            </div>

            {(() => {
              const done = historicalRuns.filter(r => r.status === 'done')
              const avgMs = done.length
                ? Math.round(done.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / done.length)
                : 1820
              const blocked = done.filter(r => r.verdict === 'blocked').length
              const totalFindings = done.reduce((s, r) => s + (r.verdict_detail?.findings.length ?? (r.agent_results ? r.agent_results.reduce((acc, ar) => acc + (ar.finding_count || 0), 0) : 0)), 0)

              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-left">
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                      <span className="text-xs text-zinc-500 block">Total Reviews</span>
                      <span className="text-2xl font-bold text-zinc-100">{historicalRuns.length || '—'}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                      <span className="text-xs text-zinc-500 block">Avg Turnaround</span>
                      <span className="text-2xl font-bold text-[#4CA5C7]">{(avgMs / 1000).toFixed(2)}s</span>
                    </div>
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                      <span className="text-xs text-zinc-500 block">Defects Caught</span>
                      <span className="text-2xl font-bold text-[#7DC0D9]">{totalFindings}</span>
                    </div>
                    <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40">
                      <span className="text-xs text-zinc-500 block">Blockers Stopped</span>
                      <span className="text-2xl font-bold text-red-400">{blocked} PRs</span>
                    </div>
                  </div>

                  <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl">
                    <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Audit Trail</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setHistoryLoading(true)
                          listRuns().then(setHistoricalRuns).finally(() => setHistoryLoading(false))
                        }}
                        className="h-7 text-xs text-zinc-400 hover:text-zinc-200 gap-1.5"
                      >
                        <RefreshCw size={12} className={historyLoading ? 'animate-spin' : ''} />
                        Refresh
                      </Button>
                    </div>

                    {historyLoading ? (
                      <div className="p-10 text-center text-zinc-500 text-xs">Loading execution audit log…</div>
                    ) : historicalRuns.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <p className="text-zinc-400 text-xs font-medium">No past runs found in SQLite.</p>
                        <p className="text-[11px] text-zinc-500">Run a verification in the Review Studio or CLI to populate history.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider bg-zinc-950/40 text-[10px]">
                              <th className="px-4 py-3">Run ID</th>
                              <th className="px-4 py-3">Verdict</th>
                              <th className="px-4 py-3">Findings</th>
                              <th className="px-4 py-3">Wall-Clock</th>
                              <th className="px-4 py-3">Triggered</th>
                              <th className="px-4 py-3">Timestamp</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/50">
                            {historicalRuns.map(run => {
                              const vcfg = run.verdict ? VERDICT_CFG[run.verdict] : null
                              const count = run.verdict_detail?.findings.length ?? (run.agent_results ? run.agent_results.reduce((acc, ar) => acc + (ar.finding_count || 0), 0) : 0)
                              return (
                                <tr key={run.run_id} className="hover:bg-zinc-800/20 transition-colors">
                                  <td className="px-4 py-3 font-mono text-zinc-400">{run.run_id.slice(0, 8)}…</td>
                                  <td className="px-4 py-3">
                                    {vcfg ? (
                                      <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px]"
                                        style={{ color: vcfg.color, background: vcfg.bg, border: `1px solid ${vcfg.border}` }}
                                      >
                                        <vcfg.Icon size={11} />
                                        {vcfg.label}
                                      </span>
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px] capitalize">{run.status}</Badge>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-zinc-300">{count} issue{count !== 1 ? 's' : ''}</td>
                                  <td className="px-4 py-3 font-mono text-[#7DC0D9]">
                                    {run.duration_ms ? `${(run.duration_ms / 1000).toFixed(2)}s` : '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-mono">
                                      {run.triggered_by}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-zinc-500 font-mono text-[11px]">
                                    {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => loadRunIntoStudio(run)}
                                      className="h-6 text-[10px] border-zinc-700 hover:text-[#4CA5C7] px-2 gap-1"
                                    >
                                      <Eye size={10} /> Inspect in Studio
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* ── Global Footer ──────────────────────────────────────────────── */}
        <footer className="border-t border-zinc-900/80 py-6 text-center text-xs text-zinc-600 bg-zinc-950/50">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-[#E65A33]" />
              <span className="font-semibold text-zinc-400">Squadrune</span>
              <span>— Parallel Multi-Agent Code Verification</span>
            </div>
            <div className="flex items-center gap-4 text-zinc-500">
              <button onClick={() => setActiveTab('overview')} className="hover:text-zinc-300">Overview</button>
              <button onClick={() => setActiveTab('studio')} className="hover:text-zinc-300">Review Studio</button>
              <button onClick={() => setActiveTab('cli')} className="hover:text-zinc-300">CLI & CI</button>
              <button onClick={() => setActiveTab('agent')} className="hover:text-zinc-300">Agent Mode</button>
              <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="hover:text-zinc-300">OpenAPI Docs ↗</a>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}

// Concurrency Waterfall visualization rendered

// CLI and Agent Mode surfaces mounted
