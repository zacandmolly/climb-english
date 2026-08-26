import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const deployWorkflow = readFileSync(
  new URL('../.github/workflows/deploy-pages.yml', import.meta.url),
  'utf8'
);

test('Pages deploys only after successful push CI on main', () => {
  assert.match(
    deployWorkflow,
    /workflow_run:\s*\n\s+workflows: \[CI\]\s*\n\s+types: \[completed\]/
  );
  assert.match(deployWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.match(deployWorkflow, /workflow_run\.event == 'push'/);
  assert.match(deployWorkflow, /workflow_run\.head_branch == 'main'/);
  assert.match(deployWorkflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.doesNotMatch(deployWorkflow, /\n\s+workflow_dispatch:/);
  assert.doesNotMatch(deployWorkflow, /\n\s+push:\s*\n\s+branches:/);
});

test('Pages checks out the CI-tested SHA and refuses stale main revisions', () => {
  assert.match(deployWorkflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(deployWorkflow, /git fetch origin main --depth=1/);
  assert.match(deployWorkflow, /Refusing to deploy stale CI revision/);
  assert.equal([...deployWorkflow.matchAll(/Refusing to deploy stale CI revision/g)].length, 2);
});

test('only the real deploy job participates in Pages concurrency', () => {
  const beforeJobs = deployWorkflow.split('\njobs:')[0];
  const deployJob = deployWorkflow.split('\n  deploy:')[1];

  assert.doesNotMatch(beforeJobs, /\nconcurrency:/);
  assert.match(deployJob, /concurrency:\s*\n\s+group: pages\s*\n\s+cancel-in-progress: false/);
});

test('repository workflows do not use retired Node 20 action majors', () => {
  const workflowDirectory = new URL('../.github/workflows/', import.meta.url);
  const workflows = readdirSync(workflowDirectory)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => readFileSync(new URL(name, workflowDirectory), 'utf8'))
    .join('\n');

  assert.doesNotMatch(workflows, /actions\/checkout@v[1-4]\b/);
  assert.doesNotMatch(workflows, /actions\/setup-node@v[1-4]\b/);
  assert.doesNotMatch(workflows, /actions\/upload-artifact@v[1-4]\b/);
  assert.doesNotMatch(workflows, /actions\/upload-pages-artifact@v[1-4]\b/);
  assert.doesNotMatch(workflows, /actions\/deploy-pages@v[1-4]\b/);
});
