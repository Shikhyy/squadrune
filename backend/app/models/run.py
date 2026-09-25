"""
models/run.py — SQLModel database tables: Run and SubagentResult
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Field, SQLModel


def _new_id() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────
# Finding — nested inside SubagentResult.findings (NOT its own table)
# ─────────────────────────────────────────────

class Finding(BaseModel):
    description: str
    severity: str  # none | low | medium | high
    file_ref: Optional[str] = None
    line_ref: Optional[int] = None
    agent: Optional[str] = None  # which agent produced this finding


# ─────────────────────────────────────────────
# Run — one review run (triggered by dashboard or /verify)
# ─────────────────────────────────────────────

class Run(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    status: str = "queued"  # queued | running | done | failed
    diff_text: str
    spec_doc_ref: Optional[str] = None
    repo_context_files: Optional[str] = None  # JSON-encoded list of file paths
    verdict: Optional[str] = None        # pass | needs_changes | blocked
    verdict_summary: Optional[str] = None
    verdict_json: Optional[str] = None   # full Verdict JSON
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    triggered_by: str = "dashboard"      # "dashboard" | "agent_api"


# ─────────────────────────────────────────────
# SubagentResult — one per agent per run
# ─────────────────────────────────────────────

class SubagentResult(SQLModel, table=True):
    id: str = Field(default_factory=_new_id, primary_key=True)
    run_id: str = Field(foreign_key="run.id")
    agent_name: str  # security | architecture | spec_compliance | test_coverage
    status: str = "running"  # running | done | failed
    findings: str = "[]"     # JSON-encoded list of Finding objects
    severity: str = "none"   # none | low | medium | high (worst finding)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: int = 0
    error: Optional[str] = None  # if status=failed, reason why

    def get_findings(self) -> list[Finding]:
        """Deserialize findings JSON to a list of Finding objects."""
        raw = json.loads(self.findings)
        return [Finding(**f) for f in raw]

    def set_findings(self, findings: list[Finding]) -> None:
        """Serialize findings list to JSON string."""
        self.findings = json.dumps([f.model_dump() for f in findings])
        # Compute worst severity
        severity_rank = {"none": 0, "low": 1, "medium": 2, "high": 3}
        worst = "none"
        for f in findings:
            if severity_rank.get(f.severity, 0) > severity_rank.get(worst, 0):
                worst = f.severity
        self.severity = worst
