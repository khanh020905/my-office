// Production analytics (spec §8.6) from data the office already has: the project scan (files) and the live agent
// model (hook events). A metric with no source is reported as null with the reason, never estimated.
const UNAVAILABLE = {
  tokens: 'Claude Code hooks do not report token usage',
  cost: 'no token data, so no cost estimate',
  renderDuration: 'the renderer writes no start time; only the finish time (MP4 mtime) is known',
};

export function analytics(projects, agents) {
  const ps = projects || [];
  const per = ps.map((p) => {
    const times = p.artifacts.map((a) => a.at).filter((t) => t > 0);
    const renders = p.artifacts.filter((a) => a.kind === 'render');
    return {
      project: p.id, type: p.type,
      // first to last file the project wrote: wall-clock span, not working time
      spanMs: times.length > 1 ? Math.max(...times) - Math.min(...times) : null,
      renders: renders.length, lastRenderAt: renders.length ? Math.max(...renders.map((r) => r.at)) : null,
      revisions: (p.revisions || []).length,
      qaTotal: p.qa?.total ?? null, recommendation: p.qa?.recommendation ?? null, severities: p.qa?.severities || {},
    };
  });
  const reviewed = per.filter((x) => x.recommendation);
  const byRec = {}, sev = {};
  for (const x of reviewed) byRec[x.recommendation] = (byRec[x.recommendation] || 0) + 1;
  for (const x of per) for (const [k, n] of Object.entries(x.severities)) sev[k] = (sev[k] || 0) + n;
  const passed = reviewed.filter((x) => /^PUBLISH\b/i.test(x.recommendation)).length;

  const as = agents || [], states = {};
  for (const a of as) states[a.state] = (states[a.state] || 0) + 1;
  const sum = (k) => as.reduce((n, a) => n + (a[k] || 0), 0);
  return {
    projects: per,
    qa: { reviewed: reviewed.length, passed, passRate: reviewed.length ? passed / reviewed.length : null,
      passRule: 'recommendation starts with PUBLISH', byRecommendation: byRec, severities: sev },
    revisions: per.reduce((n, x) => n + x.revisions, 0),
    agents: { total: as.length, states, active: (states.running || 0) + (states.reviewing || 0),
      completed: states.done || 0, failed: states.failed || 0, tools: sum('tools'), toolFailures: sum('fails'), files: sum('files'),
      note: 'since the office started recording; subagents count separately from their session' },
    tokens: null, cost: null, renderDuration: null, unavailable: UNAVAILABLE,
  };
}
