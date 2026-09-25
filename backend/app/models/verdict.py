"""
models/verdict.py — Pydantic models for the final synthesis verdict
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from .run import Finding


class Verdict(BaseModel):
    status: str  # pass | needs_changes | blocked
    summary: str
    findings: list[Finding] = []
    findings_by_severity: dict[str, list[Finding]] = {}
    agents_completed: list[str] = []
    agents_failed: list[str] = []
    duration_ms: Optional[int] = None

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        """Auto-build findings_by_severity from flat findings list."""
        if self.findings and not self.findings_by_severity:
            grouped: dict[str, list[Finding]] = {}
            for f in self.findings:
                grouped.setdefault(f.severity, []).append(f)
            self.findings_by_severity = grouped
