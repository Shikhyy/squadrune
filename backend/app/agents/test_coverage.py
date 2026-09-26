"""
agents/test_coverage.py — Test Coverage Subagent

Heuristic check for untested new code paths:
  - Identifies new functions/branches added in the diff
  - Checks whether the test files in the repo were touched
  - Reports new logic paths that have no corresponding test changes

Mock mode: returns deterministic finding for the planted untested function.
"""
from __future__ import annotations

import asyncio
import re

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

NAME = "test_coverage"

SYSTEM_PROMPT = """You are a test coverage reviewer. Your job is to check whether new
code logic introduced in a diff has corresponding test coverage.

You check for:
- New functions or methods added — are there corresponding test functions for them?
- New conditional branches (if/else, try/except) — are edge cases tested?
- New error paths — are error conditions tested?

You DO NOT check:
- Security issues
- Architecture consistency
- Spec requirements

Return a JSON array of findings:
[
  {
    "description": "what new code path is untested",
    "severity": "high|medium|low",
    "file_ref": "filename",
    "line_ref": null
  }
]
If all new code has test coverage, return: []
"""

MOCK_FINDINGS = [
    Finding(
        description=(
            "New function `validate_token()` added in auth.py has NO corresponding "
            "test in test_auth.py. The spec (FR-2) explicitly requires tests for: "
            "valid token, expired token, and tampered token scenarios."
        ),
        severity="high",
        file_ref="auth.py",
        line_ref=51,
        agent=NAME,
    ),
    Finding(
        description=(
            "`hash_password()` behavior changed from bcrypt to SHA-256 but "
            "`test_hash_password_returns_string` was not updated to assert the new "
            "hash format — existing test may give false confidence."
        ),
        severity="low",
        file_ref="test_auth.py",
        line_ref=8,
        agent=NAME,
    ),
]


def _extract_new_functions(diff: str) -> list[str]:
    """Heuristically extract names of new functions added in the diff."""
    pattern = re.compile(r"^\+\s*(?:async\s+)?def\s+(\w+)\s*\(", re.MULTILINE)
    return pattern.findall(diff)


def _heuristic_test_scan(diff: str, repo_files: list[str] | None = None) -> list[Finding]:
    """Pattern-based test coverage analyzer for offline/fallback mode."""
    if is_sample_planted_diff(diff):
        return list(MOCK_FINDINGS)

    findings: list[Finding] = []
    new_funcs = _extract_new_functions(diff)

    # Filter out test functions themselves
    prod_funcs = [f for f in new_funcs if not f.startswith("test_") and not f.startswith("_test")]

    # Check if any test files were touched in the diff
    has_test_changes = any(
        marker in diff for marker in ("test_", "_test.", ".spec.", ".test.", "+++ b/tests/")
    )

    if prod_funcs and not has_test_changes:
        for fn in prod_funcs:
            findings.append(
                Finding(
                    description=f"New function `{fn}()` added without corresponding unit test updates in the diff.",
                    severity="high" if len(prod_funcs) <= 2 else "medium",
                    agent=NAME,
                )
            )

    return findings


async def analyze(
    run_id: str,
    diff: str,
    repo_files: list[str] | None = None,
    **context,
) -> SubagentResult:
    started = log_start(NAME)

    if MOCK_MODE:
        await asyncio.sleep(1.1)
        findings = _heuristic_test_scan(diff, repo_files)
        duration_ms = log_end(NAME, started)
        return make_result(run_id, NAME, findings, started, duration_ms)

    new_funcs = _extract_new_functions(diff)
    repo_context = "\n\n".join(repo_files or [])

    user_prompt = (
        f"New functions detected in diff: {new_funcs}\n\n"
        f"Repository test files context:\n```\n{repo_context}\n```\n\n"
        f"Diff to review:\n```diff\n{diff}\n```\n\n"
        "Report any new code paths that lack test coverage."
    )
    raw = await call_llm(SYSTEM_PROMPT, user_prompt)
    findings = parse_findings(raw, NAME)

    if not findings:
        findings = _heuristic_test_scan(diff, repo_files)

    duration_ms = log_end(NAME, started)
    return make_result(run_id, NAME, findings, started, duration_ms)
