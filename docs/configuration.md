# Configuration

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `mode` | Action mode: `sync`, `validate`, `generate`, or `diff` | Yes | - |
| `token` | LynxPrompt API token (`lp_...`) | Yes | - |
| `api-url` | LynxPrompt API base URL | No | `https://lynxprompt.geiser.cloud` |
| `files` | Glob pattern(s) for config files (comma or newline separated) | No | See below |
| `visibility` | Blueprint visibility when syncing: `PRIVATE`, `TEAM`, or `PUBLIC`. When unset, new blueprints are `PRIVATE` and existing ones keep the visibility they have | No | - |
| `team-id` | Team that `TEAM` blueprints are shared with. Needed only when you belong to more than one team | No | - |
| `github-token` | GitHub token used to post PR comments (validate and diff modes) | No | `${{ github.token }}` |
| `platforms` | Required platforms for validate mode (comma-separated) | No | - |
| `fail-on-drift` | Fail the check if drift is detected (diff mode) | No | `false` |
| `commit-changes` | Auto-commit generated files (generate mode) | No | `false` |

**Default file patterns:**
```
**/AGENTS.md
**/CLAUDE.md
**/AIDER.md
**/.github/copilot-instructions.md
**/.windsurfrules
**/.cursor/rules/**/*.mdc
```

Braces such as `**/{AGENTS,CLAUDE}.md` are expanded by the action, and the comma inside them does not split the pattern.

## Outputs

| Output | Description | Mode |
|--------|-------------|------|
| `synced-count` | Number of blueprints created or updated | sync |
| `validation-passed` | Whether all validations passed (`true`/`false`) | validate |
| `generated-count` | Number of files generated or updated (with `commit-changes`, set only after the push succeeds) | generate |
| `drift-detected` | Whether any drift was detected (`true`/`false`) | diff |

## Supported platforms

The action recognizes configuration files for these AI coding tools:

| Platform | Config File(s) | Blueprint Type |
|----------|----------------|----------------|
| Claude Code | `CLAUDE.md`, `AGENTS.md` | `CLAUDE_MD`, `AGENTS_MD` |
| Cursor | `.cursor/rules/*.mdc` | `CURSOR_RULES` |
| GitHub Copilot | `.github/copilot-instructions.md` | `COPILOT_INSTRUCTIONS` |
| Windsurf | `.windsurfrules` | `WINDSURF_RULES` |
| Aider | `AIDER.md` | `AIDER_MD` |
