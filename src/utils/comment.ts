import * as core from '@actions/core';
import * as github from '@actions/github';
import { ValidationResult, DiffResult } from '../types';

const COMMENT_MARKER = '<!-- lynxprompt-action -->';

/**
 * Create or update a PR comment with the given body.
 * Uses a hidden marker to find and update existing comments.
 */
export async function upsertPrComment(body: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning(
      'GITHUB_TOKEN not available. Cannot post PR comment. Set permissions.pull-requests: write in your workflow.',
    );
    return;
  }

  const context = github.context;
  if (!context.payload.pull_request) {
    core.info('Not a pull request context, skipping PR comment.');
    return;
  }

  const octokit = github.getOctokit(token);
  const prNumber = context.payload.pull_request.number;
  const repo = context.repo;

  const fullBody = `${COMMENT_MARKER}\n${body}`;

  // Search for an existing comment from this action
  const { data: comments } = await octokit.rest.issues.listComments({
    ...repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find(
    (c) => c.body && c.body.includes(COMMENT_MARKER),
  );

  if (existing) {
    core.debug(`Updating existing comment ${existing.id}`);
    await octokit.rest.issues.updateComment({
      ...repo,
      comment_id: existing.id,
      body: fullBody,
    });
  } else {
    core.debug('Creating new PR comment');
    await octokit.rest.issues.createComment({
      ...repo,
      issue_number: prNumber,
      body: fullBody,
    });
  }

  core.info('PR comment posted successfully.');
}

/**
 * Format validation results as a Markdown comment body.
 */
export function formatValidationComment(
  results: ValidationResult[],
  allPassed: boolean,
): string {
  const icon = allPassed ? ':white_check_mark:' : ':x:';
  const title = allPassed
    ? 'All AI config validations passed'
    : 'AI config validation issues found';

  let body = `## ${icon} LynxPrompt Validation: ${title}\n\n`;

  if (results.length === 0) {
    body += ':warning: No AI configuration files were detected in this repository.\n';
    return body;
  }

  body += '| File | Status | Details |\n';
  body += '|------|--------|----------|\n';

  for (const result of results) {
    const status = result.passed ? ':white_check_mark: Pass' : ':x: Fail';
    const details = [
      ...result.errors.map((e) => `:x: ${e}`),
      ...result.warnings.map((w) => `:warning: ${w}`),
    ].join('<br>') || 'OK';

    body += `| \`${result.file}\` | ${status} | ${details} |\n`;
  }

  const passCount = results.filter((r) => r.passed).length;
  body += `\n**${passCount}/${results.length}** files passed validation.\n`;

  return body;
}

/**
 * Format diff results as a Markdown comment body.
 */
export function formatDiffComment(results: DiffResult[]): string {
  const hasDrift = results.some((r) => r.status === 'drift');
  const hasLocalOnly = results.some((r) => r.status === 'local-only');
  const hasCloudOnly = results.some((r) => r.status === 'cloud-only');

  const icon =
    hasDrift || hasLocalOnly || hasCloudOnly
      ? ':warning:'
      : ':white_check_mark:';
  const title =
    hasDrift || hasLocalOnly || hasCloudOnly
      ? 'Config drift detected'
      : 'Configs are in sync';

  let body = `## ${icon} LynxPrompt Diff: ${title}\n\n`;

  if (results.length === 0) {
    body += 'No configuration files to compare.\n';
    return body;
  }

  body += '| File | Blueprint | Status | Details |\n';
  body += '|------|-----------|--------|----------|\n';

  const statusIcons: Record<string, string> = {
    match: ':white_check_mark: In sync',
    drift: ':warning: Drift',
    'local-only': ':new: Local only',
    'cloud-only': ':cloud: Cloud only',
  };

  for (const result of results) {
    body += `| \`${result.file}\` | ${result.blueprintName} (${result.type}) | ${statusIcons[result.status]} | ${result.details ?? '-'} |\n`;
  }

  const matchCount = results.filter((r) => r.status === 'match').length;
  const driftCount = results.filter((r) => r.status === 'drift').length;
  const localOnlyCount = results.filter(
    (r) => r.status === 'local-only',
  ).length;
  const cloudOnlyCount = results.filter(
    (r) => r.status === 'cloud-only',
  ).length;

  body += '\n### Summary\n';
  body += `- **${matchCount}** in sync\n`;
  if (driftCount > 0) body += `- **${driftCount}** with drift\n`;
  if (localOnlyCount > 0) body += `- **${localOnlyCount}** local only\n`;
  if (cloudOnlyCount > 0) body += `- **${cloudOnlyCount}** cloud only\n`;

  return body;
}
