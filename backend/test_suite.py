"""
Expanded test suite for all four specialized subagents.
"""
import unittest
import asyncio
from app.agents import security, architecture, spec_compliance, test_coverage

class TestAllAgents(unittest.IsolatedAsyncioTestCase):

    async def test_security(self):
        diff = """--- a/auth.py\n+++ b/auth.py\n+api_key = "AIzaSyDummySecretKey1234567"\n"""
        res = await security.analyze("test-1", diff)
        self.assertEqual(res.agent_name, "security")

    async def test_architecture(self):
        diff = """--- a/service.py\n+++ b/service.py\n+raise Exception("generic error")\n"""
        res = await architecture.analyze("test-2", diff)
        self.assertEqual(res.agent_name, "architecture")

    async def test_spec_compliance(self):
        diff = """--- a/auth.py\n+++ b/auth.py\n+token = "plain"\n"""
        res = await spec_compliance.analyze("test-3", diff, spec_doc="Must use JWT")
        self.assertEqual(res.agent_name, "spec_compliance")

    async def test_test_coverage(self):
        diff = """--- a/auth.py\n+++ b/auth.py\n+def new_func(): pass\n"""
        res = await test_coverage.analyze("test-4", diff)
        self.assertEqual(res.agent_name, "test_coverage")

if __name__ == "__main__":
    unittest.main()
