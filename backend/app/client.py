"""
client.py — Agent Verification Client SDK for Squadrune

Allows any external coding agent (e.g., IBM Bob 2.0, Claude Code, Cursor, AutoGPT)
to call Squadrune mid-workflow with zero friction:
  - If a Squadrune server is running on localhost:8000, calls POST /verify.
  - If no server is running, transparently executes the parallel orchestrator
    in-process so that agents and scripts never fail on connection errors!
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

# Add backend directory to sys.path if not present
_backend_dir = str(Path(__file__).parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)


class SquadruneVerifier:
    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        api_key: str = "squadrune-dev",
        timeout: float = 60.0,
    ) -> None:
        self.base_url = os.getenv("SQUADRUNE_URL", base_url).rstrip("/")
        self.api_key = os.getenv("API_KEY", api_key)
        self.timeout = timeout

    async def verify_async(
        self,
        diff: str,
        spec_doc_ref: Optional[str] = None,
        repo_context_files: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Verify a code diff across Security, Architecture, Spec Compliance,
        and Test Coverage. Attempts HTTP first; falls back to in-process orchestrator.
        """
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "diff": diff,
            "spec_doc_ref": spec_doc_ref,
            "repo_context_files": repo_context_files or [],
        }

        # 1. Try remote HTTP call
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                res = await client.post(f"{self.base_url}/verify", json=payload, headers=headers)
                if res.status_code == 200:
                    return res.json()
        except Exception:
            # Server unreachable or offline — proceed to in-process execution
            pass

        # 2. In-process fallback
        return await self._run_in_process(diff, spec_doc_ref, repo_context_files)

    def verify(
        self,
        diff: str,
        spec_doc_ref: Optional[str] = None,
        repo_context_files: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Synchronous wrapper for verify_async."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(
                    asyncio.run,
                    self.verify_async(diff, spec_doc_ref, repo_context_files),
                )
                return future.result()
        else:
            return asyncio.run(self.verify_async(diff, spec_doc_ref, repo_context_files))

    async def _run_in_process(
        self,
        diff: str,
        spec_doc_ref: Optional[str] = None,
        repo_files: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Execute parallel review in-process via backend orchestrator."""
        from app.database import create_db_and_tables, engine
        from app.models.run import Run
        from app.orchestrator import run_squad
        from sqlmodel import Session

        create_db_and_tables()

        run = Run(
            diff_text=diff,
            spec_doc_ref=spec_doc_ref,
            triggered_by="agent_in_process",
            status="queued",
        )
        with Session(engine) as session:
            session.add(run)
            session.commit()
            session.refresh(run)
            run_id = run.id

        verdict = await run_squad(
            run_id=run_id,
            diff=diff,
            spec_doc_ref=spec_doc_ref,
            repo_files=repo_files,
        )
        return verdict.model_dump()


# Convenience function
def verify_diff(
    diff: str,
    spec_doc_ref: Optional[str] = None,
    repo_context_files: Optional[List[str]] = None,
    base_url: str = "http://localhost:8000",
) -> Dict[str, Any]:
    verifier = SquadruneVerifier(base_url=base_url)
    return verifier.verify(diff, spec_doc_ref, repo_context_files)
