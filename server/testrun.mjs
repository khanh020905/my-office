// Which test runner a shell command starts, if any: the office's test board lights up for it (an amber lamp while it runs,
// green or red after). Each part of a chained command (&&, ||, ;, a new line) is looked at from its start, past an
// environment assignment (CI=1), a wrapper (timeout 60, time, nice) and a launcher (npx, uv run, bundle exec…), so
// `cd app && CI=1 npx vitest run` counts and `echo "npm test"` or `npm test --help` don't.

const RUNNERS = [
  [/^(npm|pnpm|yarn|bun)\s+(?:run\s+)?(test(?::[\w:.-]+)?)(?=\s|$)/, (m) => `${m[1]} ${m[2]}`],
  [/^(vitest|jest|mocha|ava|tap|karma|jasmine)(?=\s|$)/, (m) => m[1]],
  [/^(playwright|cypress)\s+(test|run)(?=\s|$)/, (m) => m[1]],
  [/^node\s+(?:\S+\s+)*?--test(?=[\s=]|$)/, () => 'node --test'],
  [/^(?:deno|bun)\s+test(?=\s|$)/, (m) => m[0]],
  [/^(?:py\.test|pytest)(?=\s|$)/, () => 'pytest'],
  [/^python[\d.]*\s+-m\s+(pytest|unittest)(?=\s|$)/, (m) => m[1]],
  [/^go\s+test(?=\s|$)/, () => 'go test'],
  [/^cargo\s+(test|nextest)(?=\s|$)/, (m) => `cargo ${m[1]}`],
  [/^(?:\.\/)?(mvnw?|gradlew?)\s+(?:\S+\s+)*?test(?=\s|$)/, (m) => m[1].replace(/w$/, '')],
  [/^(rspec|phpunit|pest)(?=\s|$)/, (m) => m[1]],
  [/^(?:vendor\/bin\/|\.\/vendor\/bin\/)(phpunit|pest)(?=\s|$)/, (m) => m[1]],
  [/^(?:php\s+artisan|rails|rake|mix|dotnet|swift|flutter|dart)\s+test(?=\s|$)/, (m) => m[0].replace(/\s+/g, ' ')],
  [/^ctest(?=\s|$)/, () => 'ctest'],
  [/^make\s+(test|check)(?=\s|$)/, (m) => `make ${m[1]}`],
];
const PREFIX = /^(?:(?:\w+=\S*|timeout\s+\S+|time|nice|command|exec|npx|pnpx|bunx|pnpm\s+(?:exec|dlx)|yarn\s+dlx|uv\s+run|poetry\s+run|pipenv\s+run|bundle\s+exec)\s+)+/;

/** The runner a command starts ('vitest', 'npm test', 'pytest'…), or null when it starts none. */
export function testRunner(command) {
  for (const part of String(command || '').split(/\s*(?:&&|\|\||;|\n)\s*/)) {
    const seg = part.trim().replace(PREFIX, '');
    if (!seg || /(?:^|\s)(?:--help|-h|--version|--list|--collect-only)(?=\s|$)/.test(seg)) continue;
    for (const [re, name] of RUNNERS) { const m = re.exec(seg); if (m) return name(m); }
  }
  return null;
}
