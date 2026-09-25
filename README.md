# ⚡ SQUADRUNE

> **The Parallel Multi-Agent Code Verification Layer**  
> *Four specialized AI subagents analyzing every pull request concurrently — delivering rigorous, sub-2s verdicts before human review.*

## 🎯 Architecture Overview

```
                        ┌─── 🔒 Security Agent (Secrets, crypto, injections)
                        ├─── 🏗️ Architecture Agent (Conventions, AppError, layering)
    Unified Git Diff ───┼─── 📄 Spec Compliance Agent (Document understanding vs PRD)
                        └─── 🧪 Test Coverage Agent (New paths, missing assertions)
                                    │
                                    ▼ (Concurrently via asyncio.gather in < 2s)
                        ⚙️ Synthesis & Deduplication Agent
                                    │
                                    ▼
                         🏁 Ranked Verdict (PASS | NEEDS CHANGES | BLOCKED)
```

### Core Tenets
1. **Sub-2s Execution**: All agents run in parallel via `asyncio.gather`.
2. **Document Understanding**: Spec compliance subagent analyzes markdown & PDF requirements.
3. **Cross-Agent Synthesis**: De-duplicates overlapping findings and prioritizes severity.
4. **Agent-to-Agent Ready**: Built-in support for MCP, Python and Node.js SDKs.

*Phase 1 Backend Foundation in progress.*
