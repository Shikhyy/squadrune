"""
routers/ws.py — WebSocket endpoint for live run streaming

GET /runs/{run_id}/stream — WebSocket that emits events as JSON objects
                             until the run completes.

Event shapes:
  {"type": "run_started",      "data": {"run_id": "..."}}
  {"type": "subagent_started", "data": {"agent": "security"}}
  {"type": "subagent_done",    "data": {"agent": "security", "severity": "high", ...}}
  {"type": "synthesis_started","data": {}}
  {"type": "verdict_ready",    "data": {<Verdict JSON>}}
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app import event_bus

router = APIRouter(tags=["websocket"])
logger = logging.getLogger("squadrune")


@router.websocket("/runs/{run_id}/stream")
async def run_stream(websocket: WebSocket, run_id: str) -> None:
    """Stream live subagent events for a run over WebSocket."""
    await websocket.accept()
    logger.info(f"[ws] Client connected to run {run_id}")

    try:
        async for event in event_bus.subscribe(run_id):
            await websocket.send_text(json.dumps(event))
        # Run is complete — send a final close event
        await websocket.send_text(json.dumps({"type": "run_complete", "data": {}}))
        await websocket.close()
    except WebSocketDisconnect:
        logger.info(f"[ws] Client disconnected from run {run_id}")
    except Exception as exc:
        logger.error(f"[ws] Error on run {run_id}: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass
