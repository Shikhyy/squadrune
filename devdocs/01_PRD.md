# Squadrune — Product Requirements Document

## 1. Problem

Developer workflows — especially code review — are bottlenecked by a single fact: **one human can only check one dimension of a change at a time.** A reviewer glances at style, maybe skims for bugs, and rarely has bandwidth to also verify the change against the original spec, check it against patterns used elsewhere in the codebase, and confirm test coverage — all in one pass.

The result:
- PRs sit in a queue for hours waiting on a single reviewer
- Review quality is inconsistent — depends entirely on who happens to pick it up
- Issues that don't get caught the first time come back as a second (or third) review round — pure rework
- AI coding agents have the same blind spot: they generate a change, claim it's "done," and nothing structurally verifies that claim across multiple dimensions before a human trusts it

This is a workflow with measurably high time cost (review wait), high error cost (missed cross-cutting issues), and high rework cost (multi-round reviews) — exactly the kind of problem the brief asks us to target.

## 2. Vision

Squadrune is a **parallel multi-agent verification layer** for developer workflows. Instead of one reviewer (human or AI) checking everything sequentially, Squadrune's orchestrator dispatches a squad of specialized subagents that each check one dimension **simultaneously**, then synthesizes their findings into one clear, prioritized verdict.

It serves two audiences from day one:
- **Developers**, via a live dashboard that shows the squad working in real time and a clear final verdict
- **AI coding agents** (including IBM Bob 2.0), via a documented API/MCP endpoint they can call mid-workflow to get an independent, multi-dimensional check on their own output before declaring a task complete

## 3. Target Users

| User | Need |
|---|---|
| Developer opening a PR | Fast, consistent, multi-dimensional review without waiting on a human queue |
| Engineering lead | Visibility into what's actually being caught, and proof it's saving time |
| Coding agent (Bob 2.0, or any agent) | A way to self-verify its own generated changes before reporting success, catching what its own limited context window missed |

## 4. MVP Scope (hackathon build)

**In scope:**
- One workflow: **code review**
- Orchestrator + 3–4 parallel subagents (Security, Architecture Consistency, Spec Compliance, Test Coverage)
- Document understanding: parses a linked spec/ticket (markdown or PDF) for the Spec Compliance subagent
- Live dashboard showing squad activity and final verdict
- Agent-facing `/verify` API endpoint any external agent can call

**Explicitly out of scope for MVP** (mention as roadmap, don't attempt to build):
- Additional workflow squads (debugging, onboarding, release) — architecture should allow adding these later, but only Code Review ships in the demo
- Multi-repo / multi-tenant support
- Auth beyond a simple API key
- Auto-fix / auto-commit (Squadrune verifies and reports; it does not modify code)

## 5. Success Metrics (what the demo proves)

- **Time**: review turnaround from "PR opened" to "verdict available" — target under 2 minutes, vs. hours for a typical human review queue
- **Coverage**: number of issue dimensions checked per pass — 4 (security, architecture, spec, tests) vs. typically 1 in a rushed human pass
- **Rework reduction**: issues caught before merge that would otherwise surface in a second review round or in production

## 6. Key Differentiator

Squadrune isn't "AI reviews your code" — every hackathon has one of those. It's positioned as **infrastructure other agents call**, which is the direct answer to a brief that explicitly asks for agent mode, parallel tasks, subagents, and document understanding managing multiple steps — not just code generation.
