/**
 * Task Analyzer Service (Phase 6 Master Architecture §4).
 * Converts user requests into structured task specifications with explicit capability requirements,
 * side-effect requirements, risk levels, and completion criteria.
 * Provider-independent interface allowing future LLM-based analyzers.
 */

import crypto from 'node:crypto';

// Supported task domains
export const TASK_TYPES = new Set([
  'coding',
  'architecture_analysis',
  'research',
  'file_analysis',
  'document_processing',
  'video_media',
  'data_analysis',
  'browser_api',
  'general_cli',
  'multi_step',
]);

// Capability definitions and associated domain tags
const CAPABILITY_KEYWORDS = [
  // Coding
  {
    capability: 'code_generation',
    keywords: ['write code', 'create component', 'implement function', 'scaffold', 'generate code', 'create app'],
    patterns: [/(?:generate|write|implement|build|create)\s+(?:\w+\s+){0,3}code/i],
  },
  {
    capability: 'code_analysis',
    keywords: ['inspect code', 'review code', 'lint', 'typecheck', 'ast', 'syntax check', 'static analysis'],
    patterns: [/(?:inspect|review|analyze|check|audit)\s+(?:\w+\s+){0,3}code/i, /code\s+(?:analysis|review|inspection|quality)/i],
  },
  {
    capability: 'refactoring',
    keywords: ['refactor', 'restructure', 'clean up code', 'rename symbol', 'extract method'],
    patterns: [/refactor(?:\w+\s+){0,3}code/i],
  },
  {
    capability: 'testing',
    keywords: ['run tests', 'unit test', 'integration test', 'test suite', 'test coverage', 'pytest', 'jest', 'vitest'],
    patterns: [/(?:run|execute)\s+(?:\w+\s+){0,3}tests?/i],
  },
  {
    capability: 'git_review',
    keywords: ['git diff', 'review branch', 'commit review', 'git log', 'pull request', 'merge check'],
    patterns: [/(?:review|inspect|check)\s+(?:\w+\s+){0,3}(?:git|diff|branch|commits?)/i, /git\s+(?:diff|log|status|review)/i],
  },

  // Research & Docs
  { capability: 'web_search', keywords: ['search web', 'google', 'look up online', 'find library', 'search documentation'] },
  { capability: 'documentation_lookup', keywords: ['docs', 'api reference', 'specification', 'readme', 'manual', 'gemini docs'] },
  { capability: 'information_retrieval', keywords: ['summarize articles', 'extract info', 'knowledge base', 'retrieve'] },

  // File & Document Processing
  { capability: 'file_read', keywords: ['read file', 'inspect file', 'view file', 'load config', 'parse file'] },
  { capability: 'file_write', keywords: ['write file', 'save to', 'create file', 'update file', 'modify file', 'write output'] },
  { capability: 'file_delete', keywords: ['delete file', 'remove file', 'clean directory', 'delete folder', 'erase'] },
  { capability: 'markdown_rendering', keywords: ['markdown', 'render doc', 'generate report', 'format document', 'changelog'] },

  // Video & Media
  { capability: 'video_qa', keywords: ['video qa', 'quality analysis', 'inspect video', 'video frames', 'video artifact', 'ponytail', 'glitch check'] },
  { capability: 'media_transcode', keywords: ['ffmpeg', 'transcode', 'encode video', 'convert video', 'compress video', 'audio extract'] },

  // Data Analysis
  { capability: 'data_analysis', keywords: ['analyze data', 'calculate metrics', 'csv data', 'json dataset', 'statistics', 'trend'] },
  { capability: 'data_transformation', keywords: ['transform data', 'convert format', 'map records', 'json transform'] },

  // Browser & API
  { capability: 'browser_automation', keywords: ['browser', 'open page', 'click button', 'fill form', 'scrape website', 'puppeteer', 'selenium'] },
  { capability: 'api_access', keywords: ['api request', 'rest api', 'curl', 'fetch endpoint', 'http post', 'webhook'] },

  // General CLI & Shell
  { capability: 'process_exec', keywords: ['run command', 'execute script', 'cli tool', 'shell command', 'run binary', 'terminal'] },
];

