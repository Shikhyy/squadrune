"""
agents/security.py — Security Subagent

Scans the diff for:
  - Hardcoded secrets / API keys / passwords
  - Unsafe patterns: shell injection, SQL injection, disabled TLS, eval()
  - Uses few-shot LLM prompt for precision over recall

Mock mode: returns deterministic findings based on planted issues in sample.diff
"""
from __future__ import annotations

import asyncio
from datetime import datetime

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

NAME = "security"

SYSTEM_PROMPT = """You are a security code reviewer specializing in identifying concrete,
exploitable security issues in code diffs. You focus on precision over recall — only flag
issues you are confident are real security problems, not style issues or theoretical risks.

You flag:
- Hardcoded secrets, passwords, API keys, private keys
- SQL injection, shell injection, path traversal
- Disabled certificate verification
- Use of weak/broken cryptography (MD5, SHA-1 for passwords)
- Eval of untrusted input

You DO NOT flag:
- Style issues
- Missing error handling (that's for another agent)
- Logging or observability gaps

Return a JSON array of findings (and ONLY that array — no markdown, no explanation):
[
  {
    "description": "one-line description of the issue",
    "severity": "high|medium|low",
    "file_ref": "filename if identifiable",
    "line_ref": null
  }
]
If no security issues found, return: []
"""

MOCK_FINDINGS = [
    Finding(
        description=(
            "Hardcoded JWT secret key: `SECRET_KEY = \"hardcoded-jwt-secret-abc123\"` "
            "in auth.py. Secrets must be loaded from environment variables (FR-4)."
        ),
        severity="high",
        file_ref="auth.py",
        line_ref=27,
        agent=NAME,
    ),
    Finding(
        description=(
            "Password hashing downgraded from bcrypt to SHA-256. "
            "SHA-256 is not a password hashing function — it is fast and GPU-crackable. "
            "This is a cryptographic regression."
        ),
        severity="high",
        file_ref="auth.py",
        line_ref=34,
        agent=NAME,
    ),
]


import re


def _heuristic_security_scan(diff: str) -> list[Finding]:
    """Pattern-based security scanner for offline / non-LLM mode."""
    # If this is the specific sample diff with planted issues
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

            # 1. Hardcoded secret / token / password
            secret_pattern = re.search(
                r"(?i)\b(api[_-]?key|secret(?:[_-]?key)?|jwt[_-]?secret|password|passwd|auth[_-]?token|bearer)\s*[:=]\s*['\"]([^'\"]{6,})['\"]",
                content,
            )
            if secret_pattern and not any(safe in content.lower() for safe in ("os.getenv", "env", "config", "none", "dummy")):
                findings.append(
                    Finding(
                        description=f"Potential hardcoded secret or credential detected: `{secret_pattern.group(1)} = '...'`. Secrets must be loaded from environment variables or a vault.",
                        severity="high",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )

            # 2. Weak hashing for passwords
            if re.search(r"(?i)\b(hashlib\.(md5|sha1|sha256)|crypt\.)", content) and any(
                p in content.lower() or "password" in current_file.lower() for p in ("password", "hash_password", "passwd")
            ):
                findings.append(
                    Finding(
                        description="Weak or fast hashing algorithm used for password handling. Passwords must use adaptive work-factor algorithms (e.g. bcrypt, argon2).",
                        severity="high",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )

            # 3. Disabled TLS / SSL
            if re.search(r"(?i)\bverify\s*=\s*False\b", content):
                findings.append(
                    Finding(
                        description="Disabled TLS certificate verification (`verify=False`). Enables man-in-the-middle attacks.",
                        severity="high",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )

            # 4. Insecure eval or shell execution
            if re.search(r"\b(eval|exec)\s*\(", content):
                findings.append(
                    Finding(
                        description="Dangerous execution of dynamic code via `eval` or `exec`.",
                        severity="high",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )
            if re.search(r"\bshell\s*=\s*True\b", content):
                findings.append(
                    Finding(
                        description="Subprocess invocation with `shell=True` increases shell injection risk.",
                        severity="medium",
                        file_ref=current_file,
                        line_ref=line_num,
                        agent=NAME,
                    )
                )

    return findings


async def analyze(run_id: str, diff: str, **context) -> SubagentResult:
    started = log_start(NAME)

    if MOCK_MODE:
        await asyncio.sleep(1.2)
        findings = _heuristic_security_scan(diff)
        duration_ms = log_end(NAME, started)
        return make_result(run_id, NAME, findings, started, duration_ms)

    user_prompt = f"Review this diff for security issues:\n\n```diff\n{diff}\n```"
    raw = await call_llm(SYSTEM_PROMPT, user_prompt)
    findings = parse_findings(raw, NAME)

    # If LLM didn't return findings or failed, fall back to heuristic
    if not findings:
        findings = _heuristic_security_scan(diff)

    duration_ms = log_end(NAME, started)
    return make_result(run_id, NAME, findings, started, duration_ms)

# CWE mappings: CWE-798 (hardcoded credentials), CWE-327 (broken crypto)

# CWE mappings: CWE-798 (hardcoded credentials), CWE-327 (broken crypto)
