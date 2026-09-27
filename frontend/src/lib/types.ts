// Shared TypeScript types matching the backend Pydantic models

export type AgentName = 'security' | 'architecture' | 'spec_compliance' | 'test_coverage'

export type Severity = 'high' | 'medium' | 'low' | 'none'

export type AgentStatus = 'idle' | 'running' | 'done' | 'failed'

export type VerdictStatus = 'pass' | 'needs_changes' | 'blocked'

export interface Finding {
  description: string
  severity: Severity
  file_ref?: string
  line_ref?: number
  agent?: string
  remediation?: string
}

export interface Verdict {
  status: VerdictStatus
  summary: string
  findings: Finding[]
  findings_by_severity?: Record<Severity, Finding[]>
  agents_completed: string[]
  agents_failed: string[]
  duration_ms?: number
}

export interface AgentState {
  name: AgentName
  status: AgentStatus
  severity: Severity
  finding_count: number
  durationMs?: number
  startedAt?: string
  completedAt?: string
  offsetMs?: number
}

export interface RunStatus {
  run_id: string
  status: string
  verdict?: VerdictStatus
  verdict_summary?: string
  verdict_detail?: Verdict
  created_at: string
  completed_at?: string
  duration_ms?: number
  triggered_by: string
  agent_results?: Array<{
    agent: string
    status: string
    severity: Severity
    duration_ms: number
    started_at?: string
    completed_at?: string
    findings?: Finding[]
    finding_count?: number
    error?: string
  }>
  diff_text?: string | null
  spec_doc_ref?: string | null
}

export interface ReviewPreset {
  id: string
  title: string
  badge: string
  expected: VerdictStatus
  specPath: string
  diff: string
  description?: string
}

// WebSocket event shapes
export type WsEvent =
  | { type: 'run_started';      data: { run_id: string } }
  | { type: 'subagent_started'; data: { agent: AgentName; timestamp?: string } }
  | { type: 'subagent_done';    data: { agent: AgentName; severity: Severity; finding_count: number; duration_ms: number; started_at?: string; completed_at?: string; findings?: Finding[] } }
  | { type: 'synthesis_started'; data: Record<string, never> }
  | { type: 'verdict_ready';    data: Verdict }
  | { type: 'run_complete';     data: Record<string, never> }

// Agent display metadata
export const AGENT_META: Record<AgentName, { label: string; color: string; icon: string; desc: string; description: string }> = {
  security: {
    label: 'Security',
    color: '#E65A33',
    icon: 'ShieldCheck',
    desc: 'Hardcoded secrets, weak crypto (bcrypt vs SHA-256), injection risks',
    description: 'Hardcoded secrets, weak crypto (bcrypt vs SHA-256), injection risks',
  },
  architecture: {
    label: 'Architecture',
    color: '#4CA5C7',
    icon: 'GitBranch',
    desc: 'Naming, error handling hierarchy (AppError), layering conventions',
    description: 'Naming, error handling hierarchy (AppError), layering conventions',
  },
  spec_compliance: {
    label: 'Spec Compliance',
    color: '#7DC0D9',
    icon: 'FileText',
    desc: 'Document understanding: verifies requirements from Markdown/PDF specs',
    description: 'Document understanding: verifies requirements from Markdown/PDF specs',
  },
  test_coverage: {
    label: 'Test Coverage',
    color: '#10B981',
    icon: 'TestTube',
    desc: 'Detects untested new functions, logic paths, and missing test files',
    description: 'Detects untested new functions, logic paths, and missing test files',
  },
}
