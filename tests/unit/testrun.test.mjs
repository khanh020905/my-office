import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testRunner } from '../../server/testrun.mjs';

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
