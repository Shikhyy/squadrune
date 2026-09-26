# ⚡ SQUADRUNE

> **The Parallel Multi-Agent Code Verification Layer**  
> *Four specialized AI subagents analyzing every pull request concurrently — delivering rigorous, sub-2s verdicts before human review.*

## ⚡ Concurrency Proof

Running `squadrune demo` demonstrates deterministic parallel execution:

```
─────────────────────── Concurrency Proof — Agent Timing ───────────────────────
╭─────────────┬──────────────────────┬─────────────────────┬──────────┬────────╮
│ Agent       │ Start (UTC)          │ End (UTC)           │ Duration │ Offset │
├─────────────┼──────────────────────┼─────────────────────┼──────────┼────────┤
│ security    │ 12:18:42.515         │ 12:18:43.717        │ 1200ms   │ +0ms   │
│ architecture│ 12:18:42.515         │ 12:18:44.017        │ 1501ms   │ +0ms   │
│ spec_compl  │ 12:18:42.515         │ 12:18:44.316        │ 1800ms   │ +0ms   │
│ test_cover  │ 12:18:42.515         │ 12:18:43.619        │ 1101ms   │ +0ms   │
╰─────────────┴──────────────────────┴─────────────────────┴──────────┴────────╯

Total wall-clock time: 1801ms (all agents dispatched concurrently at +0ms offset)
Sequential baseline: ~5600ms (~68% latency reduction).
```

## 🛠️ CLI Usage

```bash
./squadrune doctor                               # Run system health diagnostics
./squadrune demo                                 # Run live parallel review with concurrency waterfall
./squadrune review sample/sample.diff --spec ... # Interactive Rich terminal review
./squadrune git                                  # Review uncommitted changes in current repo
./squadrune verify sample/sample.diff            # Machine-readable JSON output (0=pass, 1=warn, 2=block)
./squadrune agent                                # Run autonomous self-correction loop simulation
./squadrune serve                                # Launch backend API server on :8000
```
