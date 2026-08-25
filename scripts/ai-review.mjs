#!/usr/bin/env node
// R4 AI code-review gate — orchestration.
//
// Runs from a GitHub Action on `pull_request[opened, synchronize]`. It:
//   1. Reads the PR context from the event payload / gh api.
//   2. Decides whether to review based on the repo, PR number and head SHA.
//   3. Pulls the diff + commit list + feature-file list, truncated to a token
//      budget.
//   4. Calls DeepSeek (reusing translate.mjs's fetch/parse pattern) to produce
//      a classify-only issue table.
//   5. Posts the comment back to the PR, tagged with `Reviewed: <sha>` for
//      dedupe.
//
// NON-BLOCKING by design: this script only posts a comment and exits 0 even
// when the review finds problems or the API fails. It never sets a required
// status check, so an empty/no-key/failed review cannot block the merge. The
// workflow also writes a neutral/success conclusion to the step summary, never
// failure.
//
// GRACEFUL DEGRADATION: if DEEPSEEK_API_KEY is absent/placeholder, the script
// prints a clear note and exits 0 without touching the API — no crash, no
// false failure. This is what makes the gate safe to enable before the secret
// is configured.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildSystemPrompt,
  buildUserPrompt,
  truncateToTokens,
  normalizeIssues,
  renderComment,
  PROMPT_TOKEN_BUDGET,
} from './lib/ai-review-prompt.mjs';
import { parseJsonLoose } from './lib/translate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BOT_MARKER = 'ai-review-bot';
const REVIEWED_PREFIX = 'Reviewed:';

// The workflow passes these via env; we only require repo and PR number.
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? '';
const PR_NUMBER = process.env.PR_NUMBER ?? '';
const HEAD_SHA = process.env.HEAD_SHA ?? '';
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY ?? '').trim();
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(
  /\/+$/,
  ''
);
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

// --- helpers ---------------------------------------------------------------

function gh(args, options = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    ...options,
  });
}

function keyStatus(key) {
  if (!key) return 'missing';
  if (key === 'SET' || key === 'placeholder' || key.startsWith('dummy')) return 'placeholder';
  if (!key.startsWith('sk-') || key.length < 30 || /\s/.test(key)) return 'unknown_format';
  return 'configured';
}

function resolveOwnerRepo(repo) {
  const [owner, ...rest] = repo.split('/');
  return { owner, repo: rest.join('/') };
}

// main ---------------------------------------------------------------

async function main() {
  const status = keyStatus(DEEPSEEK_API_KEY);
  if (status !== 'configured') {
    console.log(
      `[ai-review] DEEPSEEK_API_KEY is '${status}'. Skipping review (advisory, non-blocking). ` +
        'Configure CI secret DEEPSEEK_API_KEY to enable. Exit 0.'
    );
    process.exit(0);
  }

  if (!GITHUB_REPOSITORY || !PR_NUMBER) {
    console.log('[ai-review] GITHUB_REPOSITORY or PR_NUMBER missing; cannot review. Exit 0.');
    process.exit(0);
  }

  const { owner, repo } = resolveOwnerRepo(GITHUB_REPOSITORY);
  const apiBase = `repos/${owner}/${repo}/pulls/${PR_NUMBER}`;

  // Dedupe: scan existing issue-comments for a `Reviewed: <head sha>` by the
  // bot marker. If this head SHA was already reviewed, stop. On `synchronize`
  // (a new push) the head SHA changes, so the new SHA is always "unreviewed"
  // and we re-review — that is the intended behaviour.
  const shouldReview = await decideShouldReview(apiBase, HEAD_SHA);
  if (!shouldReview) {
    console.log(
      '[ai-review] Already reviewed this SHA or not a reviewable event; skipping. Exit 0.'
    );
    process.exit(0);
  }

  // Pull context.
  const context = await gatherContext(apiBase);

  // Only review if the diff is meaningful (don't burn tokens on empty PRs).
  if (!context.diff && !context.featureList) {
    console.log('[ai-review] No diff or feature list available; skipping. Exit 0.');
    process.exit(0);
  }

  const result = await callDeepSeek(context);

  const commentBody = renderComment({
    sha: HEAD_SHA,
    issues: normalizeIssues(result),
    files: context.files,
  });

  await postComment(apiBase, commentBody);

  // Neutral conclusion, never failure — see module docstring.
  console.log('=== AI REVIEW SUMMARY ===');
  console.log(`files: ${context.files.length}`);
  console.log(`issues: ${normalizeIssues(result).length}`);
  console.log(`conclusion: neutral (advisory, non-blocking)`);
  process.exit(0);
}

