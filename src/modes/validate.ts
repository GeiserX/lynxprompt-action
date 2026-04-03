import * as core from '@actions/core';
import { LynxPromptClient } from '../api';
import {
  ActionInputs,
  ValidationResult,
  BlueprintType,
  PLATFORM_TYPE_MAP,
} from '../types';
import { detectConfigFiles, parseFilePatterns } from '../utils/detector';
import {
  formatValidationComment,
  upsertPrComment,
} from '../utils/comment';

/** Minimum reasonable length for a config file (in characters). */
const MIN_CONTENT_LENGTH = 10;

/** Maximum reasonable length for a config file (in characters). */
const MAX_CONTENT_LENGTH = 500_000;

/**
 * Validate mode: check that AI config files are present and well-formed.
 *
 * - Validates markdown structure (has headings, reasonable length)
 * - Checks that all expected platforms have configs
 * - Posts a PR comment with results
 * - Can be used as a required status check
 */
export async function runValidate(
  _client: LynxPromptClient,
  inputs: ActionInputs,
  workspace: string,
): Promise<void> {
  const patterns = parseFilePatterns(inputs.files);
  const files = await detectConfigFiles(workspace, patterns);

  const results: ValidationResult[] = [];

  // Validate each detected file
  for (const file of files) {
    const result = validateFile(file.relativePath, file.content);
    results.push(result);
  }

  // Check required platforms
  if (inputs.platforms.length > 0) {
    const detectedTypes = new Set(files.map((f) => f.type));
    for (const platform of inputs.platforms) {
      const normalizedPlatform = platform.toLowerCase().trim();
      const expectedTypes = PLATFORM_TYPE_MAP[normalizedPlatform];

      if (!expectedTypes) {
        core.warning(`Unknown platform: ${platform}. Skipping platform check.`);
        continue;
      }

      const hasAny = expectedTypes.some((t) => detectedTypes.has(t));
      if (!hasAny) {
        results.push({
          file: `(missing: ${platform})`,
          passed: false,
          errors: [
            `No configuration file found for platform "${platform}". Expected one of: ${expectedTypes.join(', ')}`,
          ],
          warnings: [],
        });
      }
    }
  }

  const allPassed = results.every((r) => r.passed);

  // Log results
  core.info('--- Validation Results ---');
  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    core.info(`  [${icon}] ${r.file}`);
    for (const e of r.errors) core.error(`    ${e}`, { file: r.file });
    for (const w of r.warnings) core.warning(`    ${w}`, { file: r.file });
  }

  // Post PR comment
  const commentBody = formatValidationComment(results, allPassed);
  await upsertPrComment(commentBody);

  // Set outputs
  core.setOutput('validation-passed', allPassed);

  if (!allPassed) {
    core.setFailed('AI config validation failed. See details above.');
  }
}

/**
 * Validate a single file for common issues.
 */
function validateFile(relativePath: string, content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check content length
  if (content.trim().length === 0) {
    errors.push('File is empty.');
  } else if (content.length < MIN_CONTENT_LENGTH) {
    errors.push(
      `File is too short (${content.length} chars). Minimum recommended: ${MIN_CONTENT_LENGTH}.`,
    );
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    warnings.push(
      `File is very large (${content.length} chars). Some tools may truncate it.`,
    );
  }

  // Check for markdown structure in .md files
  const isMarkdown =
    relativePath.endsWith('.md') || relativePath.endsWith('.mdc');
  if (isMarkdown) {
    const hasHeading = /^#{1,6}\s+.+/m.test(content);
    if (!hasHeading) {
      warnings.push(
        'No markdown headings found. Consider adding structure with headings.',
      );
    }

    // Check for common placeholder text
    const placeholders = ['TODO', 'FIXME', 'INSERT HERE', 'PLACEHOLDER'];
    for (const ph of placeholders) {
      if (content.toUpperCase().includes(ph)) {
        warnings.push(`Contains "${ph}" - may be an incomplete placeholder.`);
      }
    }
  }

  // Check for potentially sensitive content
  const sensitivePatterns = [
    /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}/i,
    /(?:sk-|ghp_|gho_|glpat-|xoxb-|xoxp-)[a-zA-Z0-9]{20,}/,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(content)) {
      warnings.push(
        'Possible sensitive data detected (API key or secret). Review before committing.',
      );
      break;
    }
  }

  return {
    file: relativePath,
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
