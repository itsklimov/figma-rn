# figma-rn Context

## Project Overview

`figma-rn` is an MCP server that generates React Native code from Figma URLs.
Current runtime contract is `get_screen` only.

## Architecture

- `src/api`: Figma API client, URL parsing, transformers, errors.
- `src/core`: normalization, layout, recognition, detection, token mapping, generation.
- `src/edge`: MCP tool wiring and filesystem delivery.
- `src/workspace`: `.figma` manifest/config/registry management.
- `src/theme-parser`: AST-based theme token extraction.

Detailed architecture rules are documented in `docs/architecture.md`.

## Testing Standards

Core checks for every refactor cycle:

1. `bun run lint`
2. `bun run test`
3. `bun run test:coverage`
4. Layering gate: `bun run check:layers`

Live Figma validation (optional):

```bash
FIGMA_LIVE_TESTS=1 bun run test:live
```

## Regression Workflow

Baseline target: `Мастер главная` (`2256:25238`)

```bash
FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) bunx tsx scripts/regression-test.mts "https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2256-25238&m=dev" check
```

Update baseline when intentional output changes are accepted:

```bash
FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) bunx tsx scripts/regression-test.mts "https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2256-25238&m=dev" baseline
```

## Key Folders

- `.figma/`: generated output and per-project config.
- `scripts/`: regression/debug/testing utilities.
- `tests/`: unit + e2e tests.
