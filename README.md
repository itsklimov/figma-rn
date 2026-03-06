# figma-rn

MCP server that generates React Native code from Figma URLs using a single tool: `get_screen`.

## Requirements

- Node.js 18+
- [Bun](https://bun.sh/)
- `FIGMA_TOKEN` (Figma Personal Access Token)

## Install and Build

```bash
git clone https://github.com/itsklimov/figma-rn
cd figma-rn
bun install
bun run build
```

## MCP Configuration (Claude Desktop)

```json
{
  "mcpServers": {
    "figma-rn": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/figma-rn/dist/index.js"],
      "env": {
        "FIGMA_TOKEN": "figd_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

## Tool Contract

Only one MCP tool is exposed:

- `get_screen`

Input highlights:

- `figmaUrl` (required)
- `componentName`
- `projectRoot`
- `category` (`screens`, `modals`, `sheets`, `components`, `icons`)
- `suppressTodos`
- `scaleFunction`

## Output Structure

Generated output is written to:

```text
.figma/{category}/{ComponentName}/
├── index.tsx
├── meta.json
├── screenshot.png
└── assets/
```

## Development

```bash
bun run dev
bun run lint
bun run test
bun run test:coverage
```

Live e2e tests:

```bash
FIGMA_LIVE_TESTS=1 bun run test:live
```

## Regression Baseline

```bash
FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) bunx tsx scripts/regression-test.mts "https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2256-25238&m=dev" check
```

## Troubleshooting

- `Tool not found`: rebuild with `bun run build`, then restart Claude Desktop.
- `Invalid token`: verify `FIGMA_TOKEN` and format.
- `No assets`: check export permissions for target nodes in Figma.
