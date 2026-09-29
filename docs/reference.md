# Reference

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `mode` | Action mode: `sync`, `validate`, `generate`, or `diff` | Yes | - |
| `token` | LynxPrompt API token (`lp_...`) | Yes | - |
| `api-url` | LynxPrompt API base URL | No | `https://lynxprompt.com` |
| `files` | Glob pattern(s) for config files (comma or newline separated) | No | See below |
| `visibility` | Blueprint visibility when syncing: `PRIVATE`, `TEAM`, or `PUBLIC` | No | `PRIVATE` |
| `platforms` | Required platforms for validate mode (comma-separated) | No | - |
| `fail-on-drift` | Fail the check if drift is detected (diff mode) | No | `false` |
| `commit-changes` | Auto-commit generated files (generate mode) | No | `false` |

**Default file patterns:**
```
**/{AGENTS,CLAUDE,AIDER}.md
**/.github/copilot-instructions.md
**/.windsurfrules
**/.cursor/rules/**/*.mdc
```

## Outputs

| Output | Description | Mode |
|--------|-------------|------|
| `synced-count` | Number of blueprints created or updated | sync |
| `validation-passed` | Whether all validations passed (`true`/`false`) | validate |
| `generated-count` | Number of files generated or updated | generate |
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
