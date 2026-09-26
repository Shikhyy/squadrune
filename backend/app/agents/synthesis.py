"""
agents/synthesis.py — Synthesis Agent

Takes all four SubagentResult objects, deduplicates overlapping findings,
ranks by real-world severity, and produces one Verdict.

In mock mode: uses the actual subagent results passed in (no LLM call needed —
the mock findings are already structured, synthesis just aggregates them).

With a real LLM: sends all findings to Claude/GPT for deduplication + ranking.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from app.models.run import Finding, SubagentResult
from app.models.verdict import Verdict
from .base import MOCK_MODE, call_llm, log_end, log_start, parse_findings

NAME = "synthesis"

SYSTEM_PROMPT = """You are a senior engineering lead synthesizing the output of four
parallel code review agents into one clear verdict.

Given findings from Security, Architecture, Spec Compliance, and Test Coverage agents:
1. Deduplicate overlapping findings (e.g., if security AND spec compliance both flag
   the same hardcoded secret, merge them into one finding)
2. Rank all findings by real-world severity and impact — not by the order received
3. Determine the overall verdict:
   - "blocked": any HIGH severity finding from Security or Spec Compliance
   - "needs_changes": any finding (no HIGH security/spec issues)
   - "pass": no findings at all
4. Write a one-sentence summary stating: verdict, how many agents flagged issues,
   and the single most important finding

Return JSON in exactly this shape:
{
  "status": "blocked|needs_changes|pass",
  "summary": "one-sentence summary",
  "findings": [
    {"description": "...", "severity": "high|medium|low", "file_ref": "...", "line_ref": null, "agent": "..."}
  ]
}
"""

SEVERITY_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}


def _determine_status(findings: list[Finding]) -> str:
    """Determine verdict status from findings list."""
    for f in findings:
        agent_str = f.agent or ""
        if f.severity == "high" and ("security" in agent_str or "spec_compliance" in agent_str):
            return "blocked"
    if findings:
        return "needs_changes"
    return "pass"


def _deduplicate_findings(findings: list[Finding]) -> list[Finding]:
    """Deduplicate overlapping findings from multiple agents on the same issue."""
    deduped: list[Finding] = []
    seen_keys: dict[str, int] = {}

    for f in findings:
        # Generate fingerprint
        key = ""
        if f.file_ref and f.line_ref:
            key = f"{f.file_ref}:{f.line_ref}"
        elif "secret" in f.description.lower():
            key = f"{f.file_ref or 'diff'}:secret"
        elif "bcrypt" in f.description.lower() or "sha-256" in f.description.lower():
            key = f"{f.file_ref or 'diff'}:hash"
        elif "validate_token" in f.description.lower() and "apperror" in f.description.lower():
            key = f"{f.file_ref or 'diff'}:apperror"
        else:
            key = f"{f.file_ref}:{f.description[:40]}"

        if key in seen_keys:
            existing_idx = seen_keys[key]
            existing = deduped[existing_idx]
            # Merge agents
            current_agents = set((existing.agent or "").split(" + "))
            if f.agent:
                current_agents.add(f.agent)
            existing.agent = " + ".join(sorted(current_agents))
            # Pick worst severity
            if SEVERITY_RANK.get(f.severity, 0) > SEVERITY_RANK.get(existing.severity, 0):
                existing.severity = f.severity
        else:
            seen_keys[key] = len(deduped)
            deduped.append(f)

    return deduped


def _mock_synthesize(
    results: list[SubagentResult],
    started: datetime,
) -> Verdict:
    """
    Synthesize: collect all findings, deduplicate across agents,
    sort by real-world severity, and determine overall verdict.
    """
    raw_findings: list[Finding] = []
    completed: list[str] = []
    failed: list[str] = []

    for r in results:
        if r.status == "failed":
            failed.append(r.agent_name)
        else:
            completed.append(r.agent_name)
            raw_findings.extend(r.get_findings())

    # Deduplicate overlapping findings
    all_findings = _deduplicate_findings(raw_findings)

    # Sort by severity descending
    all_findings.sort(key=lambda f: SEVERITY_RANK.get(f.severity, 0), reverse=True)

    status = _determine_status(all_findings)

    high_count = sum(1 for f in all_findings if f.severity == "high")
    med_count = sum(1 for f in all_findings if f.severity == "medium")
    low_count = sum(1 for f in all_findings if f.severity == "low")

    summary_parts = []
    if high_count:
        summary_parts.append(f"{high_count} high")
    if med_count:
        summary_parts.append(f"{med_count} medium")
    if low_count:
        summary_parts.append(f"{low_count} low")

    if summary_parts:
        agents_flagged = len([r for r in results if r.status != "failed" and r.get_findings()])
        summary = (
            f"{agents_flagged} of {len(completed)} agents flagged issues "
            f"({', '.join(summary_parts)} severity). "
            f"Top issue: {all_findings[0].description[:90]}..."
            if all_findings
            else "No issues found."
        )
    else:
        summary = f"All {len(completed)} agents passed. Zero defects detected."

    ended = datetime.now(timezone.utc)
    duration_ms = int((ended - started).total_seconds() * 1000)

    verdict = Verdict(
        status=status,
        summary=summary,
        findings=all_findings,
        agents_completed=completed,
        agents_failed=failed,
        duration_ms=duration_ms,
    )
    return verdict


async def synthesize(
    results: list[SubagentResult],
    overall_started: datetime | None = None,
) -> Verdict:
    """
    Merge four SubagentResult objects into one Verdict.
    """
    if overall_started is None:
        overall_started = datetime.now(timezone.utc)
    started = log_start(NAME)

    if MOCK_MODE:
        verdict = _mock_synthesize(results, overall_started)
        log_end(NAME, started)
        return verdict

    # ── Real LLM synthesis ───────────────────────────────────────────────────
    all_findings_raw = []
    completed: list[str] = []
    failed: list[str] = []

    for r in results:
        if r.status == "failed":
            failed.append(r.agent_name)
        else:
            completed.append(r.agent_name)
            for f in r.get_findings():
                all_findings_raw.append(f.model_dump())

    user_prompt = (
        f"Synthesize these findings from {len(completed)} review agents:\n\n"
        f"{json.dumps(all_findings_raw, indent=2)}\n\n"
        f"Agents that completed: {completed}\n"
        f"Agents that failed: {failed}\n"
        "Produce the final verdict JSON."
    )

    raw = await call_llm(SYSTEM_PROMPT, user_prompt, max_tokens=1024)

    # Parse the structured verdict
    import re

    text = raw.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if fence_match:
        text = fence_match.group(1).strip()

    try:
        data = json.loads(text)
        findings = [Finding(**f) for f in data.get("findings", [])]
        ended = datetime.now(timezone.utc)
        duration_ms = int((ended - overall_started).total_seconds() * 1000)
        verdict = Verdict(
            status=data.get("status", "needs_changes"),
            summary=data.get("summary", ""),
            findings=findings,
            agents_completed=completed,
            agents_failed=failed,
            duration_ms=duration_ms,
        )
    except (json.JSONDecodeError, Exception):
        # Fallback to mock synthesis if LLM output is unparseable
        verdict = _mock_synthesize(results, overall_started)

    log_end(NAME, started)
    return verdict

# Synthesis heuristic: security & spec compliance issues take strict precedence
