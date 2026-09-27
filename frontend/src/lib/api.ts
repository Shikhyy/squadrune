// API client — talks directly to the FastAPI backend
// NEXT_PUBLIC_API_URL must be set in .env.local (default: http://localhost:8000)

import type { ReviewPreset, RunStatus, Verdict } from './types'

const API_BASE =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')
    : 'http://localhost:8000'

const WS_BASE =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000')
    : 'ws://localhost:8000'

const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? 'squadrune-dev'

export const FALLBACK_PRESETS: ReviewPreset[] = [
  {
    id: 'vulnerable-auth',
    title: 'Vulnerable Auth Module (Planted Issues)',
    badge: 'Security & Spec Flaws',
    expected: 'blocked',
    specPath: '../sample/sample_spec.md',
    description: 'Planted hardcoded secret key, password hash downgrade to SHA-256, AppError violation, and zero tests for validate_token().',
    diff: `--- a/auth.py
+++ b/auth.py
@@ -20,14 +22,22 @@ class AppError(Exception):
         super().__init__(f"[{code}] {message}")

+# ISSUE 1 — SECURITY: Hardcoded secret key (violates FR-4)
+SECRET_KEY = "hardcoded-jwt-secret-abc123"

 def hash_password(password: str) -> str:
-    import bcrypt
-    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()
+    import hashlib
+    # ISSUE 3 — SPEC COMPLIANCE: Using SHA-256 instead of bcrypt (violates FR-1)
+    return hashlib.sha256(password.encode()).hexdigest()

+# ISSUE 2 — TEST COVERAGE: New function validate_token() has NO corresponding test
+# ISSUE 4 — ARCHITECTURE: Raises raw ValueError instead of AppError (violates FR-3)
+def validate_token(token: str) -> dict:
+    parts = token.split(":")
+    if len(parts) != 3:
+        raise ValueError("Invalid token format")
+    return {"user_id": parts[0]}`,
  },
  {
    id: 'clean-auth',
    title: 'Compliant Auth Module (All Checks Pass)',
    badge: 'Production Ready',
    expected: 'pass',
    specPath: '../sample/sample_spec.md',
    description: 'Loads secrets from env, uses bcrypt work-factor 12, AppError(code="AUTH_001"), and comprehensive test suite in tests/test_auth.py.',
    diff: `--- a/auth.py
+++ b/auth.py
@@ -10,6 +10,7 @@
 import os
+import bcrypt
 from datetime import datetime

-SECRET_KEY = "hardcoded-jwt-secret-abc123"
+SECRET_KEY = os.getenv("JWT_SECRET_KEY")

 def hash_password(password: str) -> str:
-    return hashlib.sha256(password.encode()).hexdigest()
+    salt = bcrypt.gensalt(rounds=12)
+    return bcrypt.hashpw(password.encode(), salt).decode()

 def validate_token(token: str) -> dict:
     parts = token.split(":")
     if len(parts) != 3:
-        raise ValueError("Invalid token")
+        raise AppError(code="AUTH_001", message="Invalid token structure")
     return {"user_id": parts[0]}
--- a/tests/test_auth.py
+++ b/tests/test_auth.py
@@ -15,3 +15,8 @@
+def test_validate_token_valid():
+    assert validate_token("123:3600:sig")["user_id"] == "123"
+
+def test_validate_token_tampered():
+    with pytest.raises(AppError):
+        validate_token("tampered")`,
  },
  {
    id: 'missing-tests',
    title: 'Untested Payment Gateway Logic',
    badge: 'Missing Tests',
    expected: 'needs_changes',
    specPath: '../sample/sample_spec.md',
    description: 'New critical financial routines added without unit test verification.',
    diff: `--- a/services/payment.py
+++ b/services/payment.py
@@ -1,5 +1,12 @@
+async def process_instant_payout(account_id: str, amount_usd: float) -> dict:
+    # Critical financial path with zero test suite additions
+    gateway = get_stripe_client()
+    return await gateway.transfers.create(amount=int(amount_usd * 100), destination=account_id)
+
+async def reverse_dispute(charge_id: str) -> bool:
+    return await DisputeService.reverse(charge_id)`,
  },
  {
    id: 'architecture-violation',
    title: 'Layering & Hygiene Defects',
    badge: 'Architecture Flaws',
    expected: 'needs_changes',
    specPath: '../sample/sample_spec.md',
    description: 'Direct localhost URL embedded in source code, leftover debug statements, and generic raw Exception.',
    diff: `--- a/api/routes.py
+++ b/api/routes.py
@@ -10,3 +10,9 @@
+@router.post("/internal/sync")
+def sync_user():
+    print("DEBUG: entering sync user internal endpoint")
+    res = requests.get("http://localhost:8080/data")
+    if not res.ok:
+        raise Exception("Database sync dropped")
+    return res.json()`,
  },
]

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body.slice(0, 120)}` : ''}`)
  }
  return res.json() as Promise<T>
}

export async function checkBackendHealth(): Promise<{ online: boolean; service?: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json()
      return { online: true, service: data.service }
    }
  } catch {
    // Offline or unreachable
  }
  return { online: false }
}

export async function fetchPresets(): Promise<ReviewPreset[]> {
  try {
    return await fetchJSON<ReviewPreset[]>('/runs/meta/presets')
  } catch {
    return FALLBACK_PRESETS
  }
}

export async function postRun(body: {
  diff: string
  spec_doc_ref?: string
  repo_context_files?: string[]
}) {
  return fetchJSON<{ run_id: string; status: string; message: string }>('/runs', {
    method: 'POST',
    body: JSON.stringify({ ...body, triggered_by: 'dashboard' }),
  })
}

export async function getRun(runId: string): Promise<RunStatus> {
  return fetchJSON<RunStatus>(`/runs/${runId}`)
}

export async function listRuns(): Promise<RunStatus[]> {
  return fetchJSON<RunStatus[]>('/runs')
}

export function openRunStream(runId: string): WebSocket {
  if (typeof window === 'undefined') throw new Error('WebSocket only available in browser')
  return new WebSocket(`${WS_BASE}/runs/${runId}/stream`)
}