export function createTaskAnalyzer({ customRules = [] } = {}) {
  const rules = [...CAPABILITY_KEYWORDS, ...customRules];

  return {
    /**
     * Analyzes a task request and produces a structured Task Specification.
     */
    analyzeTask(input) {
      if (!input) {
        throw new Error('Task input is required for analysis');
      }

      const requestText = typeof input === 'string'
        ? input.trim()
        : String(input.text || input.prompt || input.description || '').trim();

      if (!requestText) {
        throw new Error('Task request text cannot be empty');
      }

      const taskId = typeof input === 'object' && input.task_id
        ? input.task_id
        : `task_${crypto.randomUUID()}`;

      const lowerText = requestText.toLowerCase();

      // 1. Detect required and optional capabilities
      const matchedCapabilities = new Set();
      for (const rule of rules) {
        let matched = false;
        for (const kw of rule.keywords) {
          if (lowerText.includes(kw.toLowerCase())) {
            matchedCapabilities.add(rule.capability);
            matched = true;
            break;
          }
        }
        if (!matched && Array.isArray(rule.patterns)) {
          for (const pat of rule.patterns) {
            if (pat.test(requestText)) {
              matchedCapabilities.add(rule.capability);
              break;
            }
          }
        }
      }

      // If explicit capabilities passed in input object, include them
      if (typeof input === 'object' && Array.isArray(input.required_capabilities)) {
        for (const cap of input.required_capabilities) {
          matchedCapabilities.add(cap);
        }
      }

      // 2. Classify task type
      const isArchitectureAnalysis = /\b(?:architecture(?:\s+analysis|\s+assessment|\s+review)?|technical\s+debt|architectural\s+weaknesses|evidence-based\s+architecture)\b/i.test(requestText);

      let taskType = 'general_cli';
      if (isArchitectureAnalysis) {
        taskType = 'architecture_analysis';
      } else if (matchedCapabilities.has('video_qa') || matchedCapabilities.has('media_transcode')) {
        taskType = 'video_media';
      } else if (matchedCapabilities.has('code_analysis') || matchedCapabilities.has('code_generation') || matchedCapabilities.has('refactoring') || matchedCapabilities.has('testing')) {
        taskType = 'coding';
      } else if (matchedCapabilities.has('data_analysis') || matchedCapabilities.has('data_transformation')) {
        taskType = 'data_analysis';
      } else if (matchedCapabilities.has('browser_automation') || matchedCapabilities.has('api_access')) {
        taskType = 'browser_api';
      } else if (matchedCapabilities.has('web_search') || matchedCapabilities.has('documentation_lookup')) {
        taskType = 'research';
      } else if (matchedCapabilities.has('file_read') || matchedCapabilities.has('file_write') || matchedCapabilities.has('markdown_rendering')) {
        taskType = 'file_analysis';
      }

      // Check if multi-step: contains keywords like 'then', 'after that', 'pipeline', 'first ... second'
      const isMultiStep = /\b(?:then|after that|first.*second|pipeline|step [1-9]|multi-step)\b/i.test(requestText);
      if (isMultiStep && !isArchitectureAnalysis) {
        taskType = 'multi_step';
      }

      // 3. Side-effect and permission requirements
      // Explicit read-only detection: if request specifically mandates read-only or forbids file modification
      const isExplicitReadOnly = /\b(?:read-only|readonly|no-write|dry-run|audit-only)\b/i.test(requestText) ||
        /\b(?:do not|don\'t|never)\s+(?:modify|create|write|delete|overwrite|change)\b/i.test(requestText);

      // Distinguish positive intent from negative prohibition (e.g. "Do not modify, create, delete")
      const hasPositiveDelete = matchedCapabilities.has('file_delete') || (
        /\b(?:delete|remove|erase|unlink)\b/i.test(requestText) &&
        !/\b(?:do not|don\'t|never|without)\s+(?:\w+\s+){0,3}(?:delete|remove|erase|unlink)\b/i.test(requestText)
      );

      const hasPositiveWrite = matchedCapabilities.has('file_write') || matchedCapabilities.has('code_generation') || (
        /\b(?:write|create|modify|save|edit|update)\b/i.test(requestText) &&
        !/\b(?:do not|don\'t|never|without)\s+(?:\w+\s+){0,3}(?:modify|create|write|delete|overwrite|change)\b/i.test(requestText)
      );

      let needsFsDelete = !isExplicitReadOnly && hasPositiveDelete;
      let needsFsWrite = !isExplicitReadOnly && (needsFsDelete || hasPositiveWrite);
      let needsFsRead = needsFsWrite || matchedCapabilities.has('file_read') || matchedCapabilities.has('code_analysis') || isArchitectureAnalysis || /\b(?:read|inspect|view|check|examine|analyze)\b/i.test(requestText);
      let needsNet = matchedCapabilities.has('web_search') || matchedCapabilities.has('browser_automation') || matchedCapabilities.has('api_access') || (
        /\b(?:http|https|download|curl|fetch|api|network)\b/i.test(requestText) &&
        !/\b(?:do not|don\'t|never|no)\s+(?:\w+\s+){0,3}(?:access|network|outbound|inbound|external)\b/i.test(requestText)
      );
      let needsProcess = matchedCapabilities.has('process_exec') || matchedCapabilities.has('testing') || matchedCapabilities.has('media_transcode') || (
        /\b(?:run|execute|spawn|start process|cli)\b/i.test(requestText) &&
        !/\b(?:do not|don\'t|never)\s+(?:run|execute|spawn|start process)\b/i.test(requestText)
      );

      if (isExplicitReadOnly) {
        needsFsDelete = false;
        needsFsWrite = false;
        needsFsRead = true;
        // On strict read-only tasks, allow process execution only if explicit CLI execution or testing is demanded
        if (!matchedCapabilities.has('process_exec') && !matchedCapabilities.has('testing') && !matchedCapabilities.has('media_transcode')) {
          needsProcess = false;
        }
      }

      // 4. Risk Level
      let riskLevel = 'low';
      if (needsFsDelete) {
        riskLevel = 'critical';
      } else if (needsFsWrite || (needsProcess && needsNet)) {
        riskLevel = 'high';
      } else if (needsNet || needsProcess) {
        riskLevel = 'medium';
      } else if (isArchitectureAnalysis || isExplicitReadOnly) {
        riskLevel = 'low';
      }

      // Human approval required for medium/high/critical risk or filesystem modifications
      const requiresApproval = riskLevel !== 'low' || needsFsWrite || needsFsDelete;

      // 5. Expected output artifacts
      const expectedArtifacts = [];
      const artifactMatches = requestText.match(/(?:output\s+(?:to\s+)?|save\s+(?:\w+\s+)?to\s+|generate\s+|create\s+|into\s+)([a-zA-Z0-9_./\\-]+\.[a-zA-Z0-9]+)/gi);
      if (artifactMatches) {
        for (const match of artifactMatches) {
          const parts = match.split(/\s+/);
          const filename = parts[parts.length - 1];
          if (filename && !expectedArtifacts.includes(filename)) {
            expectedArtifacts.push(filename);
          }
        }
      }

      // If user input specified expected artifacts, merge them
      if (typeof input === 'object' && Array.isArray(input.expected_artifacts)) {
        for (const art of input.expected_artifacts) {
          if (!expectedArtifacts.includes(art)) expectedArtifacts.push(art);
        }
      }

      // 6. Ambiguity & Confidence
      const uncertaintyNotes = typeof input === 'object' && Array.isArray(input.uncertainty_notes)
        ? [...input.uncertainty_notes]
        : [];
      let confidence = 0.85;
      if (matchedCapabilities.size === 0) {
        matchedCapabilities.add('process_exec'); // fallback generic capability
        uncertaintyNotes.push('No specific domain capabilities detected from prompt text; defaulted to generic process execution');
        confidence = 0.40;
      }

      const needsUserInput = typeof input === 'object' && Boolean(input.needs_user_input)
        || uncertaintyNotes.some((n) => /clarification|clarify|missing info/i.test(n));

      return {
        task_id: taskId,
        original_request: requestText,
        task_type: taskType,
        required_capabilities: Array.from(matchedCapabilities),
        optional_capabilities: typeof input === 'object' && Array.isArray(input.optional_capabilities)
          ? input.optional_capabilities
          : [],
        input_requirements: typeof input === 'object' && Array.isArray(input.inputs)
          ? input.inputs
          : [],
        expected_output_artifacts: expectedArtifacts,
        constraints: typeof input === 'object' && input.constraints ? input.constraints : {},
        risk_level: riskLevel,
        needs_filesystem_read: needsFsRead,
        needs_filesystem_write: needsFsWrite,
        needs_filesystem_delete: needsFsDelete,
        needs_network_access: needsNet,
        needs_process_execution: needsProcess,
        requires_human_approval: requiresApproval,
        needs_user_input: needsUserInput,
        clarification_prompt: typeof input === 'object' && input.clarification_prompt ? input.clarification_prompt : (needsUserInput ? uncertaintyNotes.join('; ') : null),
        confidence,
        uncertainty_notes: uncertaintyNotes,
        completion_criteria: [
          'Execution exits with code 0 without unhandled errors',
          ...(expectedArtifacts.length > 0 ? [`All expected artifacts created and non-empty: ${expectedArtifacts.join(', ')}`] : []),
        ],
        created_at: new Date().toISOString(),
      };
    },
  };
}
