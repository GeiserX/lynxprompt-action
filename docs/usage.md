# Usage

## Getting started

### 1. Get a LynxPrompt API Token

Sign in to your LynxPrompt instance and create an API token (format: `lp_<64_hex_chars>`). Add it as a repository secret named `LYNXPROMPT_TOKEN`.

### 2. Add to Your Workflow

```yaml
- uses: GeiserX/lynxprompt-action@v1
  with:
    mode: sync
    token: ${{ secrets.LYNXPROMPT_TOKEN }}
```

## Modes

| Mode | Description | Trigger |
|------|-------------|---------|
| **sync** | Upload local AI config files as blueprints to LynxPrompt | Push to main |
| **validate** | Check that AI config files are present and well-formed | Pull request |
| **generate** | Pull blueprints from LynxPrompt and write them to the repo | Schedule / manual |
| **diff** | Compare local configs with cloud blueprints and report drift | Pull request |

## Sync Configs to LynxPrompt on Push

Upload all AI configuration files as blueprints whenever you push to the default branch.

```yaml
name: Sync AI Configs
on:
  push:
    branches: [main]
    paths:
      - 'AGENTS.md'
      - 'CLAUDE.md'
      - '.cursor/rules/**'
      - '.github/copilot-instructions.md'
      - '.windsurfrules'
      - 'AIDER.md'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: GeiserX/lynxprompt-action@v1
        with:
          mode: sync
          token: ${{ secrets.LYNXPROMPT_TOKEN }}
          visibility: PRIVATE
```

## Validate Configs on Pull Request

Check that AI config files are present and well-formed on every PR. Require specific platforms to be configured.

```yaml
name: Validate AI Configs
on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: GeiserX/lynxprompt-action@v1
        with:
          mode: validate
          token: ${{ secrets.LYNXPROMPT_TOKEN }}
          platforms: 'cursor,claude-code,copilot'
```

## Generate Configs from LynxPrompt on Schedule

Pull blueprints from LynxPrompt and write them to the repo on a daily schedule. Auto-commit the changes.

```yaml
name: Generate AI Configs
on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 06:00 UTC
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: GeiserX/lynxprompt-action@v1
        with:
          mode: generate
          token: ${{ secrets.LYNXPROMPT_TOKEN }}
          commit-changes: 'true'
```

## Diff Configs on Pull Request

Compare local configs with cloud blueprints and post a drift report as a PR comment. Optionally fail the check if drift is detected.

```yaml
name: Diff AI Configs
on:
  pull_request:
    branches: [main]

jobs:
  diff:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - uses: GeiserX/lynxprompt-action@v1
        with:
          mode: diff
          token: ${{ secrets.LYNXPROMPT_TOKEN }}
          fail-on-drift: 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Monorepo Support

The action automatically detects nested config files. For example, in a monorepo:

```
my-monorepo/
  AGENTS.md                          # Root-level config
  packages/
    api/
      AGENTS.md                      # Package-specific config
    web/
      AGENTS.md
      .cursor/rules/frontend.mdc
```

Each file is synced as a separate blueprint with its full relative path as the name (e.g., `packages/api/AGENTS.md`).

## Custom File Patterns

Override the default glob patterns to include or limit which files are processed:

```yaml
- uses: GeiserX/lynxprompt-action@v1
  with:
    mode: sync
    token: ${{ secrets.LYNXPROMPT_TOKEN }}
    files: |
      CLAUDE.md
      docs/AGENTS.md
      .cursor/rules/**/*.mdc
```

## Permissions

Depending on the mode, your workflow may need specific permissions:

```yaml
permissions:
  contents: write        # Required for generate mode with commit-changes
  pull-requests: write   # Required for validate/diff modes to post PR comments
```

For PR comment posting, also pass `GITHUB_TOKEN` as an environment variable:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Self-hosted LynxPrompt

If you self-host LynxPrompt, point the action to your instance:

```yaml
- uses: GeiserX/lynxprompt-action@v1
  with:
    mode: sync
    token: ${{ secrets.LYNXPROMPT_TOKEN }}
    api-url: 'https://lynxprompt.internal.example.com'
```
