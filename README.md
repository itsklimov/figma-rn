# figma-rn

MCP server for generating production-ready React Native code from Figma designs.

## Features

- **One-shot generation** - Complete screens from Figma URL in a single call
- **AST-based code generation** - Valid TypeScript syntax guaranteed (ts-morph)
- **Delta E color matching** - Accurate theme color mapping
- **Pattern recognition** - Detects and reuses existing components
- **Project-agnostic** - Works with any React Native project via `.figmarc.json`
- **Token-efficient** - Minimal context extraction (~5KB vs 50-100KB)

## Installation

```bash
git clone https://github.com/itsklimov/figma-rn
cd figma-rn
npm install
npm run build
```

## Configuration

1. Copy the example config:
```bash
cp .mcp.json.example .mcp.json
```

2. Add your Figma token to `.mcp.json`:
```json
{
  "mcpServers": {
    "figma": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "FIGMA_TOKEN": "your_figma_personal_access_token"
      }
    }
  }
}
```

Get your token: https://www.figma.com/developers/api#access-tokens

## Quick Start

After configuration, restart Claude Code and try:

```
"Generate HomeScreen from https://www.figma.com/design/FILE_ID?node-id=123-456"
```

## Available Tools

### Primary Tools

| Tool | Purpose |
|------|---------|
| `generate_screen` | Generate complete screen from Figma URL |
| `generate_flow` | Generate multiple screens with shared navigation |
| `analyze_element` | Detect element type before generation |

### Analysis Tools

| Tool | Purpose |
|------|---------|
| `get_minimal_context` | Token-efficient design overview (~5KB YAML) |
| `recognize_components` | Find existing component matches with confidence scores |
| `get_design_spec` | Exact typography, spacing, colors |
| `download_figma_images` | Fetch assets with smart categorization |

### Setup Tools

| Tool | Purpose |
|------|---------|
| `setup_project` | Create `.figmarc.json` for your project |

## Recommended Workflow

### Single Screen
```
1. analyze_element    → Understand what you're generating
2. generate_screen    → Get production-ready code
```

### Multiple Screens
```
generate_flow → Screens + navigation types + shared types + index.ts
```

### First-Time Setup
```
setup_project → Creates .figmarc.json with theme mappings
```

## Generated Code Example

Input from Figma:
```
Frame with #7A54FF background, 16px padding, SF Pro 17pt text
```

Output:
```typescript
import { scale } from '@app/utils/responsive';
import { useTheme } from '@app/contexts/ThemeContext';

export const MyScreen = () => {
  const { styles } = useTheme(createStyles);
  return <View style={styles.container}>...</View>;
};

const createStyles = ({ palette }: ThemeType) => ({
  container: {
    backgroundColor: palette.primary,  // Delta E matched
    padding: scale(16),                 // scale() as function
  },
}) as const;
```

## Auto-Detection

The generator automatically detects and handles:

| Pattern | Generated Code |
|---------|---------------|
| Lists | FlatList with renderItem, keyExtractor, pagination |
| Forms | react-hook-form + Zod validation + typed fields |
| Bottom Sheets | @gorhom/bottom-sheet with snap points |
| Modals | react-native-modal with animations |
| Icons | Small vectors (<64px) - suggests icon component |
| System elements | Keyboards, tab bars - skipped |

## Project Configuration

For optimal code generation, run setup once per project:

```
"Set up figma-rn for this project"
```

Creates `.figmarc.json` with:
- Theme file location and color tokens
- Scale function detection (scale/RFValue/moderateScale)
- Import path patterns (@app, ~, @components)
- Style approach (useTheme, StyleSheet, styled-components)

## Development

```bash
npm run dev    # Run with tsx (hot reload)
npm run build  # Compile TypeScript
npm start      # Run compiled version
```

## Examples

See `docs/` for detailed examples:
- [Batch Generation](docs/batch-generation.md)
- [Flow Generation](docs/flow-generation.md)
- [Form Detection](docs/form-hooks.md)

## License

[PolyForm Small Business License 1.0.0](LICENSE.md)
