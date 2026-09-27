const assert = require('assert');
const { verifyDiff, checkHealth, runLocalHeuristicVerification } = require('./index.js');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('Running squadrune npm package tests...');

  // 1. Test clean diff passes
  const cleanDiff = `--- a/math.js
+++ b/math.js
@@ -1,3 +1,5 @@
+function add(a, b) {
+  return a + b;
+}
`;
  const cleanRes = await verifyDiff({ diff: cleanDiff });
  assert.strictEqual(cleanRes.status, 'pass', 'Clean diff should pass');
  assert.strictEqual(cleanRes.findings.length, 0, 'Clean diff should have 0 findings');
  console.log('  ✓ Clean diff verification passed');

  // 2. Test sample diff flags issues
  const sampleDiffPath = path.join(__dirname, 'sample', 'sample.diff');
  if (fs.existsSync(sampleDiffPath)) {
    const sampleDiff = fs.readFileSync(sampleDiffPath, 'utf8');
    const sampleRes = await verifyDiff({ diff: sampleDiff });
    assert.strictEqual(sampleRes.status, 'blocked', 'Sample diff should be blocked');
    assert.ok(sampleRes.findings.length >= 2, 'Sample diff should have multiple findings');
    console.log(`  ✓ Sample diff verification blocked (${sampleRes.findings.length} findings)`);
  }

  console.log('✓ All npm package tests passed successfully!\n');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
