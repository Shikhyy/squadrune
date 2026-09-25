# Squadrune — Tech Stack

Chosen for maximum build speed in a hackathon window without looking like a hackathon project.

## Frontend

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router, TypeScript)** | Fast dev loop, easy deploy, server + client components as needed |
| Styling | **Tailwind CSS** | Speed without sacrificing a designed look |
| Components | **shadcn/ui** (Radix primitives underneath) | Beautiful, accessible defaults you customize instead of building from scratch — this is the single highest-leverage choice for making the UI look premium fast |
| Animation | **Framer Motion** | Agent Cards pulsing while "thinking," smooth status transitions, verdict banner reveal — small touches that make the live-run view feel alive instead of static |
| Charts | **Recharts** | Time-saved / issues-caught analytics on the History view |
| Icons | **lucide-react** | Consistent icon set, pairs natively with shadcn/ui |
| Live updates | **native WebSocket** (or Socket.IO if reconnect handling is needed) | Streaming subagent status to the Live Run view |
| State | **Zustand** | Lightweight, no boilerplate — avoid Redux overhead for a hackathon timeline |
| Fonts | **Geist** (Vercel's font, free via next/font) or **Inter** | Clean, modern, zero extra setup |

## Backend

| Layer | Choice | Why |
|---|---|---|
| Framework | **Python FastAPI** | Async-native (critical for parallel subagent dispatch), auto-generated OpenAPI docs — useful since external agents need to integrate with `/verify` |
| Orchestration | Plain **asyncio.gather** for the MVP | A full agent framework (LangGraph, CrewAI) adds setup overhead you don't have time for; hand-rolled parallel dispatch is simpler to demo and debug live |
| Schema/validation | **Pydantic v2** | Type-safe request/response contracts between orchestrator, subagents, and the API — also what makes agent-to-agent integration clean |
| Database | **SQLite via SQLModel** | Zero setup, upgrade path to Postgres later if the project continues past the hackathon |
| Document parsing | **pdfplumber** (PDFs) + plain markdown parsing (specs in `.md`) | The "document understanding" subagent's core dependency |
| Real-time | **FastAPI WebSocket support** (native) | No extra server needed for the live dashboard stream |
| LLM calls | Whatever model access the hackathon provides for Bob 2.0 / Claude API | Each subagent is a scoped, single-purpose prompt — not a general chat loop |

## Dev Tooling

- **Bob 2.0** used throughout the build itself — scaffolding, focused implementation passes, and code review mode on the orchestrator logic (name specific moments in your submission writeup)
- **Git worktrees** for isolated verification if you extend Test Coverage subagent to actually run tests, not just infer coverage gaps statically

## Deployment (only if time allows)

- Frontend: Vercel (one-command deploy from Next.js)
- Backend: Fly.io or Render (FastAPI deploys cleanly to both)
- If time is tight: **run everything locally and demo via screen recording** — a working local demo beats a half-deployed broken one every time
