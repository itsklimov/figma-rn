# Architecture

## Overview

`figma-rn` follows a staged architecture:

1. `api` retrieves and normalizes raw Figma API payloads.
2. `core` transforms payloads into IR and generates code.
3. `edge` exposes MCP tooling and performs delivery to filesystem.
4. `workspace` manages `.figma` registry/config/metadata.
5. `theme-parser` extracts project tokens from source files.

## Layer Rules

Allowed directional flow:

- `api -> core -> edge`
- `workspace` may be used by `edge` and selected orchestration points.
- `theme-parser` may be used by mapping/workspace token loading.

Forbidden direct dependencies:

- `core/recognize -> core/generation`
- `core/layout -> core/generation`
- `core/detection -> core/generation`

Automated check:

```bash
bun run check:layers
```

## Directory Map

```text
src/
├── api/
│   ├── client.ts
│   ├── transformers.ts
│   ├── url.ts
│   └── ...
├── core/
│   ├── normalize/
│   ├── layout/
│   ├── recognize/
│   ├── detection/
│   ├── extraction/
│   ├── mapping/
│   ├── generation/
│   └── shared/
├── edge/
│   ├── tools/
│   ├── file-writer.ts
│   └── asset-downloader.ts
├── workspace/
│   ├── manifest.ts
│   ├── config.ts
│   ├── tokens.ts
│   ├── registry.ts
│   ├── format.ts
│   ├── types.ts
│   └── internal.ts
└── theme-parser/
    ├── token-extractor.ts
    ├── file-discovery.ts
    ├── ast-resolver.ts
    ├── types.ts
    └── internal.ts
```

## Compatibility Notes

- Runtime MCP API is `get_screen` only.
- Legacy tools are intentionally removed.
- `core/generation/*` still re-exports some utilities for backward compatibility, but canonical shared helpers now live in `core/shared/*`.
