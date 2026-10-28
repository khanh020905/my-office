import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNetTcp, parseMeminfo, parseStat } from '../../server/platform/linux.mjs';
import { parseReading } from '../../server/platform/win32.mjs';
import { cpuFromDelta, parseEtime } from '../../server/platform/shared.mjs';

test('Linux: a /proc/<pid>/stat line, a name with spaces and brackets included', () => {
  const line = '4242 (next-server (v16)) S 4200 4200 4200 0 -1 4194560 23 0 0 0 150 30 0 0 20 0 11 0 987654 1234567 25600 18446744073709551615';
  const s = parseStat(line);
  assert.equal(s.name, 'next-server (v16)');
  assert.equal(s.ppid, 4200);
  assert.equal(s.pgid, 4200);
  assert.equal(s.ticks, 180);
  assert.equal(s.startTicks, 987654);
  assert.equal(s.rssPages, 25600);
  assert.equal(parseStat('garbage'), null);
});

test('Linux: /proc/meminfo and /proc/net/tcp', () => {
  const m = parseMeminfo('MemTotal:       16000000 kB\nMemFree:          500000 kB\nMemAvailable:    4000000 kB\nSwapTotal:       2000000 kB\nSwapFree:        1500000 kB\n');
  assert.equal(m.total, 16000000 * 1024);
  assert.equal(m.available, 4000000 * 1024);
  assert.equal(m.swapTotal - m.swapFree, 500000 * 1024);
  const rows = parseNetTcp([
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 00000000:1435 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 31337 1 0000000000000000 100 0 0 10 0',
    '   1: 0100007F:1435 0100007F:C350 01 00000000:00000000 00:00000000 00000000  1000        0 31338 1 0000000000000000 20 4 30 10 -1',
  ].join('\n'));
  assert.deepEqual(rows.map((r) => [r.state, r.port, r.inode]), [['0A', 5173, '31337'], ['01', 5173, '31338']]);
});

test('Windows: one PowerShell reading (processes, page file, sockets)', () => {
  const now = Date.parse('2026-10-27T10:00:00Z');
  const json = JSON.stringify({
    p: [
      { i: 4, pp: 0, n: 'System', x: null, c: null, w: 1024, t: 0, s: 0, se: 0 },
      { i: 9120, pp: 8800, n: 'node.exe', x: 'C:\\Program Files\\nodejs\\node.exe', c: '"node.exe" next dev', w: 250000000, t: 52000000, s: now / 1000 - 600, se: 1 },
    ],
    fa: 4096, fu: 512,
    t: [{ l: 3000, s: 2, o: 9120 }, { l: 3000, s: 5, o: 9120 }, { l: 51000, s: 5, o: 7000 }],
  });
  const r = parseReading(json, now);
  const node = r.procs.get(9120);
  assert.equal(node.comm, 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(node.args, '"node.exe" next dev');
  assert.equal(node.pgid, 9120);   // no process groups on Windows
  assert.equal(node.uid, 1);       // its session
  assert.equal(node.cpuSec, 5.2);  // 100 ns units
  assert.equal(node.up, 600);
  assert.equal(r.pageTotal, 4096 * 1024 ** 2);
  assert.equal(r.tcp.filter((t) => t.state === 2).length, 1);
  // a reading with a single process comes back as an object, not a list
  assert.equal(parseReading(JSON.stringify({ p: { i: 1, pp: 0, n: 'x', s: 0 }, t: { l: 80, s: 2, o: 1 } }), now).procs.size, 1);
  assert.equal(parseReading('not json'), null);
});

test('shared: ps times, and CPU % from two readings', () => {
  assert.equal(parseEtime('1-02:03:04'), 86400 + 7384);
  assert.equal(parseEtime('05:06'), 306);
  const state = { prev: null, at: 0 }, a = new Map([[1, { pid: 1, start: 100, cpuSec: 10 }]]);
  cpuFromDelta(state, a);
  assert.equal(a.get(1).cpu, 0);   // nothing to compare with yet
  state.at -= 2000;                // two seconds later, one more CPU second used: 50 %
  const b = new Map([[1, { pid: 1, start: 100, cpuSec: 11 }]]);
  cpuFromDelta(state, b);
  assert.equal(b.get(1).cpu, 50);
});
