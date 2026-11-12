const COUNTERS = {
  'agent.task.started': 'tasks',
  'tool.read.completed': 'read',
  'tool.edit.completed': 'edit',
  'tool.command.completed': 'cmd',
  'tool.web.completed': 'web',
};

export function countActivity(stats, session, eventType) {
  const key = COUNTERS[eventType];
  if (!key) return false;
  stats[key] = (stats[key] || 0) + 1;
  if (key === 'tasks') stats.prompts = stats.tasks;
  if (key !== 'tasks' && session?.counts) session.counts[key] = (session.counts[key] || 0) + 1;
  return true;
}
