#!/usr/bin/env python3
"""
mcp_server.py — Model Context Protocol (MCP) Server for Squadrune

Exposes Squadrune as an MCP tool server over standard I/O (JSON-RPC 2.0).
Enables coding agents (Claude Desktop, Cursor, IBM Bob 2.0, Antigravity) to
call Squadrune natively via tool calls:
  - squadrune_verify_diff: Multi-agent parallel code review
  - squadrune_check_spec: Spec requirement extractor & validator
  - squadrune_list_squad_agents: Lists the 4 subagents & their capabilities
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.client import SquadruneVerifier

verifier = SquadruneVerifier()

TOOLS = [
    {
        "name": "squadrune_verify_diff",
        "description": (
            "Run parallel multi-agent verification on a code diff. Four specialized subagents "
            "(Security, Architecture, Spec Compliance, Test Coverage) analyze the diff concurrently "
            "and synthesize findings into a single ranked verdict (PASS, NEEDS_CHANGES, or BLOCKED)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "diff": {
                    "type": "string",
                    "description": "Unified git diff to verify.",
                },
                "spec_doc_ref": {
                    "type": "string",
                    "description": "Optional path to the requirements spec doc (markdown or PDF).",
                },
                "repo_context_files": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional list of repo file paths for architectural context.",
                },
            },
            "required": ["diff"],
        },
    },
    {
        "name": "squadrune_list_squad_agents",
        "description": "List the four subagents in the Squadrune verification squad and what each checks.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
]


def handle_request(req: dict) -> dict:
    method = req.get("method")
    req_id = req.get("id")

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS},
        }

    elif method == "tools/call":
        params = req.get("params", {})
        tool_name = params.get("name")
        args = params.get("arguments", {})

        if tool_name == "squadrune_verify_diff":
            diff = args.get("diff", "")
            spec_ref = args.get("spec_doc_ref")
            repo_files = args.get("repo_context_files", [])
            verdict = verifier.verify(diff=diff, spec_doc_ref=spec_ref, repo_context_files=repo_files)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(verdict, indent=2),
                        }
                    ],
                    "isError": verdict.get("status") == "blocked",
                },
            }

        elif tool_name == "squadrune_list_squad_agents":
            agents_info = {
                "squad": [
                    {"name": "security", "role": "Scans for hardcoded secrets, weak crypto, and injection risks."},
                    {"name": "architecture", "role": "Checks error handling standards, naming, and layering patterns."},
                    {"name": "spec_compliance", "role": "Parses linked PRD/spec doc to verify functional requirements."},
                    {"name": "test_coverage", "role": "Identifies untested new functions and missing test suites."},
                    {"name": "synthesis", "role": "Deduplicates cross-agent findings and ranks by real-world severity."},
                ]
            }
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(agents_info, indent=2)}],
                },
            }

        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"},
        }

    elif method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "squadrune-mcp", "version": "0.1.0"},
            },
        }

    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"Method not supported: {method}"},
    }


def main():
    """Stdio JSON-RPC loop for MCP."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            res = handle_request(req)
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()
        except Exception as exc:
            err_res = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": str(exc)},
            }
            sys.stdout.write(json.dumps(err_res) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()

# MCP protocol tools: squadrune_verify_diff and squadrune_list_squad_agents
