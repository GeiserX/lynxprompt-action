import * as core from '@actions/core';
import { LynxPromptClient } from './api';
import { ActionInputs, ActionMode, BlueprintVisibility } from './types';
import { runSync } from './modes/sync';
import { runValidate } from './modes/validate';
import { runGenerate } from './modes/generate';
import { runDiff } from './modes/diff';
import { resolveApiUrl } from './utils/apiUrl';
import { DEFAULT_PATTERNS } from './utils/detector';

/**
 * Parse and validate action inputs.
 */
function getInputs(): ActionInputs {
  const mode = core.getInput('mode', { required: true }) as ActionMode;
  const validModes: ActionMode[] = ['sync', 'validate', 'generate', 'diff'];
  if (!validModes.includes(mode)) {
    throw new Error(
      `Invalid mode "${mode}". Must be one of: ${validModes.join(', ')}`,
    );
  }

  const token = core.getInput('token', { required: true });
  if (!token.startsWith('lp_')) {
    core.warning(
      'Token does not start with "lp_". Ensure you are using a valid LynxPrompt API token.',
    );
  }

  const apiUrl = resolveApiUrl(core.getInput('api-url'));
  const files = core.getInput('files') || DEFAULT_PATTERNS.join(',');

  // Empty means: PRIVATE for new blueprints, unchanged for existing ones
  const visibility =
    (core.getInput('visibility').toUpperCase() as BlueprintVisibility) ||
    undefined;
  const validVisibilities: BlueprintVisibility[] = [
    'PRIVATE',
    'TEAM',
    'PUBLIC',
  ];
  if (visibility && !validVisibilities.includes(visibility)) {
    throw new Error(
      `Invalid visibility "${visibility}". Must be one of: ${validVisibilities.join(', ')}`,
    );
  }

  const platformsRaw = core.getInput('platforms') || '';
  const platforms = platformsRaw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const teamId = core.getInput('team-id') || undefined;
  const githubToken =
    core.getInput('github-token') || process.env.GITHUB_TOKEN || undefined;

  const failOnDrift = core.getBooleanInput('fail-on-drift');
  const commitChanges = core.getBooleanInput('commit-changes');

  return {
    mode,
    token,
    apiUrl,
    files,
    visibility,
    teamId,
    githubToken,
    platforms,
    failOnDrift,
    commitChanges,
  };
}

/**
 * Main entry point for the action.
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs();

    // Mask the tokens in logs
    core.setSecret(inputs.token);
    if (inputs.githubToken) core.setSecret(inputs.githubToken);

    core.info(`LynxPrompt Action - Mode: ${inputs.mode}`);
    core.info(`API URL: ${inputs.apiUrl}`);

    const client = new LynxPromptClient(inputs.apiUrl, inputs.token);

    // Validate token before proceeding (skip for validate mode which may not need API)
    if (inputs.mode !== 'validate') {
      const isValid = await client.validateToken();
      if (!isValid) {
        throw new Error(
          'Failed to authenticate with LynxPrompt API. Check your token.',
        );
      }
      core.info('Authenticated with LynxPrompt API successfully.');
    }

    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    core.debug(`Workspace: ${workspace}`);

    switch (inputs.mode) {
      case 'sync':
        await runSync(client, inputs, workspace);
        break;
      case 'validate':
        await runValidate(client, inputs, workspace);
        break;
      case 'generate':
        await runGenerate(client, inputs, workspace);
        break;
      case 'diff':
        await runDiff(client, inputs, workspace);
        break;
      default:
        throw new Error(`Unknown mode: ${inputs.mode}`);
    }

    core.info('LynxPrompt Action completed successfully.');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

run();
