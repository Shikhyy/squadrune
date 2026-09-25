"""
Unit tests for Squadrune Security and Architecture subagents.
"""
import unittest
import asyncio
from app.agents import security, architecture

class TestInitialAgents(unittest.IsolatedAsyncioTestCase):

    async def test_security_subagent(self):
        diff = """--- a/auth.py\n+++ b/auth.py\n+api_key = "AIzaSyDummySecretKey1234567"\n+import md5\n"""
        res = await security.analyze("test-1", diff)
        self.assertEqual(res.agent_name, "security")
        self.assertEqual(res.severity, "high")

    async def test_architecture_subagent(self):
        diff = """--- a/service.py\n+++ b/service.py\n+raise Exception("generic error")\n"""
        res = await architecture.analyze("test-2", diff)
        self.assertEqual(res.agent_name, "architecture")

if __name__ == "__main__":
    unittest.main()
