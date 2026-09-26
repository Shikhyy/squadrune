"""
routers/verify.py — /verify endpoint (agent-facing, synchronous)

POST /verify — same pipeline as /runs but awaits completion and returns
               the full Verdict JSON synchronously.

This is what an external agent (Bob 2.0, etc.) calls mid-workflow.
Requires X-API-Key header matching the API_KEY env var.
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.models.run import Run
from app.models.verdict import Verdict
from app.orchestrator import run_squad
from app.database import engine
from sqlmodel import Session

router = APIRouter(prefix="/verify", tags=["verify"])

API_KEY = os.getenv("API_KEY", "squadrune-dev")


def _require_api_key(x_api_key: str = Header(default="")) -> None:
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key header")


class VerifyRequest(BaseModel):
    diff: str
    spec_doc_ref: str | None = None
    repo_context_files: list[str] = []


@router.post("", response_model=Verdict)
async def verify(
    body: VerifyRequest,
    x_api_key: str = Header(default=""),
) -> Verdict:
    """
    Agent-facing synchronous verification endpoint.

    Runs the full parallel subagent pipeline and returns the complete
    Verdict JSON without requiring a WebSocket or polling.

    Authentication: X-API-Key header (set API_KEY env var, default: squadrune-dev)
    """
    _require_api_key(x_api_key)

    # Create a Run record (triggered_by="agent_api")
    run = Run(
        diff_text=body.diff,
        spec_doc_ref=body.spec_doc_ref,
        triggered_by="agent_api",
        status="queued",
    )
    with Session(engine) as session:
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

    # Await directly — synchronous from the caller's perspective
    verdict = await run_squad(
        run_id=run_id,
        diff=body.diff,
        spec_doc_ref=body.spec_doc_ref,
        repo_files=body.repo_context_files,
    )
    return verdict
