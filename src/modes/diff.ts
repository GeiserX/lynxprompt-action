import * as core from '@actions/core';
import * as crypto from 'crypto';
import { LynxPromptClient } from '../api';
import { ActionInputs, DiffResult, DetectedFile } from '../types';
import { detectConfigFiles, parseFilePatterns } from '../utils/detector';
import { formatDiffComment, upsertPrComment } from '../utils/comment';

/**
 * Diff mode: compare local AI config files with cloud blueprints.
 *
 * - Detects local config files
 * - Fetches blueprints from LynxPrompt
 * - Compares checksums to detect drift
 * - Posts a PR comment showing differences
 * - Optionally fails the check if drift is detected
 */
export async function runDiff(
  client: LynxPromptClient,
  inputs: ActionInputs,
  workspace: string,
): Promise<void> {
  const patterns = parseFilePatterns(inputs.files);
  const localFiles = await detectConfigFiles(workspace, patterns);

  // Fetch all blueprints
  const blueprints = await client.listBlueprints();

  const results: DiffResult[] = [];
  const matchedBlueprintIds = new Set<string>();

  // Compare local files against cloud blueprints
  for (const file of localFiles) {
    const matching = blueprints.find(
      (b) => b.name === file.blueprintName && b.type === file.type,
    );

    if (!matching) {
      results.push({
        file: file.relativePath,
        blueprintName: file.blueprintName,
        type: file.type,
        status: 'local-only',
        localChecksum: computeChecksum(file.content),
        details: 'File exists locally but not in LynxPrompt',
      });
      continue;
    }

    matchedBlueprintIds.add(matching.id);

    const localChecksum = computeChecksum(file.content);
    const cloudChecksum = matching.content_checksum;

    if (localChecksum === cloudChecksum) {
      results.push({
        file: file.relativePath,
        blueprintName: file.blueprintName,
        type: file.type,
        status: 'match',
        localChecksum,
        cloudChecksum,
      });
    } else {
      // Fetch full content for a more detailed comparison
      let details = 'Content checksums differ';
      try {
        const fullBlueprint = await client.getBlueprint(matching.id);
        const localLines = file.content.split('\n').length;
        const cloudLines = fullBlueprint.content.split('\n').length;
        const lineDiff = localLines - cloudLines;
        const diffDir =
          lineDiff > 0 ? `+${lineDiff}` : String(lineDiff);
        details = `Local: ${localLines} lines, Cloud: ${cloudLines} lines (${diffDir})`;
      } catch {
        // Use basic details if we can't fetch full content
      }

      results.push({
        file: file.relativePath,
        blueprintName: file.blueprintName,
        type: file.type,
        status: 'drift',
        localChecksum,
        cloudChecksum,
        details,
      });
    }
  }

  // Check for cloud-only blueprints (exist in LynxPrompt but not locally)
  for (const blueprint of blueprints) {
    if (!matchedBlueprintIds.has(blueprint.id)) {
      results.push({
        file: `(not found locally)`,
        blueprintName: blueprint.name,
        type: blueprint.type,
        status: 'cloud-only',
        cloudChecksum: blueprint.content_checksum,
        details: 'Blueprint exists in LynxPrompt but not in repo',
      });
    }
  }

  // Log results
  const driftCount = results.filter(
    (r) => r.status !== 'match',
  ).length;
  const hasDrift = driftCount > 0;

  core.info('--- Diff Summary ---');
  for (const r of results) {
    const icon =
      r.status === 'match'
        ? 'OK'
        : r.status === 'drift'
          ? 'DRIFT'
          : r.status === 'local-only'
            ? 'LOCAL'
            : 'CLOUD';
    core.info(`  [${icon}] ${r.file} (${r.blueprintName})`);
  }

  // Post PR comment
  const commentBody = formatDiffComment(results);
  await upsertPrComment(commentBody);

  // Set outputs
  core.setOutput('drift-detected', hasDrift);

  // Optionally fail
  if (inputs.failOnDrift && hasDrift) {
    core.setFailed(
      `Config drift detected: ${driftCount} file(s) differ from cloud blueprints.`,
    );
  }
}

/**
 * Compute SHA-256 checksum of content.
 */
function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}
