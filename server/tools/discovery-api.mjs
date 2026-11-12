import { validateGitHubUrl, inspectRepositorySnapshot } from './github-inspector.mjs';

/**
 * Handles API routes for GitHub Tool Discovery & Static Inspection.
 */
export async function handleToolDiscoveryRoutes(req, res, {
  url,
  registry,
  isLoopback,
  sameOriginOf,
  authorized,
  readJson,
  json,
  customInspector = null,
} = {}) {
  // 1. POST /api/tools/discover — Trigger static inspection of a repository
  if (url.pathname === '/api/tools/discover' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 256_000);
      const targetUrl = String(body?.url || '').trim();

      const urlVal = validateGitHubUrl(targetUrl);
      if (!urlVal.ok) {
        json(res, 400, { ok: false, error: urlVal.error });
        return true;
      }

      // Allow passing a custom or test inspector
      const inspector = customInspector || inspectRepositorySnapshot;

      // Provide snapshot or fetch metadata
      const inspectionResult = await inspector({
        url: targetUrl,
        fileList: Array.isArray(body?.fileList) ? body.fileList : ['README.md', 'package.json'],
        readFile: (filePath) => (body?.files && body.files[filePath]) || '',
        metadata: body?.metadata || {},
      });

      if (!inspectionResult.ok) {
        json(res, 400, { ok: false, error: inspectionResult.error });
        return true;
      }

      json(res, 200, { ok: true, inspection: inspectionResult.inspection });
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 2. POST /api/tools/discovered — Save a discovered candidate tool to the Universal Tool Registry
  if (url.pathname === '/api/tools/discovered' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 512_000);
      const candidateTool = body?.candidate_tool;
      if (!candidateTool || !candidateTool.tool_id) {
        json(res, 400, { ok: false, error: 'invalid_candidate_tool' });
        return true;
      }

      // Ensure lifecycle status stays in discovery phase
      candidateTool.installation_status = 'discovered';
      candidateTool.enabled_status = false;

      const registered = registry.registerTool(candidateTool);
      if (!registered.ok) {
        json(res, 400, { ok: false, errors: registered.errors });
        return true;
      }

      json(res, 201, { ok: true, tool: registered.tool });
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 3. GET /api/tools/discovered — List all tools currently in discovery states
  if (url.pathname === '/api/tools/discovered' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    const all = registry.listTools();
    const discovered = all.filter((t) =>
      ['discovered', 'under_review', 'pending_approval'].includes(t.installation_status)
    );
    json(res, 200, { ok: true, tools: discovered });
    return true;
  }

  // 4. GET /api/tools — List all tools in registry
  if (url.pathname === '/api/tools' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    const category = url.searchParams.get('category');
    const protocol = url.searchParams.get('protocol');
    const agent = url.searchParams.get('agent');
    const search = url.searchParams.get('search');
    const enabled = url.searchParams.get('enabled');

    const tools = registry.listTools({
      category: category || undefined,
      protocol: protocol || undefined,
      agent: agent || undefined,
      search: search || undefined,
      enabled: enabled != null ? enabled === 'true' : undefined,
    });

    json(res, 200, { ok: true, tools, count: tools.length });
    return true;
  }

  // 5. GET /api/tools/categories — List all categories
  if (url.pathname === '/api/tools/categories' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    json(res, 200, { ok: true, categories: registry.listCategories() });
    return true;
  }

  return false;
}

