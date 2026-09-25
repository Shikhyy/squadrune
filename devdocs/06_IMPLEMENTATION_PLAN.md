# Squadrune — Implementation Plan

Scoped for a solo build in a few remaining hours. Order matters — each phase produces something demoable on its own, so if time runs out, you stop at a working checkpoint instead of a half-built pile.

## Phase 0 — Demo Scenario (25 min)

Before writing code: pick one sample repo, craft one PR diff, and write one spec doc (`.md` is fine, skip PDF for the demo unless trivial) that deliberately has:
- A requirement the diff doesn't fully satisfy
- A new code branch with no corresponding test
- A minor security smell (e.g., a hardcoded value that should be an env var)

This is the single highest-leverage 25 minutes in the whole build — it's what makes the final demo's "4 issues caught in under 2 minutes" claim honest and vivid instead of hand-wavy.

## Phase 1 — Backend Core (90 min)

1. FastAPI skeleton: `/runs` POST, `/runs/{id}` GET, in-memory or SQLite storage
2. Implement the four subagents as separate async functions, each a single scoped LLM call with a tight prompt — don't overengineer, a well-written prompt beats a complex pipeline here
3. Wire `asyncio.gather` in the orchestrator — verify with a quick script that all four genuinely run concurrently (log timestamps to confirm overlap, not sequential execution — this is worth actually checking, not assuming)
4. Synthesis agent: one more LLM call that takes all four raw results and returns a single ranked verdict

**Checkpoint**: at this point, a CLI script hitting the orchestrator directly and printing the verdict to console is already a demoable prototype if everything after this runs out of time.

## Phase 2 — Agent-Facing API (30 min)

1. Add `/verify` as a synchronous wrapper around the same orchestrator
2. Write a 5-line example script showing an "external agent" calling `/verify` and parsing the JSON response — this concretely proves the "agent-focused" positioning, don't just claim it

## Phase 3 — Dashboard (90–120 min, cut first if time is short)

1. Next.js app, shadcn/ui installed, dark theme set up
2. Static version of the four Agent Cards + Verdict Banner first (hardcoded data) — get the look right before wiring real data, since visual polish is what a judge notices in the first 10 seconds
3. WebSocket connection to `/runs/{id}/stream`, wire live status updates into the cards
4. History view with the Impact Stat Cards (even 2–3 past runs of dummy data is enough to make the analytics view feel real)

## Phase 4 — Demo + Submission (30 min)

1. Run the full flow live on your Phase 0 scenario, screen-record it
2. On screen or in voiceover, state the numbers explicitly: turnaround time, issues caught, dimensions checked in parallel
3. In the written submission, map each brief requirement (agent mode, parallel tasks, subagents, document understanding) to the specific part of Squadrune that satisfies it — don't make judges hunt for the connection
4. Name specific moments Bob 2.0 helped during the build, not generic praise

## If You're Genuinely Short on Time

Cut in this order: dashboard polish → dashboard entirely (demo via CLI + terminal output with `rich` formatting instead) → Architecture subagent (keep Security, Spec Compliance, Test Coverage — 3 is still "parallel subagents," just not 4). Never cut Phase 0 or the `/verify` agent-facing endpoint — those two are what make this submission distinct from a generic review bot.
