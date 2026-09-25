# Squadrune — Frontend Guidelines

## Design Philosophy

"Mission control for your codebase." The live-run view should feel like watching a squad of specialists actively working — not a spinner, not a static form. This is the single biggest lever for judge impression: a beautiful, alive dashboard sells the "multi-agent" story visually in the first three seconds, before anyone reads a word.

## Visual Direction

- **Dark base theme** (`#0A0A0B` background, not pure black) — reads as a technical/dev tool, not a consumer app
- **One accent color per subagent**, used consistently everywhere that agent appears (card border, status dot, log text):
  - Security → amber/orange (`#F59E0B`)
  - Architecture → blue (`#3B82F6`)
  - Spec Compliance → purple (`#A855F7`)
  - Test Coverage → green (`#10B981`)
- **Neutral grays** (Tailwind's `zinc` scale) for structure/chrome so the accent colors pop precisely where meaning lives
- **Monospace font** (`JetBrains Mono` or `Geist Mono`) for diff snippets, logs, and verdict details — pairs with a clean sans-serif (`Inter`/`Geist`) for UI chrome

## Core Components (build these, reuse everywhere)

1. **Agent Card** — one per subagent. States: `idle` (dim), `running` (pulsing border animation via Framer Motion, live log lines streaming in), `done` (settles to solid accent color, shows a count of findings), `flagged` (subtle red glow if it found something severity-high)
2. **Verdict Banner** — full-width, appears once synthesis completes. Large status word (PASS / NEEDS CHANGES / BLOCKED), color-coded, with a one-line summary and expandable findings list grouped by severity
3. **Live Log Stream** — scrolling, auto-scroll-to-bottom terminal-style feed showing raw subagent output as it streams over the WebSocket — this is what makes "parallel" visually obvious, since all four streams update independently and simultaneously
4. **Impact Stat Cards** (History view) — big numbers with small trend indicators: avg. turnaround time, total issues caught, estimated review rounds saved

## Motion Guidelines

- Agent Cards: subtle scale + border-glow pulse while `running` (Framer Motion `animate` with a looping `repeat: Infinity` on opacity/scale, kept subtle — this should read as "working," not distracting)
- Verdict Banner: slide-up + fade-in on completion, not an abrupt pop
- Keep all transitions under 300ms — snappy reads as competent tooling, slow reads as sluggish

## Layout

- **Live Run view**: 2x2 grid of Agent Cards on desktop (stack vertically on mobile), Verdict Banner appears below once ready, Live Log Stream in a collapsible panel
- **History view**: table/list of past runs + Impact Stat Cards at the top
- Keep the whole UI to 3–4 screens max — depth kills a hackathon demo; breadth of features shown clearly beats a deep app nobody has time to click through

## Accessibility

- Every color-coded status also has a text label and icon (not color alone) — `lucide-react`'s `ShieldCheck`, `GitBranch`, `FileText`, `TestTube` map naturally to the four subagents
- Sufficient contrast on the dark theme — shadcn/ui's defaults already handle this well, don't override without checking
