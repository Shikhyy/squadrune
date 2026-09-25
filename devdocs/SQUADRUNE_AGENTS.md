# Squadrune — Agents

Squadrune's whole value proposition lives in this file. Each agent below has a narrow job, a strict input/output contract, and no knowledge of the others — the Orchestrator is the only thing that sees the whole picture.

## Orchestrator Agent

**Role**: Receives a diff + context, dispatches the four subagents in parallel, waits for all results, hands them to the Synthesis Agent, returns the final verdict.
**This is the "Agent Mode" piece** the brief asks for explicitly — it manages a multi-step process end to end, not a single coding task.
**Input**: `{ diff, repo_context_files, spec_doc_ref }`
**Output**: a `Verdict` object (see Backend & Schema doc)
**Failure handling**: if one subagent fails or times out, the orchestrator proceeds with the remaining results and flags the missing dimension in the final verdict rather than failing the whole run — partial signal beats no signal.

## Security Subagent

**Role**: Scans the diff for hardcoded secrets, obviously unsafe patterns (unescaped input into shell/SQL, disabled cert verification, etc.)
**Input**: diff only — deliberately narrow scope
**Output**: list of findings, each with severity and the offending line
**Prompt strategy**: few-shot examples of clear positives/negatives to keep it from flagging style issues as "security" — precision matters more than recall here, since false positives erode trust fast

## Architecture Consistency Subagent

**Role**: Checks whether the change follows patterns already established elsewhere in the repo (naming, error handling style, layering conventions)
**Input**: diff + 2–3 related files pulled from the repo (this is the piece that needs actual repo context, not just the diff in isolation)
**Output**: findings where the change diverges from an established pattern, with a pointer to the file it diverges from
**Note**: this is the subagent most worth cutting first under time pressure — it adds real value but isn't the differentiator; Spec Compliance is.

## Spec Compliance Subagent — the Document Understanding piece

**Role**: Reads the linked spec/ticket document and checks whether the diff actually implements what was asked
**Input**: diff + spec doc (markdown or PDF, extracted to plain text first)
**Output**: findings where a stated requirement isn't addressed, or where the implementation contradicts something the spec says
**Why this matters most for the brief**: this is the literal "document understanding" capability named in the challenge — make sure your submission writeup points at this subagent specifically when explaining that requirement.

## Test Coverage Subagent

**Role**: Checks whether new logic branches introduced by the diff have corresponding test file changes
**Input**: diff + list of test files in the repo
**Output**: findings flagging untested new code paths
**Scope note**: for the hackathon build, this can be a heuristic check (does a matching test file get touched at all) rather than true coverage analysis — full coverage tooling is a rabbit hole you don't have hours for.

## Synthesis Agent

**Role**: Takes all four `SubagentResult` objects and produces one ranked, human-readable verdict — this is what turns four disconnected reports into a single decision
**Input**: list of `SubagentResult`
**Output**: `Verdict { status, summary, findings_by_severity }`
**Prompt strategy**: explicitly instruct it to deduplicate overlapping findings and rank by real-world severity, not just list everything in order received — a synthesis that just concatenates isn't synthesis.

## Integration Contract for External Agents (e.g., Bob 2.0)

Any coding agent can call `POST /verify` mid-workflow with the same `{ diff, repo_context_files, spec_doc_ref }` shape the dashboard uses, and gets back the same structured `Verdict` JSON — synchronously, no dashboard dependency. This is the concrete mechanism behind the "agent-focused" positioning: Squadrune isn't just observed by developers, it's *usable by* other agents as a verification step before they report a task complete.

```json
// Example /verify response
{
  "status": "needs_changes",
  "summary": "2 of 4 checks passed. Spec gap and missing test found.",
  "findings": [
    { "agent": "spec_compliance", "severity": "high", "description": "..." },
    { "agent": "test_coverage", "severity": "medium", "description": "..." }
  ]
}
```
