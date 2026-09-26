#!/usr/bin/env python3
"""
demo_cli.py — Squadrune CLI Demo

Runs the full parallel subagent pipeline against the sample scenario
and prints a rich terminal output with timestamp proof that all four
agents ran CONCURRENTLY (overlapping start/end times).

Usage:
    cd squadrune/backend
    cp .env.example .env       # optionally add a real API key
    pip install -r requirements.txt
    python demo_cli.py

No running server required — calls the orchestrator directly.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Ensure the backend app package is importable ──────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

# After env is loaded, import app modules
from app.database import create_db_and_tables
from app.models.run import Run, SubagentResult
from app.models.verdict import Verdict
from sqlmodel import Session
from app.database import engine

# ─────────────────────────────────────────────
# Configure logging to show timestamps clearly
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d  %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("squadrune")

# ─────────────────────────────────────────────
# Rich — graceful fallback if not installed
# ─────────────────────────────────────────────
try:
    from rich.console import Console
    from rich.table import Table
    from rich import box
    from rich.panel import Panel
    from rich.text import Text
    RICH = True
    console = Console()
except ImportError:
    RICH = False
    console = None  # type: ignore


SAMPLE_DIR = Path(__file__).parent.parent / "sample"
DIFF_FILE = SAMPLE_DIR / "sample.diff"
SPEC_FILE = SAMPLE_DIR / "sample_spec.md"

SEVERITY_COLOR = {
    "high":   "red",
    "medium": "yellow",
    "low":    "cyan",
    "none":   "green",
}

AGENT_COLOR = {
    "security":       "yellow",
    "architecture":   "blue",
    "spec_compliance": "magenta",
    "test_coverage":  "green",
    "synthesis":      "white",
}


# ─────────────────────────────────────────────
# Instrumented agents — wrap each agent's analyze()
# to capture exact wall-clock start/end times
# ─────────────────────────────────────────────

_timing_log: list[dict] = []  # populated during the run

import app.agents.security as _sec
import app.agents.architecture as _arch
import app.agents.spec_compliance as _spec
import app.agents.test_coverage as _test


async def _timed(name: str, coro) -> SubagentResult:
    wall_start = datetime.now(timezone.utc)
    result = await coro
    wall_end = datetime.now(timezone.utc)
    _timing_log.append({
        "agent": name,
        "start": wall_start,
        "end": wall_end,
        "duration_ms": int((wall_end - wall_start).total_seconds() * 1000),
        "findings": len(result.get_findings()),
        "severity": result.severity,
    })
    return result


# ─────────────────────────────────────────────
# Main demo flow
# ─────────────────────────────────────────────

async def run_demo() -> None:
    create_db_and_tables()

    if not DIFF_FILE.exists():
        print(f"ERROR: sample diff not found at {DIFF_FILE}")
        sys.exit(1)

    diff = DIFF_FILE.read_text()
    spec_doc_ref = str(SPEC_FILE)

    if RICH:
        console.rule("[bold cyan]Squadrune Demo[/bold cyan]")
        console.print(f"\n[dim]Diff:[/dim] {DIFF_FILE}")
        console.print(f"[dim]Spec:[/dim] {SPEC_FILE}\n")
        from app.agents.base import MOCK_MODE
        mode_str = "[yellow]MOCK MODE[/yellow]" if MOCK_MODE else "[green]LLM MODE[/green]"
        console.print(f"Agent mode: {mode_str}\n")
    else:
        print("=" * 60)
        print("Squadrune Demo")
        print("=" * 60)
        print(f"Diff: {DIFF_FILE}")
        print(f"Spec: {SPEC_FILE}\n")

    # Create a demo run record
    run = Run(
        diff_text=diff,
        spec_doc_ref=spec_doc_ref,
        triggered_by="cli_demo",
        status="queued",
    )
    with Session(engine) as session:
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

    print(f"Run ID: {run_id}\n")

    # ── Dispatch all four agents CONCURRENTLY ────────────────────────────────
    wall_overall_start = datetime.now(timezone.utc)
    print("Dispatching all 4 agents via asyncio.gather ...\n")

    tasks = [
        _timed("security",        _sec.analyze(run_id=run_id, diff=diff)),
        _timed("architecture",    _arch.analyze(run_id=run_id, diff=diff)),
        _timed("spec_compliance", _spec.analyze(run_id=run_id, diff=diff, spec_doc_ref=spec_doc_ref)),
        _timed("test_coverage",   _test.analyze(run_id=run_id, diff=diff)),
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)
    wall_overall_end = datetime.now(timezone.utc)

    # Filter out any exceptions (shouldn't happen in mock mode)
    subagent_results = [r for r in results if isinstance(r, SubagentResult)]

    # ── CONCURRENCY PROOF TABLE ──────────────────────────────────────────────
    _print_timing_table(wall_overall_start, wall_overall_end)

    # ── Synthesis ────────────────────────────────────────────────────────────
    from app.agents.synthesis import synthesize
    verdict = await synthesize(subagent_results, wall_overall_start)

    # ── Verdict Output ───────────────────────────────────────────────────────
    _print_verdict(verdict)

    # ── Save results ─────────────────────────────────────────────────────────
    from app.orchestrator import _save_subagent_results, _finalize_run
    _save_subagent_results(subagent_results)
    _finalize_run(run_id, verdict, wall_overall_start)

    print(f"\nRun saved to DB. Retrieve with: GET /runs/{run_id}")


def _print_timing_table(overall_start: datetime, overall_end: datetime) -> None:
    total_ms = int((overall_end - overall_start).total_seconds() * 1000)
    t0 = overall_start  # reference point for offset calculations

    if RICH:
        console.rule("[bold]Concurrency Proof — Agent Timing[/bold]")
        table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
        table.add_column("Agent",        style="bold", width=20)
        table.add_column("Start (UTC)",  width=28)
        table.add_column("End (UTC)",    width=28)
        table.add_column("Duration",     justify="right", width=10)
        table.add_column("Offset @start", justify="right", width=13)
        table.add_column("Findings",     justify="right", width=9)
        table.add_column("Max severity", width=10)

        for entry in sorted(_timing_log, key=lambda x: x["start"]):
            offset_ms = int((entry["start"] - t0).total_seconds() * 1000)
            color = AGENT_COLOR.get(entry["agent"], "white")
            sev_color = SEVERITY_COLOR.get(entry["severity"], "white")
            table.add_row(
                f"[{color}]{entry['agent']}[/{color}]",
                entry["start"].strftime("%H:%M:%S.%f")[:-3],
                entry["end"].strftime("%H:%M:%S.%f")[:-3],
                f"{entry['duration_ms']}ms",
                f"+{offset_ms}ms",
                str(entry["findings"]),
                f"[{sev_color}]{entry['severity']}[/{sev_color}]",
            )

        console.print(table)
        console.print(
            f"\n[bold]Total wall-clock time[/bold] (asyncio.gather): "
            f"[green]{total_ms}ms[/green]  "
            f"[dim](all agents started within ~{_max_start_spread()}ms of each other)[/dim]\n"
        )
    else:
        print("\n" + "=" * 70)
        print("CONCURRENCY PROOF — Agent Timing")
        print("=" * 70)
        header = f"{'Agent':<22} {'Start':>12} {'End':>12} {'Duration':>10} {'Offset':>8} {'Findings':>9}"
        print(header)
        print("-" * 70)
        for entry in sorted(_timing_log, key=lambda x: x["start"]):
            offset_ms = int((entry["start"] - t0).total_seconds() * 1000)
            print(
                f"{entry['agent']:<22} "
                f"{entry['start'].strftime('%H:%M:%S.%f')[:-3]:>12} "
                f"{entry['end'].strftime('%H:%M:%S.%f')[:-3]:>12} "
                f"{entry['duration_ms']:>8}ms "
                f"+{offset_ms:>6}ms "
                f"{entry['findings']:>8} findings"
            )
        print("-" * 70)
        print(f"Total wall-clock: {total_ms}ms")
        print(f"Max start spread: {_max_start_spread()}ms (overlap proves concurrency)\n")


def _max_start_spread() -> int:
    if len(_timing_log) < 2:
        return 0
    starts = [e["start"] for e in _timing_log]
    return int((max(starts) - min(starts)).total_seconds() * 1000)


def _print_verdict(verdict: Verdict) -> None:
    status_color = {
        "blocked":       "red",
        "needs_changes": "yellow",
        "pass":          "green",
    }.get(verdict.status, "white")

    if RICH:
        console.rule("[bold]Synthesis Verdict[/bold]")
        status_text = Text(verdict.status.upper().replace("_", " "), style=f"bold {status_color}")
        console.print(Panel(status_text, expand=False))
        console.print(f"\n[bold]Summary:[/bold] {verdict.summary}\n")

        if verdict.findings:
            table = Table(box=box.SIMPLE, show_header=True, header_style="bold")
            table.add_column("Severity", width=10)
            table.add_column("Agent",    width=18)
            table.add_column("Finding")

            for f in verdict.findings:
                sev_color = SEVERITY_COLOR.get(f.severity, "white")
                agent_color = AGENT_COLOR.get(f.agent or "", "white")
                table.add_row(
                    f"[{sev_color}]{f.severity.upper()}[/{sev_color}]",
                    f"[{agent_color}]{f.agent or '—'}[/{agent_color}]",
                    f.description[:120] + ("…" if len(f.description) > 120 else ""),
                )
            console.print(table)
    else:
        print("=" * 60)
        print(f"VERDICT: {verdict.status.upper()}")
        print("=" * 60)
        print(f"Summary: {verdict.summary}\n")
        print("Findings:")
        for f in verdict.findings:
            print(f"  [{f.severity.upper()}] [{f.agent}] {f.description[:100]}")
        print()


if __name__ == "__main__":
    asyncio.run(run_demo())
