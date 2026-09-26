"""
orchestrator.py — Core orchestration logic.

run_squad() is the central coroutine:
  1. Creates a Run record in the DB
  2. Dispatches all four subagents via asyncio.gather (PARALLEL)
  3. Saves each SubagentResult to the DB
  4. Calls synthesis agent to produce a Verdict
  5. Updates the Run record with the verdict
  6. Broadcasts events via event_bus

This is the "Agent Mode" piece: a multi-step async orchestration,
not a single LLM call.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlmodel import Session

from app import event_bus
from app.agents import architecture, security, spec_compliance, synthesis, test_coverage
from app.database import engine
from app.models.run import Run, SubagentResult
from app.models.verdict import Verdict

logger = logging.getLogger("squadrune")


async def run_squad(
    run_id: str,
    diff: str,
    spec_doc_ref: str | None,
    repo_files: list[str] | None,
) -> Verdict:
    """
    Orchestrate all four subagents in parallel and synthesize results.

    All four agents are dispatched simultaneously via asyncio.gather —
    the timestamp logs will show overlapping start/end times proving
    true concurrent execution.
    """
    overall_started = datetime.now(timezone.utc)
    logger.info(f"[orchestrator] RUN {run_id} STARTED at {overall_started.isoformat()}")

    # ── Mark run as running ──────────────────────────────────────────────────
    _update_run_status(run_id, "running")
    await event_bus.publish(run_id, "run_started", {"run_id": run_id})

    # ── Broadcast that all agents are starting ───────────────────────────────
    for name in ["security", "architecture", "spec_compliance", "test_coverage"]:
        await event_bus.publish(run_id, "subagent_started", {"agent": name, "timestamp": overall_started.isoformat()})

    # ── Dispatch all four agents CONCURRENTLY ────────────────────────────────
    # asyncio.gather runs all coroutines as concurrent tasks.
    # return_exceptions=True means a failing agent doesn't abort the others.
    tasks = [
        security.analyze(run_id=run_id, diff=diff),
        architecture.analyze(run_id=run_id, diff=diff, repo_files=repo_files),
        spec_compliance.analyze(run_id=run_id, diff=diff, spec_doc_ref=spec_doc_ref),
        test_coverage.analyze(run_id=run_id, diff=diff, repo_files=repo_files),
    ]

    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    # ── Process results — keep as plain detached objects (no session) ────────
    subagent_results: list[SubagentResult] = []

    for raw in raw_results:
        if isinstance(raw, BaseException):
            logger.error(f"[orchestrator] Subagent raised exception: {raw}")
            failed = SubagentResult(
                run_id=run_id,
                agent_name="unknown",
                status="failed",
                error=str(raw),
            )
            subagent_results.append(failed)
        else:
            result: SubagentResult = raw
            subagent_results.append(result)
            findings_data = [f.model_dump() for f in result.get_findings()]
            await event_bus.publish(
                run_id,
                "subagent_done",
                {
                    "agent": result.agent_name,
                    "severity": result.severity,
                    "finding_count": len(findings_data),
                    "duration_ms": result.duration_ms,
                    "started_at": result.started_at.isoformat() if result.started_at else None,
                    "completed_at": result.completed_at.isoformat() if result.completed_at else None,
                    "findings": findings_data,
                },
            )

    # ── Synthesis first, then save (avoids DetachedInstanceError) ────────────
    await event_bus.publish(run_id, "synthesis_started", {})
    verdict = await synthesis.synthesize(subagent_results, overall_started)

    # ── Save subagent results to DB after synthesis is done ──────────────────
    _save_subagent_results(subagent_results)
    await event_bus.publish(run_id, "verdict_ready", verdict.model_dump())

    # ── Update run record ────────────────────────────────────────────────────
    _finalize_run(run_id, verdict, overall_started)

    await event_bus.publish_done(run_id)

    logger.info(
        f"[orchestrator] RUN {run_id} COMPLETE — verdict={verdict.status} "
        f"duration={verdict.duration_ms}ms"
    )
    return verdict


# ─────────────────────────────────────────────
# DB helpers — keep orchestrator logic clean
# ─────────────────────────────────────────────

def _update_run_status(run_id: str, status: str) -> None:
    with Session(engine) as session:
        run = session.get(Run, run_id)
        if run:
            run.status = status
            session.add(run)
            session.commit()


def _save_subagent_results(results: list[SubagentResult]) -> None:
    with Session(engine) as session:
        for r in results:
            session.add(r)
        session.commit()


def _finalize_run(run_id: str, verdict: Verdict, started: datetime) -> None:
    ended = datetime.now(timezone.utc)
    duration_ms = int((ended - started).total_seconds() * 1000)
    with Session(engine) as session:
        run = session.get(Run, run_id)
        if run:
            run.status = "done"
            run.verdict = verdict.status
            run.verdict_summary = verdict.summary
            run.verdict_json = verdict.model_dump_json()
            run.completed_at = ended
            run.duration_ms = duration_ms
            session.add(run)
            session.commit()
