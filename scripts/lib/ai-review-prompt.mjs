// Prompt assembly + structured-output schema for the R4 AI code-review gate.
//
// Why this exists: the orchestrator (scripts/ai-review.mjs) gathers a PR's
// diff and the list of feature files it touches, then needs a single function
// to (1) turn that context into a compact DeepSeek prompt and (2) define the
// JSON schema the model must fill. Keeping both here means the reviewer and
// the schema stay in one place, and the token-budget truncation is hidden
// behind a single, testable function.
//
// The model is asked for a classify-only structure:
//   { files: [], issues: [ { category, severity, file, line, suggestion } ] }
// where category is one of: 功能缺失 | 逻辑bug | 边界遗漏 | 数据风险
//       severity is one of: high | med | low
// This is *advisory and non-blocking*: the review never gates the merge.

import { FILLER_WORDS } from './climbing-terms.mjs';

// Hard token budget for the whole prompt. The orchestrator truncates the
// context before calling this so the final prompt stays under the model's
// window; this constant documents the budget the orchestrator respects.
export const PROMPT_TOKEN_BUDGET = 8000;

// Build the DeepSeek system prompt. It is intentionally strict about the JSON
// shape so `parseJsonLoose` in translate.mjs can recover reliably even if the
// model wraps the object in extra prose.
export function buildSystemPrompt() {
  return [
    'You are a senior code reviewer for a TypeScript + React climbing-English app.',
    'You review a GitHub pull request by reading its raw diff plus the list of feature files it touches.',
    'Return ONLY valid JSON, no extra prose.',
    'JSON shape: {"files":["string"],"issues":[{"category":"...","severity":"...","file":"...","line":number|null,"suggestion":"string"}]}.',
    'category must be exactly one of: 功能缺失 | 逻辑bug | 边界遗漏 | 数据风险.',
    'severity must be exactly one of: high | med | low.',
    'If there are no real problems, return {"files":[],"issues":[]}.',
    'Be precise and practical: cite the file and line when possible, and give a concrete suggestion.',
    'Do NOT invent problems that are not visible in the provided context.',
  ].join(' ');
}

// Build the user message from the assembled context. `context` is an object
// { diff, featureList, commits } each already truncated to fit the budget.
export function buildUserPrompt({ diff, featureList, commits }) {
  const sections = [];

  if (commits) {
    sections.push(`## Commits in this PR\n${commits || '(none)'}`);
  }

  sections.push(`## Feature files touched\n${featureList || '(none)'}`);

  if (diff) {
    sections.push(`## Unified diff\n${diff || '(no diff provided)'}`);
  } else {
    sections.push(`## Unified diff\n(no diff provided — review only the feature list.)`);
  }

  return sections.join('\n\n');
}

// Estimate how many tokens a string will cost. Not a real tokenizer — a cheap
// heuristic (roughly 4 chars/token for code, and CJK ~1 token per 1.5 chars).
// It is only used to decide how much context to keep, so precision is not
// critical. Exporting it lets the orchestrator compute a truncation ratio.
export function estimateTokens(text) {
  if (!text) return 0;
  const ascii = (text.match(/[\x00-\x7f]/g) ?? []).length;
  const cjk = (text.match(/[^\x00-\x7f]/g) ?? []).length;
  return Math.ceil(ascii / 4 + cjk / 1.5);
}

// Cap `text` so its estimated token cost does not exceed `budget`. Keeps the
// head and a mid slice, dropping the tail, so the opening context survives.
export function truncateToTokens(text, budget) {
  if (!text) return '';
  if (estimateTokens(text) <= budget) return text;
  const head = Math.max(1, Math.floor(budget * 0.6));
  const tail = Math.max(1, Math.floor(budget * 0.4));
  const headSlice = [...text].slice(0, head * 4); // ~4 chars per ascii token
  const tailSlice = [...text].slice(-tail * 4);
  return `${headSlice.join('')}\n\n…[truncated to fit token budget]…\n\n${tailSlice.join('')}`;
}

export function isFillerText(text) {
  const tokens = (text ?? '').toLowerCase().match(/[a-z']+/g) ?? [];
  if (tokens.length === 0) return true;
  const filler = tokens.filter((token) => FILLER_WORDS.has(token)).length;
  return filler / tokens.length > 0.5;
}

// Normalize a raw LLM response into a safe issue list. `parseJsonLoose` already
// recovered a JSON object; this function coerces the shape so the comment
// renderer can trust every field. Unguarded/malformed issues are dropped.
export function normalizeIssues(raw) {
  if (!Array.isArray(raw.issues)) return [];
  const validCategories = new Set(['功能缺失', '逻辑bug', '边界遗漏', '数据风险']);
  const validSeverities = new Set(['high', 'med', 'low']);

  return raw.issues
    .filter((issue) => issue && typeof issue === 'object')
    .map((issue) => ({
      category: validCategories.has(issue.category) ? issue.category : '逻辑bug',
      severity: validSeverities.has(issue.severity) ? issue.severity : 'med',
      file: typeof issue.file === 'string' ? issue.file : '',
      line: Number.isInteger(issue.line) ? issue.line : null,
      suggestion:
        typeof issue.suggestion === 'string' && issue.suggestion.trim()
          ? issue.suggestion.trim()
          : '(no suggestion)',
    }))
    .filter((issue) => issue.file.length > 0);
}

// Render the issues as the markdown table posted back to the PR, plus the
// dedupe footer. `sha` is the PR head commit SHA this review covers.
export function renderComment({ sha, issues, files }) {
  const lines = [];
  lines.push('## 🤖 AI Code Review (advisory, non-blocking)');
  lines.push('');
  lines.push(
    issues.length > 0 ? `发现 **${issues.length}** 条可关注项：` : '未发现明显问题(或上下文不足)。'
  );
  lines.push('');

  if (issues.length > 0) {
    lines.push('| 类别 | 严重度 | 文件 | 行 | 建议 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const issue of issues) {
      const file =
        issue.line == null
          ? issue.file || '(unknown)'
          : `${issue.file || '(unknown)'}:${issue.line}`;
      const lineCell = issue.line == null ? '-' : issue.line;
      const suggestion = issue.suggestion.replace(/\|/g, '/').replace(/\n/g, ' ');
      lines.push(
        `| ${issue.category} | ${issue.severity} | ${file} | ${lineCell} | ${suggestion} |`
      );
    }
    lines.push('');
  }

  if (files && files.length > 0) {
    lines.push(`本次覆盖 ${files.length} 个文件。`);
    lines.push('');
  }

  lines.push('> AI 审查为建议性，不阻断合并；是否采纳由人决定。');
  lines.push(`\nReviewed: ${sha}`);
  return lines.join('\n');
}