async function decideShouldReview(apiBase, sha) {
  // On `opened`, review only when there is no ai-review-bot comment yet.
  // On `synchronize`, re-review the new SHA (which is always unreviewed).
  if (!sha) return false;

  const comments = fetchIssueComments(apiBase);
  const reviewedByBot = comments.filter(
    (comment) => comment.body && comment.body.includes(BOT_MARKER)
  );
  const foundSha = reviewedByBot.some(
    (comment) => comment.body && comment.body.includes(`${REVIEWED_PREFIX} ${sha}`)
  );
  if (foundSha) return false;

  return true;
}

function fetchIssueComments(apiBase) {
  try {
    const raw = gh(['api', `${apiBase}/comments`, '--paginate']);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function gatherContext(apiBase) {
  const files = await fetchFiles(apiBase);
  const commits = await fetchCommits(apiBase);
  const featureList = buildFeatureList(files);

  // Token budget: reserve some for the system prompt + user framing, keep the
  // rest for the diff split between context and feature list.
  const diffBudget = Math.floor(PROMPT_TOKEN_BUDGET * 0.7);
  const featureBudget = Math.floor(PROMPT_TOKEN_BUDGET * 0.2);

  const diff = truncateToTokens(filesToPatch(files), diffBudget);
  return {
    files: files.map((file) => file.filename),
    featureList: truncateToTokens(featureList, featureBudget),
    commits: truncateToTokens(commits, PROMPT_TOKEN_BUDGET * 0.1),
    diff,
  };
}

function fetchFiles(apiBase) {
  try {
    const raw = gh(['api', `${apiBase}/files`, '--paginate']);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function fetchCommits(apiBase) {
  try {
    const raw = gh(['api', `${apiBase}/commits`, '--paginate']);
    const commits = JSON.parse(raw);
    return commits
      .map((commit) => `${commit.sha.slice(0, 7)}: ${commit.commit?.message?.split('\n')[0] ?? ''}`)
      .join('\n');
  } catch {
    return '';
  }
}

// The feature-file list gives the LLM the "what does this PR touch" context the
// design calls for. We approximate it from the touched filenames + a short
// classification of the top-level directory, since the repo does not expose a
// per-file semantic index to CI.
function buildFeatureList(files) {
  if (!files.length) return '';
  const grouped = new Map();
  for (const file of files) {
    const top = file.filename.split('/')[0] || '(root)';
    grouped.set(top, (grouped.get(top) ?? 0) + 1);
  }
  const counts = [...grouped.entries()]
    .map(([area, count]) => `${area}/ (${count} file(s))`)
    .join(', ');
  const names = files.map((file) => file.filename).join('\n');
  return `Top-level areas changed: ${counts}.\nFiles:\n${names}`;
}

// Convert the GitHub files payload into a unified-diff-ish blob. `patch` is
// already a unified diff per file; we cap each file and skip binary/oversize.
function filesToPatch(files) {
  const parts = [];
  for (const file of files) {
    if (!file.patch || (file.status === 'removed' && !file.patch)) continue;
    if (file.patch.length > 20000) {
      parts.push(
        `--- ${file.filename}\n+++ ${file.filename}\n(too large for review, ${file.patch.length} chars)`
      );
      continue;
    }
    parts.push(`--- ${file.filename}\n+++ ${file.filename}\n${file.patch}`.slice(0, 14000));
  }
  return parts.join('\n\n');
}

async function callDeepSeek(context) {
  const body = {
    model: DEEPSEEK_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      {
        role: 'user',
        content: buildUserPrompt({
          diff: context.diff,
          featureList: context.featureList,
          commits: context.commits,
        }),
      },
    ],
  };

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn(`[ai-review] DeepSeek API error ${response.status}: ${text.slice(0, 300)}`);
    return { files: [], issues: [] };
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? '{}';
  return parseJsonLoose(content);
}

async function postComment(apiBase, body) {
  // Note: `gh api .../comments -f body=...` interpolates newlines via a
  // temporary file to avoid shell-quoting issues with multi-line markdown.
  const tmp = path.join(ROOT, `.ai-review-body-${Date.now()}.tmp`);
  fs.writeFileSync(tmp, body, 'utf8');
  try {
    const raw = gh(['api', `${apiBase}/comments`, '-F', `body=@${tmp}`]);
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[ai-review] Failed to post comment: ${error.message}`);
    return null;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore cleanup failure
    }
  }
}

// parseJsonLoose is re-exported so consumer tests can assert on it, but it is
// already imported above (translate.mjs is the canonical source).

main().catch((error) => {
  console.warn(`[ai-review] Unhandled error, exiting 0 (non-blocking): ${error.message}`);
  process.exit(0);
});
