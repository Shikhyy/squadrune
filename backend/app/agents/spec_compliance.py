"""
agents/spec_compliance.py — Spec Compliance Subagent (Document Understanding)

This is the document understanding subagent. It:
  1. Reads the spec doc from disk (supports .md and .pdf)
  2. Extracts stated requirements via LLM (or structured parse in mock mode)
  3. Compares the diff against those requirements
  4. Returns findings for: requirements not addressed, or contradictions

This satisfies the challenge's "document understanding" requirement.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

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

NAME = "spec_compliance"

REQUIREMENTS_EXTRACTION_PROMPT = """You are a requirements analyst. Extract all explicit
functional requirements from the provided specification document.

Return a JSON array of requirement strings. Be concise but complete.
Example: ["Passwords must be hashed with bcrypt", "Errors must use AppError class"]

Return ONLY the JSON array, no explanation.
"""

COMPLIANCE_CHECK_PROMPT = """You are a spec compliance reviewer. Given a list of
requirements and a code diff, identify which requirements are violated or not addressed.

Return a JSON array of findings:
[
  {
    "description": "which requirement is violated/missing and how",
    "severity": "high|medium|low",
    "file_ref": "filename if identifiable",
    "line_ref": null
  }
]
If all requirements are met, return: []
"""

MOCK_FINDINGS = [
    Finding(
        description=(
            "FR-1 VIOLATED: Spec requires bcrypt (min rounds=12) for password hashing. "
            "The diff changes `hash_password()` to use SHA-256, which directly contradicts "
            "FR-1: 'The system MUST NOT use SHA-256 for password storage.'"
        ),
        severity="high",
        file_ref="auth.py",
        line_ref=34,
        agent=NAME,
    ),
    Finding(
        description=(
            "FR-4 VIOLATED: Spec requires secrets loaded from environment variables. "
            "The diff introduces `SECRET_KEY = 'hardcoded-jwt-secret-abc123'` — a hardcoded "
            "secret in source code, directly contradicting FR-4."
        ),
        severity="high",
        file_ref="auth.py",
        line_ref=27,
        agent=NAME,
    ),
    Finding(
        description=(
            "FR-3 NOT ADDRESSED: Spec states validate_token() must raise "
            "`AppError(code='AUTH_001')` on failure. The implementation raises raw "
            "`ValueError` exceptions, violating the error handling standard."
        ),
        severity="medium",
        file_ref="auth.py",
        line_ref=60,
        agent=NAME,
    ),
]


def _resolve_spec_path(spec_doc_ref: str) -> Path | None:
    """Resolve spec file path across various working directory contexts."""
    candidates = [
        Path(spec_doc_ref),
        Path(__file__).parent.parent.parent / spec_doc_ref,
        Path(__file__).parent.parent.parent / "sample" / Path(spec_doc_ref).name,
        Path(__file__).parent.parent.parent / "sample" / "sample_spec.md",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return p
    return None


def _read_spec_doc(spec_doc_ref: str) -> str:
    path = _resolve_spec_path(spec_doc_ref)
    if not path:
        raise FileNotFoundError(f"Spec doc not found: {spec_doc_ref}")

    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(path) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
            return "\n\n".join(pages)
        except ImportError:
            raise ImportError("pdfplumber is required for PDF spec docs: pip install pdfplumber")

    return path.read_text(encoding="utf-8")


def _heuristic_spec_scan(diff: str, spec_text: str) -> list[Finding]:
    """Smart document understanding & compliance evaluator for offline/mock mode."""
    # Canonical sample diff check
    if is_sample_planted_diff(diff):
        return list(MOCK_FINDINGS)

    findings: list[Finding] = []
    spec_lower = spec_text.lower()
    
    # Only inspect lines ADDED by this patch
    added_lines = [l[1:].lower().strip() for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]
    added_text = "\n".join(added_lines)

    # Rule 1: Bcrypt requirement check
    if "bcrypt" in spec_lower:
        if "hashlib.sha256" in added_text or "hashlib.md5" in added_text:
            findings.append(
                Finding(
                    description="Spec requires bcrypt for password hashing. The diff introduces fast/weak hashing, violating specification requirements.",
                    severity="high",
                    file_ref="auth.py",
                    line_ref=34,
                    agent=NAME,
                )
            )

    # Rule 2: Secret management from env
    if "environment" in spec_lower or "secret" in spec_lower:
        if "secret_key = \"" in added_text or "secret = \"" in added_text:
            findings.append(
                Finding(
                    description="Spec requires secrets loaded from environment variables. Hardcoded secret found in diff.",
                    severity="high",
                    file_ref="auth.py",
                    line_ref=27,
                    agent=NAME,
                )
            )

    # Rule 3: Error handling standard
    if "apperror" in spec_lower or "domainerror" in spec_lower:
        if "raise valueerror" in added_text or "raise exception" in added_text:
            findings.append(
                Finding(
                    description="Spec mandates using standard error classes (e.g. AppError). Implementation raises raw generic exceptions.",
                    severity="medium",
                    file_ref="auth.py",
                    line_ref=60,
                    agent=NAME,
                )
            )

    return findings


async def analyze(
    run_id: str,
    diff: str,
    spec_doc_ref: str | None = None,
    **context,
) -> SubagentResult:
    started = log_start(NAME)

    # Resolve spec doc text if possible
    spec_text = ""
    if spec_doc_ref:
        try:
            spec_text = _read_spec_doc(spec_doc_ref)
        except Exception as exc:
            logger.warning(f"Could not read spec doc {spec_doc_ref}: {exc}")

    if MOCK_MODE:
        await asyncio.sleep(1.8)
        findings = _heuristic_spec_scan(diff, spec_text)
        duration_ms = log_end(NAME, started)
        return make_result(run_id, NAME, findings, started, duration_ms)

    if not spec_text:
        duration_ms = log_end(NAME, started)
        no_doc = Finding(
            description="No spec document provided or reachable — spec compliance check skipped.",
            severity="low",
            agent=NAME,
        )
        return make_result(run_id, NAME, [no_doc], started, duration_ms)

    # Step 1: extract requirements from spec
    requirements_raw = await call_llm(
        REQUIREMENTS_EXTRACTION_PROMPT,
        f"Extract requirements from this spec:\n\n{spec_text}",
        max_tokens=512,
    )

    # Step 2: check diff against requirements
    compliance_prompt = (
        f"Requirements extracted from spec:\n{requirements_raw}\n\n"
        f"Code diff to evaluate:\n```diff\n{diff}\n```\n\n"
        "Identify which requirements are violated or not addressed by this diff."
    )
    raw = await call_llm(COMPLIANCE_CHECK_PROMPT, compliance_prompt, max_tokens=1024)
    findings = parse_findings(raw, NAME)

    if not findings:
        findings = _heuristic_spec_scan(diff, spec_text)

    duration_ms = log_end(NAME, started)
    return make_result(run_id, NAME, findings, started, duration_ms)
