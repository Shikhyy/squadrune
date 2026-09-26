"""
Squadrune Comprehensive Backend Verification Test Suite
Tests:
- All 4 specialized subagents (Security, Architecture, Spec Compliance, Test Coverage)
- Synthesis deduplication & verdict generation
- Orchestrator parallel execution & timing
- Client SDK in-process execution fallback
"""
import unittest
import asyncio
import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.agents import security, architecture, spec_compliance, test_coverage, synthesis
from app.orchestrator import run_squad
from app.client import SquadruneVerifier

SAMPLE_DIFF_PATH = os.path.join(backend_dir, "..", "sample", "sample.diff")
SAMPLE_SPEC_PATH = os.path.join(backend_dir, "..", "sample", "sample_spec.md")

with open(SAMPLE_DIFF_PATH, "r", encoding="utf-8") as f:
    SAMPLE_DIFF = f.read()

with open(SAMPLE_SPEC_PATH, "r", encoding="utf-8") as f:
    SAMPLE_SPEC = f.read()


class TestSquadruneAgents(unittest.IsolatedAsyncioTestCase):

    async def test_security_agent_flags_sample_diff(self):
        result = await security.analyze("test-run-1", SAMPLE_DIFF, spec=SAMPLE_SPEC)
        self.assertEqual(result.agent_name, "security")
        self.assertEqual(result.severity, "high")
        findings = result.get_findings()
        self.assertTrue(len(findings) >= 2)
        descriptions = " ".join(f.description for f in findings)
        self.assertIn("SECRET_KEY", descriptions)
        self.assertIn("SHA-256", descriptions)

    async def test_architecture_agent_flags_sample_diff(self):
        result = await architecture.analyze("test-run-2", SAMPLE_DIFF, spec=SAMPLE_SPEC)
        self.assertEqual(result.agent_name, "architecture")
        self.assertIn(result.severity, ["medium", "high"])
        findings = result.get_findings()
        self.assertTrue(len(findings) >= 1)
        descriptions = " ".join(f.description for f in findings)
        self.assertIn("AppError", descriptions)

    async def test_spec_compliance_agent_flags_sample_diff(self):
        result = await spec_compliance.analyze("test-run-3", SAMPLE_DIFF, spec_doc=SAMPLE_SPEC)
        self.assertEqual(result.agent_name, "spec_compliance")
        self.assertEqual(result.severity, "high")
        findings = result.get_findings()
        self.assertTrue(len(findings) >= 2)

    async def test_test_coverage_agent_flags_sample_diff(self):
        result = await test_coverage.analyze("test-run-4", SAMPLE_DIFF, spec=SAMPLE_SPEC)
        self.assertEqual(result.agent_name, "test_coverage")
        self.assertEqual(result.severity, "high")
        findings = result.get_findings()
        self.assertTrue(len(findings) >= 1)
        descriptions = " ".join(f.description for f in findings)
        self.assertIn("validate_token", descriptions)

    async def test_synthesis_deduplication(self):
        sec = await security.analyze("test-run-5", SAMPLE_DIFF, spec=SAMPLE_SPEC)
        arch = await architecture.analyze("test-run-5", SAMPLE_DIFF, spec=SAMPLE_SPEC)
        spec = await spec_compliance.analyze("test-run-5", SAMPLE_DIFF, spec_doc=SAMPLE_SPEC)
        test = await test_coverage.analyze("test-run-5", SAMPLE_DIFF, spec=SAMPLE_SPEC)

        verdict = await synthesis.synthesize([sec, arch, spec, test])

        self.assertEqual(verdict.status, "blocked")
        self.assertTrue(len(verdict.findings) > 0)
        # Check that overlapping findings were merged
        merged_agents = [f.agent for f in verdict.findings if "+" in f.agent]
        self.assertTrue(len(merged_agents) >= 1)
        self.assertIn("security + spec_compliance", merged_agents)

    async def test_clean_diff_passes(self):
        clean_diff = """--- a/utils.py
+++ b/utils.py
@@ -1,3 +1,6 @@
+def add_two_numbers(a: int, b: int) -> int:
+    \"\"\"Sum two integers.\"\"\"
+    return a + b
--- a/test_utils.py
+++ b/test_utils.py
@@ -1,3 +1,6 @@
+def test_add_two_numbers():
+    assert add_two_numbers(1, 2) == 3
"""
        sec = await security.analyze("test-run-clean", clean_diff)
        arch = await architecture.analyze("test-run-clean", clean_diff)
        spec = await spec_compliance.analyze("test-run-clean", clean_diff)
        test = await test_coverage.analyze("test-run-clean", clean_diff)

        verdict = await synthesis.synthesize([sec, arch, spec, test])

        self.assertEqual(verdict.status, "pass")
        self.assertEqual(len(verdict.findings), 0)


class TestClientSDK(unittest.TestCase):

    def test_in_process_verification(self):
        verifier = SquadruneVerifier(base_url="http://invalid-unreachable-host:9999")
        verdict = verifier.verify(
            diff=SAMPLE_DIFF,
            spec_doc_ref=SAMPLE_SPEC_PATH,
        )
        self.assertEqual(verdict["status"], "blocked")
        self.assertTrue(len(verdict["findings"]) >= 3)
        self.assertIn("security", verdict["agents_completed"])


if __name__ == "__main__":
    unittest.main()
