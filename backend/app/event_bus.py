"""
event_bus.py — Simple in-memory event bus for streaming subagent status.

Each active run gets an asyncio.Queue. The orchestrator publishes events;
the WebSocket handler subscribes and drains them.

Events are plain dicts serializable to JSON.
"""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator

# run_id -> list of subscriber queues
_subscribers: dict[str, list[asyncio.Queue]] = {}

SENTINEL = object()  # signals "run is over, close the stream"


def _get_queues(run_id: str) -> list[asyncio.Queue]:
    return _subscribers.get(run_id, [])


async def publish(run_id: str, event_type: str, data: dict | None = None) -> None:
    """Publish an event to all subscribers of a run."""
    payload = {"type": event_type, "data": data or {}}
    for q in _get_queues(run_id):
        await q.put(payload)


async def publish_done(run_id: str) -> None:
    """Signal all subscribers that the run is complete."""
    for q in _get_queues(run_id):
        await q.put(SENTINEL)
    # Clean up
    _subscribers.pop(run_id, None)


async def subscribe(run_id: str) -> AsyncGenerator[dict, None]:
    """
    Async generator that yields events for a given run.
    Terminates when the run completes (SENTINEL received).
    """
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.setdefault(run_id, []).append(q)
    try:
        while True:
            item = await q.get()
            if item is SENTINEL:
                break
            yield item
    finally:
        try:
            _subscribers.get(run_id, []).remove(q)
        except ValueError:
            pass
