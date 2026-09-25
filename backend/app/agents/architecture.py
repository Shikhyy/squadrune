"""
agents/architecture.py — Architecture Consistency Subagent

Checks whether the diff follows patterns established in existing repo files:
  - Naming conventions
  - Error handling style (e.g., AppError vs raw exceptions)
  - Module/layer conventions

Mock mode: returns deterministic finding based on planted issue in sample.diff
"""
from __future__ import annotations

import asyncio

from app.models.run import Finding, SubagentResult
from .base import (
    MOCK_MODE,
    call_llm,
    is_sample_planted_diff,
    log_end,
    log_start,
    make_result,
    parse_findings,
)

NAME = "architecture"

SYSTEM_PROMPT = """You are an architecture consistency reviewer. Your job is to check
whether a code diff follows the patterns already established in the provided repository
context files.

You check for:
- Error handling: does the diff use the same error/exception pattern as existing code?
- Naming: function names, variable names consistent with existing conventions?
- Layering: does the change respect the module's existing structure?
- Import style: are new imports consistent with the existing codebase style?

You DO NOT flag:
- Security issues (separate agent handles those)
- Missing tests (separate agent handles that)
- Spec compliance (separate agent handles that)

Return a JSON array of findings:
[
  {
    "description": "what diverges and where the existing pattern is",
    "severity": "high|medium|low",
    "file_ref": "filename",
    "line_ref": null
  }
]
If no architecture issues found, return: []
"""

MOCK_FINDINGS = [
    Finding(
        description=(
            "`validate_token()` raises raw `ValueError` exceptions instead of the "
            "project's standard `AppError` class (e.g. `AppError(code='AUTH_001', ...)`). "
            "All existing functions in auth.py use AppError for error propagation."
        ),
        severity="medium",
        file_ref="auth.py",
        line_ref=60,
        agent=NAME,
    ),
]


import re


def _heuristic_architecture_scan(diff: str, repo_files: list[str] | None = None) -> list[Finding]:
    """Pattern-based architecture checker for offline / fallback mode."""
    if is_sample_planted_diff(diff):
        return list(MOCK_FINDINGS)

    findings: list[Finding] = []
    lines = diff.splitlines()
    current_file = "diff"
    line_num = 0

    for idx, line in enumerate(lines, 1):
        if line.startswith("+++ b/"):
            current_file = line[6:].strip()
            continue
        elif line.startswith("@@"):
            match = re.search(r"\+(\d+)", line)
            if match:
                line_num = int(match.group(1)) - 1
            continue

        if line.startswith("+") and not line.startswith("+++"):
            line_num += 1
            content = line[1:].strip()

            # 1. Raising raw exceptions instead of structured domain errors
            raw_exc = re.search(r"\braise\s+(ValueError|Exception|RuntimeError)\b", content)
            if raw_exc:
                findings.append(
                    Finding(
                        description=(
                            f"Raises raw `{raw_exc.group(1)}` exception directly. Architecture conventions "
                            f"require domain-specific error classes (e.g. `AppError`) with structured error codes."
                        ),
                        severity="medium",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )

            # 2. Leftover debug statements
            debug_match = re.search(r"^\s*(print\(|console\.log\(|debugger;)", content)
            if debug_match and not any(test in current_file.lower() for test in ("test", "spec", "mock")):
                findings.append(
                    Finding(
                        description=f"Leftover debug statement (`{debug_match.group(1).rstrip('(')}`) in production code path.",
                        severity="low",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )

            # 3. Hardcoded localhost / direct dev host
            if re.search(r"['\"]https?://(localhost|127\.0\.0\.1)(:\d+)?['\"]", content):
                findings.append(
                    Finding(
                        description="Hardcoded local endpoint URL. Configuration must use environment variables or service discovery.",
                        severity="medium",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )

    return findings


async def analyze(run_id: str, diff: str, repo_files: list[str] | None = None, **context) -> SubagentResult:
    started = log_start(NAME)

    if MOCK_MODE:
        await asyncio.sleep(1.5)
        findings = _heuristic_architecture_scan(diff, repo_files)
        duration_ms = log_end(NAME, started)
        return make_result(run_id, NAME, findings, started, duration_ms)

    repo_context = "\n\n".join(repo_files or [])
    user_prompt = (
        f"Check this diff for architecture consistency issues.\n\n"
        f"Existing repo context:\n```\n{repo_context}\n```\n\n"
        f"Diff to review:\n```diff\n{diff}\n```"
    )
    raw = await call_llm(SYSTEM_PROMPT, user_prompt)
    findings = parse_findings(raw, NAME)

    if not findings:
        findings = _heuristic_architecture_scan(diff, repo_files)

    duration_ms = log_end(NAME, started)
    return make_result(run_id, NAME, findings, started, duration_ms)
