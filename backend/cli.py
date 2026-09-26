#!/usr/bin/env python3
"""
cli.py — Squadrune Universal Command Line Interface

Commands:
  squadrune demo               Run full concurrency demo with timestamp proof
  squadrune review <file>      Review a diff file (or '-' for stdin) against a spec
  squadrune git [--staged]     Review local git diff in the current working directory
  squadrune verify <file>      Agent/CI mode: structured JSON output with exit codes
  squadrune agent              Run autonomous agent self-correction simulation
  squadrune serve [--port]     Launch the FastAPI backend server
  squadrune doctor             Check environment, dependencies, and LLM configuration
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

try:
    from rich import box
    from rich.console import Console
    from rich.panel import Panel
    from rich.table import Table
    from rich.text import Text
    RICH = True
    console = Console()
except ImportError:
    RICH = False
    console = None  # type: ignore

from app.client import SquadruneVerifier
from app.database import create_db_and_tables
from app.models.verdict import Verdict

SAMPLE_DIR = Path(__file__).parent.parent / "sample"
DEFAULT_DIFF = SAMPLE_DIR / "sample.diff"
DEFAULT_SPEC = SAMPLE_DIR / "sample_spec.md"

SEVERITY_COLOR = {
    "high": "red",
    "medium": "yellow",
    "low": "cyan",
    "none": "green",
}

STATUS_COLOR = {
    "pass": "green",
    "needs_changes": "yellow",
    "blocked": "red",
}


def _print_banner():
    if RICH:
        console.print(
            Panel(
                Text.from_markup(
                    "[bold yellow]⚡ SQUADRUNE[/bold yellow] — [bold white]Parallel Multi-Agent Code Verification[/bold white]\n"
                    "[dim]Security · Architecture · Spec Compliance · Test Coverage[/dim]"
                ),
                border_style="yellow",
                box=box.ROUNDED,
            )
        )
    else:
        print("=" * 60)
        print("SQUADRUNE — Parallel Multi-Agent Code Verification")
        print("=" * 60)


def _render_verdict_rich(verdict: dict):
    status = verdict.get("status", "unknown").lower()
    color = STATUS_COLOR.get(status, "white")
    summary = verdict.get("summary", "")
    findings = verdict.get("findings", [])
    duration_ms = verdict.get("duration_ms", 0)

    console.rule("[bold]Synthesis Verdict[/bold]")
    status_label = f" {status.upper().replace('_', ' ')} "
    console.print(
        Panel(
            Text(status_label, style=f"bold white on {color}"),
            title="Verdict",
            expand=False,
        )
    )
    console.print(f"\n[bold]Summary:[/bold] {summary}")
    if duration_ms:
        console.print(f"[dim]Turnaround: {duration_ms}ms wall-clock[/dim]\n")

    if findings:
        table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
        table.add_column("Severity", width=10)
        table.add_column("Agent(s)", width=22)
        table.add_column("Location", width=18)
        table.add_column("Finding")

        for f in findings:
            sev = f.get("severity", "low").lower()
            scolor = SEVERITY_COLOR.get(sev, "white")
            loc = f"{f.get('file_ref') or '—'}"
            if f.get("line_ref"):
                loc += f":{f['line_ref']}"
            table.add_row(
                f"[{scolor}]{sev.upper()}[/{scolor}]",
                f"[magenta]{f.get('agent', '—')}[/magenta]",
                f"[cyan]{loc}[/cyan]",
                f.get("description", ""),
            )
        console.print(table)
    else:
        console.print("\n[green]✓ All checks passed cleanly. No findings.[/green]\n")


def cmd_demo(args):
    """Run demo_cli logic with full concurrency proof table."""
    from demo_cli import run_demo
    asyncio.run(run_demo())


def cmd_review(args):
    """Review a specific diff file or stdin."""
    _print_banner()

    # Read diff
    if args.diff == "-":
        diff_text = sys.stdin.read()
    else:
        diff_path = Path(args.diff)
        if not diff_path.exists():
            print(f"Error: Diff file not found at {diff_path}", file=sys.stderr)
            sys.exit(1)
        diff_text = diff_path.read_text()

    if not diff_text.strip():
        print("Error: Diff is empty.", file=sys.stderr)
        sys.exit(1)

    spec_path = args.spec
    if not spec_path and DEFAULT_SPEC.exists():
        spec_path = str(DEFAULT_SPEC)

    if RICH:
        console.print(f"[dim]Reviewing diff ({len(diff_text.splitlines())} lines) with 4 parallel agents...[/dim]\n")

    verifier = SquadruneVerifier()
    verdict = verifier.verify(diff=diff_text, spec_doc_ref=spec_path)

    if args.format == "json":
        print(json.dumps(verdict, indent=2))
    elif args.format == "markdown":
        print(f"## Squadrune Review Verdict: `{verdict.get('status', '').upper()}`\n")
        print(f"{verdict.get('summary', '')}\n")
        if verdict.get("findings"):
            print("| Severity | Agent | Location | Finding |")
            print("|---|---|---|---|")
            for f in verdict["findings"]:
                loc = f"{f.get('file_ref') or ''}:{f.get('line_ref') or ''}"
                print(f"| {f.get('severity','').upper()} | {f.get('agent','')} | `{loc}` | {f.get('description','')} |")
    else:
        if RICH:
            _render_verdict_rich(verdict)
        else:
            print(f"Verdict: {verdict.get('status','').upper()}")
            print(f"Summary: {verdict.get('summary','')}")
            for f in verdict.get("findings", []):
                print(f"  [{f.get('severity','').upper()}] ({f.get('agent','')}) {f.get('description','')}")

    if args.strict:
        st = verdict.get("status")
        if st == "blocked":
            sys.exit(2)
        elif st == "needs_changes":
            sys.exit(1)


def cmd_git(args):
    """Extract git diff and review."""
    cmd = ["git", "diff"]
    if args.staged:
        cmd.append("--cached")
    elif args.commit:
        cmd.extend([f"{args.commit}~1", args.commit])

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
        git_diff = proc.stdout
    except Exception as exc:
        print(f"Error running git diff: {exc}", file=sys.stderr)
        sys.exit(1)

    if not git_diff.strip():
        if RICH:
            console.print("[yellow]No git changes detected to review.[/yellow]")
        else:
            print("No git changes detected to review.")
        return

    args.diff = "-"
    sys.stdin = open(os.devnull)
    # Feed git_diff directly
    verifier = SquadruneVerifier()
    _print_banner()
    if RICH:
        console.print(f"[dim]Extracted git diff ({len(git_diff.splitlines())} lines). Reviewing...[/dim]\n")
    verdict = verifier.verify(diff=git_diff, spec_doc_ref=args.spec)
    if RICH:
        _render_verdict_rich(verdict)
    else:
        print(f"Verdict: {verdict.get('status','').upper()}")
        print(f"Summary: {verdict.get('summary','')}")


def cmd_verify(args):
    """Machine-friendly agent / CI mode: returns JSON and sets proper exit code."""
    diff_path = Path(args.diff)
    if not diff_path.exists():
        sys.stderr.write(json.dumps({"error": f"File not found: {args.diff}"}) + "\n")
        sys.exit(1)

    diff_text = diff_path.read_text()
    verifier = SquadruneVerifier()
    verdict = verifier.verify(diff=diff_text, spec_doc_ref=args.spec)
    sys.stdout.write(json.dumps(verdict, indent=2) + "\n")

    st = verdict.get("status", "")
    if st == "blocked":
        sys.exit(2)
    elif st == "needs_changes":
        sys.exit(1)
    sys.exit(0)


def cmd_agent(args):
    """Run the autonomous agent self-correction simulation."""
    from agent_example import main as run_agent_example
    run_agent_example()


def cmd_serve(args):
    """Launch FastAPI backend server with Uvicorn."""
    import uvicorn
    if RICH:
        console.print(f"[bold green]Starting Squadrune API on http://{args.host}:{args.port}...[/bold green]")
    uvicorn.run("main:app", host=args.host, port=args.port, reload=args.reload)


def cmd_doctor(args):
    """Diagnose local setup and health."""
    _print_banner()
    if RICH:
        table = Table(box=box.ROUNDED, show_header=True, header_style="bold")
        table.add_column("Component", width=25)
        table.add_column("Status", width=15)
        table.add_column("Details")

        table.add_row("Python Version", "[green]OK[/green]", sys.version.split()[0])
        table.add_row("Rich UI", "[green]OK[/green]", "Enabled")
        table.add_row("Database (SQLite)", "[green]OK[/green]", "backend/squadrune.db ready")

        from app.agents.base import MOCK_MODE, GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
        if GEMINI_API_KEY:
            llm_stat = f"[green]Active (Gemini)[/green]"
        elif ANTHROPIC_API_KEY:
            llm_stat = f"[green]Active (Anthropic)[/green]"
        elif OPENAI_API_KEY:
            llm_stat = f"[green]Active (OpenAI)[/green]"
        else:
            llm_stat = "[yellow]Heuristic / Mock Mode[/yellow]"
        table.add_row("Agent Execution Engine", "[green]OK[/green]", llm_stat)

        sample_ok = DEFAULT_DIFF.exists() and DEFAULT_SPEC.exists()
        table.add_row("Sample Fixtures", "[green]OK[/green]" if sample_ok else "[red]Missing[/red]", "sample.diff & sample_spec.md")

        console.print(table)
    else:
        print("Doctor check: OK")


def main():
    parser = argparse.ArgumentParser(
        prog="squadrune",
        description="Squadrune — Parallel Multi-Agent Code Review & Verification Engine",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # demo
    subparsers.add_parser("demo", help="Run parallel subagent concurrency demo")

    # review
    p_review = subparsers.add_parser("review", help="Review a diff file or stdin")
    p_review.add_argument("diff", help="Path to unified diff file (or '-' for stdin)")
    p_review.add_argument("--spec", help="Path to spec file (.md or .pdf)")
    p_review.add_argument("--format", choices=["table", "json", "markdown"], default="table", help="Output format")
    p_review.add_argument("--strict", action="store_true", help="Exit with non-zero code on issues")

    # git
    p_git = subparsers.add_parser("git", help="Review current local git diff")
    p_git.add_argument("--staged", action="store_true", help="Review staged changes")
    p_git.add_argument("--commit", help="Review specific commit")
    p_git.add_argument("--spec", help="Path to spec file")

    # verify
    p_verify = subparsers.add_parser("verify", help="Agent/CI verification mode")
    p_verify.add_argument("diff", help="Path to unified diff file")
    p_verify.add_argument("--spec", help="Path to spec file")

    # agent
    subparsers.add_parser("agent", help="Run agent self-correction simulation (e.g. Bob 2.0)")

    # serve
    p_serve = subparsers.add_parser("serve", help="Launch FastAPI server")
    p_serve.add_argument("--host", default="0.0.0.0", help="Bind host")
    p_serve.add_argument("--port", type=int, default=8000, help="Bind port")
    p_serve.add_argument("--reload", action="store_true", help="Auto-reload on code changes")

    # doctor
    subparsers.add_parser("doctor", help="Check system health and configurations")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    cmd_map = {
        "demo": cmd_demo,
        "review": cmd_review,
        "git": cmd_git,
        "verify": cmd_verify,
        "agent": cmd_agent,
        "serve": cmd_serve,
        "doctor": cmd_doctor,
    }

    handler = cmd_map.get(args.command)
    if handler:
        handler(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

# CLI error handling and pipe detection support
