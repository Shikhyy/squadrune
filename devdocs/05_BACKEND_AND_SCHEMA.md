# Squadrune — Backend & Schema

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/runs` | POST | Start a new review run (human dashboard path). Body: `{ diff, repo_context_files[], spec_doc_url }` |
| `/runs/{id}` | GET | Fetch current state / final verdict of a run |
| `/runs/{id}/stream` | WebSocket | Live subagent status + log streaming to the dashboard |
| `/runs` | GET | List run history (for the Impact/History view) |
| `/verify` | POST | **Agent-facing endpoint.** Same pipeline as `/runs`, but synchronous, structured-JSON-only response, no UI dependency. This is what an external coding agent (Bob 2.0 or otherwise) calls mid-workflow |
| `/health` | GET | Basic liveness check |

Auth: a single `X-API-Key` header, validated against a static key for the hackathon (no need to build full auth).

## Data Models (Pydantic + SQLModel)

```python
class Run(SQLModel, table=True):
    id: str = Field(primary_key=True)
    status: str  # queued | running | done | failed
    diff_text: str
    spec_doc_ref: str | None
    verdict: str | None       # pass | needs_changes | blocked
    created_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    triggered_by: str         # "dashboard" | "agent_api"

class SubagentResult(SQLModel, table=True):
    id: str = Field(primary_key=True)
    run_id: str = Field(foreign_key="run.id")
    agent_name: str           # security | architecture | spec_compliance | test_coverage
    status: str               # running | done | failed
    findings: str             # JSON-encoded list of findings
    severity: str             # none | low | medium | high
    duration_ms: int

class Finding(BaseModel):    # nested inside SubagentResult.findings, not its own table
    description: str
    severity: str
    file_ref: str | None
    line_ref: int | None
```

## Orchestrator Logic (pseudocode)

```python
async def run_squad(diff: str, repo_files: list[str], spec_doc: str | None) -> Verdict:
    run = create_run_record(diff, spec_doc)
    broadcast(run.id, "run_started")

    tasks = [
        security_agent.analyze(diff),
        architecture_agent.analyze(diff, repo_files),
        spec_compliance_agent.analyze(diff, spec_doc),
        test_coverage_agent.analyze(diff, repo_files),
    ]

    # key line: this is the "parallel tasks" requirement, literally
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        save_subagent_result(run.id, result)
        broadcast(run.id, "subagent_done", result)

    verdict = await synthesis_agent.merge(results)
    update_run(run.id, verdict=verdict, status="done")
    broadcast(run.id, "verdict_ready", verdict)
    return verdict
```

## Subagent Contract

Every subagent — regardless of what it checks — implements the same interface, so adding a fifth subagent later (or a whole new squad for a different workflow) doesn't require touching the orchestrator:

```python
class Subagent(Protocol):
    name: str
    async def analyze(self, diff: str, **context) -> SubagentResult: ...
```

## Document Understanding Pipeline (Spec Compliance subagent specifically)

1. Accept a spec doc reference — either a `.md` file (read directly) or a `.pdf` (extract text via `pdfplumber`)
2. Chunk if long, extract stated requirements as a structured list via a single LLM pass
3. Compare the diff against that requirement list, flag: requirements not addressed, or implementation that contradicts a stated requirement
4. Return findings in the same `SubagentResult` shape as every other subagent — the document-understanding step is invisible plumbing to the orchestrator, which only ever sees the standard contract
