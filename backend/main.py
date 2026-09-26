"""
main.py — FastAPI application entry point

Registers all routers, initializes the database on startup,
and configures logging.
"""
from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import create_db_and_tables
from app.middleware.rate_limit import RateLimitMiddleware
from app.routers import runs, verify, ws

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("squadrune")

# ─────────────────────────────────────────────
# App factory
# ─────────────────────────────────────────────
app = FastAPI(
    title="Squadrune",
    description=(
        "Parallel multi-agent code review. "
        "Four specialized agents analyze a diff concurrently, "
        "then a synthesis step merges their findings into one ranked verdict."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Rate limiting — must be added before CORS so it fires first
app.add_middleware(RateLimitMiddleware)

# Allow the Next.js frontend and any local dev clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Startup
# ─────────────────────────────────────────────
@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()
    from app.agents.base import MOCK_MODE
    mode = "MOCK" if MOCK_MODE else "LLM"
    logger.info(f"Squadrune started — agent mode: {mode}")


# ─────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────
app.include_router(runs.router)
app.include_router(verify.router)
app.include_router(ws.router)


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "squadrune"}
