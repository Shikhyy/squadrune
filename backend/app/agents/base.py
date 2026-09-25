"""
agents/base.py — Shared infrastructure for all subagents:
  - SubagentProtocol (typing.Protocol)
  - LLM client helper (Anthropic → OpenAI → Mock, in priority order)
  - Timestamp-annotated logger
  - Finding parser helper
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable

from dotenv import load_dotenv

from app.models.run import Finding, SubagentResult

load_dotenv()

logger = logging.getLogger("squadrune")

# ─────────────────────────────────────────────
# Determine runtime mode once at import time
# Priority: Gemini → Anthropic → OpenAI → Mock
# ─────────────────────────────────────────────
MOCK_MODE: bool = os.getenv("MOCK_MODE", "false").lower() in ("1", "true", "yes")
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

if not MOCK_MODE and not GEMINI_API_KEY and not ANTHROPIC_API_KEY and not OPENAI_API_KEY:
    logger.warning(
        "No LLM API key found and MOCK_MODE is not set. "
        "Falling back to mock mode automatically."
    )
    MOCK_MODE = True

if not MOCK_MODE:
    _backend = "gemini" if GEMINI_API_KEY else ("anthropic" if ANTHROPIC_API_KEY else "openai")
    logger.info(f"LLM backend: {_backend}")


# ─────────────────────────────────────────────
# Protocol — every subagent must satisfy this
# ─────────────────────────────────────────────

@runtime_checkable
class SubagentProtocol(Protocol):
    name: str

    async def analyze(self, diff: str, **context) -> SubagentResult:
        ...


def is_sample_planted_diff(diff: str) -> bool:
    """Check if the diff actually ADDS the planted sample secret."""
    for line in diff.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            if "hardcoded-jwt-secret-abc123" in line:
                return True
    return False


# ─────────────────────────────────────────────
# Timestamp helpers
# ─────────────────────────────────────────────

def ts() -> str:
    """ISO-8601 timestamp with microseconds, UTC."""
    return datetime.now(timezone.utc).isoformat()


def log_start(agent_name: str) -> datetime:
    started = datetime.now(timezone.utc)
    logger.info(f"[{agent_name}] START {started.isoformat()}")
    return started


def log_end(agent_name: str, started: datetime) -> int:
    ended = datetime.now(timezone.utc)
    duration_ms = int((ended - started).total_seconds() * 1000)
    logger.info(f"[{agent_name}] END   {ended.isoformat()} (duration={duration_ms}ms)")
    return duration_ms


# ─────────────────────────────────────────────
# LLM call helper
# ─────────────────────────────────────────────

def _is_placeholder_key(key: str | None) -> bool:
    if not key or not key.strip():
        return True
    k = key.strip().lower()
    return (
        "your_" in k
        or "placeholder" in k
        or "example" in k
        or "dummy" in k
        or "test" in k
        or len(k) < 15
    )

if _is_placeholder_key(GEMINI_API_KEY):
    GEMINI_API_KEY = ""
if _is_placeholder_key(ANTHROPIC_API_KEY):
    ANTHROPIC_API_KEY = ""
if _is_placeholder_key(OPENAI_API_KEY):
    OPENAI_API_KEY = ""

if not MOCK_MODE and not GEMINI_API_KEY and not ANTHROPIC_API_KEY and not OPENAI_API_KEY:
    logger.info("No active LLM API keys configured. Using fast deterministic / heuristic review mode.")
    MOCK_MODE = True


async def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
    """
    Call the available LLM backend asynchronously.
    Priority: Gemini → Anthropic Claude → OpenAI GPT-4o → Fallback/Mock.
    Catches network/auth errors gracefully and falls back.
    """
    if MOCK_MODE:
        await asyncio.sleep(0)
        return "[]"

    if GEMINI_API_KEY:
        try:
            return await _call_gemini(system_prompt, user_prompt, max_tokens)
        except Exception as exc:
            logger.warning(f"Gemini API request failed ({exc}). Trying next provider or fallback...")

    if ANTHROPIC_API_KEY:
        try:
            return await _call_anthropic(system_prompt, user_prompt, max_tokens)
        except Exception as exc:
            logger.warning(f"Anthropic API request failed ({exc}). Trying next provider or fallback...")

    if OPENAI_API_KEY:
        try:
            return await _call_openai(system_prompt, user_prompt, max_tokens)
        except Exception as exc:
            logger.warning(f"OpenAI API request failed ({exc}). Falling back to heuristic mode...")

    return "[]"


async def _call_gemini(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    """Call Google Gemini via the google-genai SDK."""
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore

        client = genai.Client(api_key=GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=f"{system_prompt}\n\n{user_prompt}",
            config=types.GenerateContentConfig(max_output_tokens=max_tokens),
        )
        return response.text or "[]"
    except ImportError:
        import google.generativeai as genai_old  # type: ignore
        import warnings
        warnings.filterwarnings("ignore", category=FutureWarning)
        genai_old.configure(api_key=GEMINI_API_KEY)
        model = genai_old.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=system_prompt,
            generation_config=genai_old.GenerationConfig(max_output_tokens=max_tokens),
        )
        response = await model.generate_content_async(user_prompt)
        return response.text or "[]"


async def _call_anthropic(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    import anthropic  # type: ignore

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model="claude-3-5-haiku-20241022",
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return message.content[0].text or "[]"


async def _call_openai(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    from openai import AsyncOpenAI  # type: ignore

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content or "[]"


# ─────────────────────────────────────────────
# Finding parser — parse LLM JSON output into Finding objects
# ─────────────────────────────────────────────

def parse_findings(raw_text: str, agent_name: str) -> list[Finding]:
    """
    Parse a list of Finding dicts from raw LLM text.
    Handles: clean JSON array, JSON embedded in markdown fences, or empty/error.
    """
    # Strip markdown code fences if present
    text = raw_text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if fence_match:
        text = fence_match.group(1).strip()

    try:
        data = json.loads(text)
        if not isinstance(data, list):
            data = [data]
        findings = []
        for item in data:
            if isinstance(item, dict):
                item.setdefault("agent", agent_name)
                try:
                    findings.append(Finding(**item))
                except Exception:
                    pass
        return findings
    except (json.JSONDecodeError, ValueError):
        return []


def make_result(
    run_id: str,
    agent_name: str,
    findings: list[Finding],
    started: datetime,
    duration_ms: int,
    status: str = "done",
    error: str | None = None,
) -> SubagentResult:
    """Create and populate a SubagentResult from raw findings."""
    result = SubagentResult(
        run_id=run_id,
        agent_name=agent_name,
        status=status,
        started_at=started,
        completed_at=datetime.now(timezone.utc),
        duration_ms=duration_ms,
        error=error,
    )
    result.set_findings(findings)
    return result
