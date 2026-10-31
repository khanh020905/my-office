import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testCounts, testRunner } from '../../server/testrun.mjs';

test('names the test runner a command starts', () => {
  assert.equal(testRunner('npm test'), 'npm test');
  assert.equal(testRunner('pnpm run test:unit -- --watch=false'), 'pnpm test:unit');
  assert.equal(testRunner('cd app && CI=1 npx vitest run src/cart'), 'vitest');
  assert.equal(testRunner('npx playwright test -g "@smoke"'), 'playwright');
  assert.equal(testRunner('node --test'), 'node --test');
  assert.equal(testRunner('node --experimental-vm-modules --test tests/'), 'node --test');
  assert.equal(testRunner('python3 -m pytest -q tests/test_orders.py'), 'pytest');
  assert.equal(testRunner('uv run pytest -x'), 'pytest');
  assert.equal(testRunner('timeout 120 go test ./...'), 'go test');
  assert.equal(testRunner('cargo nextest run'), 'cargo nextest');
  assert.equal(testRunner('./gradlew clean test'), 'gradle');
  assert.equal(testRunner('bundle exec rspec spec/models'), 'rspec');
  assert.equal(testRunner('php artisan test --parallel'), 'php artisan test');
  assert.equal(testRunner('npm test 2>&1 | tail -20'), 'npm test');
  assert.equal(testRunner('npm run build && npm test'), 'npm test');
});

test('leaves alone commands that only mention a test', () => {
  assert.equal(testRunner('echo "npm test"'), null);
  assert.equal(testRunner('npm test --help'), null);
  assert.equal(testRunner('npx vitest --version'), null);
  assert.equal(testRunner('pytest --collect-only'), null);
  assert.equal(testRunner('npm install'), null);
  assert.equal(testRunner('grep -r "go test" .'), null);
  assert.equal(testRunner('cat tests/unit/cart.test.ts'), null);
  assert.equal(testRunner('git commit -m "fix the test"'), null);
  assert.equal(testRunner(''), null);
});

test('reads how many tests passed and failed from the summary a runner prints', () => {
  assert.deepEqual(testCounts('ℹ tests 31\nℹ suites 0\nℹ pass 30\nℹ fail 1\nℹ cancelled 0'), { pass: 30, fail: 1 });
  assert.deepEqual(testCounts('# tests 12\n# pass 12\n# fail 0'), { pass: 12, fail: 0 });
  assert.deepEqual(testCounts(' Test Files  3 passed (3)\n      Tests  48 passed (48)\n   Start at  10:01:02'), { pass: 48, fail: 0 });
  assert.deepEqual(testCounts(' Test Files  1 failed | 2 passed (3)\n      Tests  2 failed | 46 passed (48)'), { pass: 46, fail: 2 });
  assert.deepEqual(testCounts('Test Suites: 1 failed, 4 passed, 5 total\nTests:       1 failed, 29 passed, 30 total'), { pass: 29, fail: 1 });
  assert.deepEqual(testCounts('============ 1 failed, 29 passed in 0.42s ============'), { pass: 29, fail: 1 });
  assert.deepEqual(testCounts('  1 failed\n    [chromium] › cart.spec.ts:12:3 › checkout\n  29 passed (1.2m)'), { pass: 29, fail: 1 });
  assert.deepEqual(testCounts('test result: ok. 17 passed; 0 failed; 0 ignored'), { pass: 17, fail: 0 });
  assert.deepEqual(testCounts('  14 passing (2s)\n  2 failing'), { pass: 14, fail: 2 });
  assert.deepEqual(testCounts('Finished in 0.3 seconds\n30 examples, 1 failure'), { pass: 29, fail: 1 });
  assert.deepEqual(testCounts('OK (30 tests, 52 assertions)'), { pass: 30, fail: 0 });
  assert.deepEqual(testCounts('Tests: 30, Assertions: 52, Failures: 2, Errors: 1.'), { pass: 27, fail: 3 });
  assert.deepEqual(testCounts('=== RUN   TestA\n--- PASS: TestA (0.00s)\n--- FAIL: TestB (0.00s)\nFAIL'), { pass: 1, fail: 1 });
  assert.equal(testCounts('Exit code 1\nError: Cannot find module "express"'), null);
  assert.equal(testCounts(''), null);
});
