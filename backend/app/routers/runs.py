"""
routers/runs.py — /runs endpoints

POST /runs    — Start a new review run (background task, returns run_id immediately)
GET  /runs    — List run history
GET  /runs/{id} — Get current state / final verdict of a run
"""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models.run import Run
from app.models.verdict import Verdict
from app.orchestrator import run_squad

router = APIRouter(prefix="/runs", tags=["runs"])


# ─────────────────────────────────────────────
# Request / Response shapes
# ─────────────────────────────────────────────

class RunRequest(BaseModel):
    diff: str
    spec_doc_ref: str | None = None
    repo_context_files: list[str] = []
    triggered_by: str = "dashboard"


class RunCreatedResponse(BaseModel):
    run_id: str
    status: str
    message: str


class RunStatusResponse(BaseModel):
    run_id: str
    status: str
    verdict: str | None
    verdict_summary: str | None
    verdict_detail: dict | None
    created_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    triggered_by: str
    agent_results: list[dict] = []
    diff_text: str | None = None
    spec_doc_ref: str | None = None


# ─────────────────────────────────────────────
# Background task wrapper
# ─────────────────────────────────────────────

async def _run_squad_task(
    run_id: str,
    diff: str,
    spec_doc_ref: str | None,
    repo_files: list[str],
) -> None:
    """Background task wrapper — catches and logs errors so they don't silently die."""
    import logging
    logger = logging.getLogger("squadrune")
    try:
        await run_squad(run_id, diff, spec_doc_ref, repo_files)
    except Exception as exc:
        logger.error(f"[orchestrator] Background run {run_id} failed: {exc}", exc_info=True)
        # Mark run as failed in DB
        from sqlmodel import Session
        from app.database import engine
        with Session(engine) as session:
            run = session.get(Run, run_id)
            if run:
                run.status = "failed"
                session.add(run)
                session.commit()


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post("", response_model=RunCreatedResponse, status_code=202)
async def create_run(
    body: RunRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> RunCreatedResponse:
    """Start a new review run. Returns immediately with run_id; runs in background."""
    run = Run(
        diff_text=body.diff,
        spec_doc_ref=body.spec_doc_ref,
        repo_context_files=json.dumps(body.repo_context_files),
        triggered_by=body.triggered_by,
        status="queued",
    )
    session.add(run)
    session.commit()
    session.refresh(run)

    background_tasks.add_task(
        _run_squad_task,
        run.id,
        body.diff,
        body.spec_doc_ref,
        body.repo_context_files,
    )

    return RunCreatedResponse(
        run_id=run.id,
        status="queued",
        message=f"Run {run.id} queued. Connect to /runs/{run.id}/stream for live updates.",
    )


from app.models.run import Run, SubagentResult


PRESETS = [
    {
        "id": "vulnerable-auth",
        "title": "Vulnerable Auth PR (Planted Issues)",
        "badge": "Security & Spec Flaws",
        "expected": "blocked",
        "specPath": "../sample/sample_spec.md",
        "diff": """--- a/auth.py
+++ b/auth.py
@@ -20,14 +22,22 @@ class AppError(Exception):
         super().__init__(f"[{code}] {message}")

+# ISSUE 1 — SECURITY: Hardcoded secret key (violates FR-4)
+SECRET_KEY = "hardcoded-jwt-secret-abc123"

 def hash_password(password: str) -> str:
-    import bcrypt
-    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()
+    import hashlib
+    # ISSUE 3 — SPEC COMPLIANCE: Using SHA-256 instead of bcrypt (violates FR-1)
+    return hashlib.sha256(password.encode()).hexdigest()

+# ISSUE 2 — TEST COVERAGE: New function validate_token() has NO corresponding test
+# ISSUE 4 — ARCHITECTURE: Raises raw ValueError instead of AppError (violates FR-3)
+def validate_token(token: str) -> dict:
+    parts = token.split(":")
+    if len(parts) != 3:
+        raise ValueError("Invalid token format")
+    return {"user_id": parts[0]}""",
    },
    {
        "id": "clean-auth",
        "title": "Clean Auth PR (All Checks Pass)",
        "badge": "Production Ready",
        "expected": "pass",
        "specPath": "../sample/sample_spec.md",
        "diff": """--- a/auth.py
+++ b/auth.py
@@ -10,6 +10,7 @@
 import os
+import bcrypt
 from datetime import datetime

-SECRET_KEY = "hardcoded-jwt-secret-abc123"
+SECRET_KEY = os.getenv("JWT_SECRET_KEY")

 def hash_password(password: str) -> str:
-    return hashlib.sha256(password.encode()).hexdigest()
+    salt = bcrypt.gensalt(rounds=12)
+    return bcrypt.hashpw(password.encode(), salt).decode()

 def validate_token(token: str) -> dict:
     parts = token.split(":")
     if len(parts) != 3:
-        raise ValueError("Invalid token")
+        raise AppError(code="AUTH_001", message="Invalid token structure")
     return {"user_id": parts[0]}
--- a/tests/test_auth.py
+++ b/tests/test_auth.py
@@ -15,3 +15,8 @@
+def test_validate_token_valid():
+    assert validate_token("123:3600:sig")["user_id"] == "123"
+
+def test_validate_token_tampered():
+    with pytest.raises(AppError):
+        validate_token("tampered")""",
    },
    {
        "id": "missing-tests",
        "title": "Untested Payment Gateway Methods",
        "badge": "Missing Tests",
        "expected": "needs_changes",
        "specPath": "../sample/sample_spec.md",
        "diff": """--- a/services/payment.py
+++ b/services/payment.py
@@ -1,5 +1,12 @@
+async def process_instant_payout(account_id: str, amount_usd: float) -> dict:
+    # Critical financial path with zero test suite additions
+    gateway = get_stripe_client()
+    return await gateway.transfers.create(amount=int(amount_usd * 100), destination=account_id)
+
+async def reverse_dispute(charge_id: str) -> bool:
+    return await DisputeService.reverse(charge_id)""",
    },
    {
        "id": "architecture-violation",
        "title": "Layering & Hygiene Defects",
        "badge": "Architecture Flaws",
        "expected": "needs_changes",
        "specPath": "../sample/sample_spec.md",
        "diff": """--- a/api/routes.py
+++ b/api/routes.py
@@ -10,3 +10,9 @@
+@router.post("/internal/sync")
+def sync_user():
+    print("DEBUG: entering sync user internal endpoint")
+    res = requests.get("http://localhost:8080/data")
+    if not res.ok:
+        raise Exception("Database sync dropped")
+    return res.json()""",
    },
]


@router.get("/meta/presets")
def get_presets():
    """List interactive sample review presets."""
    return PRESETS


@router.get("", response_model=list[RunStatusResponse])
def list_runs(
    session: Session = Depends(get_session),
) -> list[RunStatusResponse]:
    """List all past runs, most recent first."""
    runs = session.exec(select(Run).order_by(Run.created_at.desc()).limit(50)).all()  # type: ignore[arg-type]
    return [_run_to_response(r, session) for r in runs]


@router.get("/{run_id}", response_model=RunStatusResponse)
def get_run(
    run_id: str,
    session: Session = Depends(get_session),
) -> RunStatusResponse:
    """Get the current state of a run."""
    run = session.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return _run_to_response(run, session)


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _run_to_response(run: Run, session: Session | None = None) -> RunStatusResponse:
    verdict_detail = None
    if run.verdict_json:
        try:
            verdict_detail = json.loads(run.verdict_json)
        except (json.JSONDecodeError, ValueError):
            pass

    agent_results = []
    if session:
        sub_results = session.exec(select(SubagentResult).where(SubagentResult.run_id == run.id)).all()
        for sr in sub_results:
            findings_list = [f.model_dump() for f in sr.get_findings()] if hasattr(sr, "get_findings") else []
            agent_results.append({
                "agent": sr.agent_name,
                "status": sr.status,
                "severity": sr.severity,
                "duration_ms": sr.duration_ms,
                "started_at": sr.started_at.isoformat() if sr.started_at else None,
                "completed_at": sr.completed_at.isoformat() if sr.completed_at else None,
                "findings": findings_list,
                "finding_count": len(findings_list),
                "error": sr.error,
            })

    return RunStatusResponse(
        run_id=run.id,
        status=run.status,
        verdict=run.verdict,
        verdict_summary=run.verdict_summary,
        verdict_detail=verdict_detail,
        created_at=run.created_at,
        completed_at=run.completed_at,
        duration_ms=run.duration_ms,
        triggered_by=run.triggered_by,
        agent_results=agent_results,
        diff_text=run.diff_text,
        spec_doc_ref=run.spec_doc_ref,
    )
