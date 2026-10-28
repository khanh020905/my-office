import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../../server/redact.mjs';

test('masks bearer tokens, API keys and GitHub tokens', () => {
  assert.doesNotMatch(redact('curl -H "Authorization: Bearer abc.def.ghi"'), /abc\.def\.ghi/);
  assert.equal(redact('export KEY=sk-live_1234567890abcdef'), 'export KEY=•••');
  assert.match(redact('git clone https://ghp_ABCDEFGHIJ1234567890@github.com/x/y'), /•••/);
  assert.doesNotMatch(redact('token: hunter2'), /hunter2/);
});

test('masks credentials in URLs and IP addresses', () => {
  assert.equal(redact('postgres://admin:s3cret@db.local/app'), 'postgres://•••@db.local/app');
  assert.equal(redact('ssh root@143.198.87.247'), 'ssh root@•••');
});

test('keeps ordinary text', () => {
  assert.equal(redact('npm run build && git status'), 'npm run build && git status');
  assert.equal(redact(null), '');
});
