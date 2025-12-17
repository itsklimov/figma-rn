# figma-rn

MCP server that generates production-ready React Native code from Figma designs in **one call**.

## How It Works

```
Figma URL  →  Auto-Detection  →  .figma/{category}/{name}/
                                  ├── index.tsx      (component)
                                  ├── meta.json      (metadata)
                                  ├── screenshot.png (reference)
                                  └── assets/        (images/icons)
```

**One URL = One complete folder.** No multi-step workflow. The server:

1. Fetches the Figma node
2. Detects patterns (list, form, modal, sheet, etc.)
3. Categorizes into appropriate folder (screens/modals/sheets/components)
4. Generates production-ready TypeScript code
5. Downloads assets and captures screenshot for validation

## Quick Start

### Prerequisites

- Node.js 18+
- Figma Personal Access Token ([get one here](https://www.figma.com/developers/api#access-tokens))

### Installation

```bash
git clone https://github.com/itsklimov/figma-rn
cd figma-rn
yarn install
yarn build
```

### MCP Configuration

Add to your Claude Code or Claude Desktop config:

```json
{
  "mcpServers": {
    "figma": {
      "command": "node",
      "args": ["/absolute/path/to/figma-rn/dist/index.js"],
      "env": {
        "FIGMA_TOKEN": "your_figma_personal_access_token"
      }
    }
  }
}
```

### First Use

After configuration, restart Claude and try:

```
Generate a login screen from https://www.figma.com/design/FILE_ID?node-id=123-456
```

## Tools

### `generate_screen`

Generate a complete React Native component from a single Figma URL.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `figmaUrl` | Yes | Figma URL with `node-id` parameter |
| `screenName` | No | Component name (auto-generated if not provided) |
| `projectRoot` | No | Project root directory (defaults to cwd) |

**Example:**
```
Generate PaymentModal from https://www.figma.com/design/ABC123?node-id=456-789
```

### `generate_flow`

Generate multiple screens in parallel with shared navigation types.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `screens` | Yes | Array of `{figmaUrl, screenName}` |
| `options.generateNavigation` | No | Generate React Navigation types (default: true) |
| `options.generateSharedTypes` | No | Generate shared TypeScript types (default: true) |
| `options.generateIndex` | No | Generate barrel export (default: true) |

**Example:**
```
Generate auth flow:
- LoginScreen from https://www.figma.com/design/ABC?node-id=1-1
- RegisterScreen from https://www.figma.com/design/ABC?node-id=1-2
- ForgotPasswordScreen from https://www.figma.com/design/ABC?node-id=1-3
```

## Auto-Detection

The server automatically detects UI patterns and generates appropriate code:

| Pattern | Detection | Generated Code |
|---------|-----------|----------------|
| **Lists** | Repeating items, scroll containers | `FlatList` with `renderItem`, `keyExtractor` |
| **Forms** | Input fields, submit buttons | `react-hook-form` + Zod validation |
| **Bottom Sheets** | Partial overlays, drag handles | `@gorhom/bottom-sheet` with snap points |
| **Modals** | Full overlays, close buttons | `react-native-modal` with animations |
| **Action Sheets** | Button lists at bottom | Pressable action lists |

### Auto-Categorization

Elements are automatically placed in the right folder:

| Category | Criteria | Output Path |
|----------|----------|-------------|
| `screens` | Full-screen frames | `.figma/screens/{name}/` |
| `modals` | Overlay with backdrop | `.figma/modals/{name}/` |
| `sheets` | Bottom-anchored partial overlay | `.figma/sheets/{name}/` |
| `components` | Reusable UI elements | `.figma/components/{name}/` |

## Output Structure

```
.figma/
├── screens/
│   └── HomeScreen/
│       ├── index.tsx        # React Native component
│       ├── meta.json        # Figma metadata, exports, dependencies
│       ├── screenshot.png   # Visual reference for validation
│       └── assets/          # Downloaded images and icons
├── modals/
├── sheets/
├── components/
├── manifest.json            # Registry of all generated elements
├── config.json              # Auto-detected project settings
└── theme.json               # Extracted design tokens
```

### Generated Code Features

- **AST-based generation** via ts-morph (valid TypeScript guaranteed)
- **Delta E color matching** to your theme tokens
- **Typography mapping** to your font system
- **Scale function** support (scale/RFValue/moderateScale)
- **Theme integration** (useTheme, StyleSheet, styled-components)

## Theme Integration

On first use, the server auto-detects your project's theme configuration and creates `.figma/config.json`:

```json
{
  "theme": {
    "colorsFile": "src/theme/colors.ts",
    "typographyFile": "src/theme/typography.ts",
    "type": "palette-object"
  },
  "codeStyle": {
    "scaleFunction": "scale",
    "importPrefix": "@app/"
  }
}
```

Colors from Figma are matched to your theme using Delta E (perceptual color difference):

```typescript
// Figma: #7A54FF → Matched to: palette.primary
backgroundColor: palette.primary,
```

## Examples

### Single Screen

```
Generate ProductDetailScreen from https://www.figma.com/design/ABC?node-id=10-20
```

Output:
```typescript
// .figma/screens/ProductDetailScreen/index.tsx
import { View, Text, Image, ScrollView } from 'react-native';
import { useTheme } from '@app/contexts/ThemeContext';
import { scale } from '@app/utils/responsive';

export interface ProductDetailScreenProps {
  productId: string;
}

export const ProductDetailScreen = ({ productId }: ProductDetailScreenProps) => {
  const { styles } = useTheme(createStyles);
  // ...
};
```

### Form Screen

```
Generate CheckoutForm from https://www.figma.com/design/ABC?node-id=30-40
```

Output includes:
- Form component with `react-hook-form`
- Zod validation schema
- TypeScript interfaces for form data

### Multiple Screens

```
Generate onboarding flow with screens:
- WelcomeScreen from https://www.figma.com/design/ABC?node-id=1-1
- FeaturesScreen from https://www.figma.com/design/ABC?node-id=1-2
- GetStartedScreen from https://www.figma.com/design/ABC?node-id=1-3
```

Output includes:
- All three screen components
- React Navigation types
- Shared TypeScript types
- Barrel export (`index.ts`)

## Deduplication

- **Same URL** → Updates existing component (designers may have made changes)
- **Same name** → Auto-suffixed to ensure uniqueness (e.g., `Screen2`)
- **Tracking** → All generations logged in `.figma/manifest.json`

## Development

```bash
yarn dev      # Run with hot reload (tsx)
yarn build    # Compile TypeScript
yarn start    # Run compiled version
yarn test     # Run tests
```

## Documentation

- [Flow Generation](docs/flow-generation.md) - Multi-screen generation details
- [Form Detection](docs/form-hooks.md) - Form pattern detection internals
- [Data Models](docs/data-model-generator.md) - Data model inference
- [Internal API](docs/api.md) - Programmatic TypeScript API (advanced)

## License

[PolyForm Small Business License 1.0.0](LICENSE.md)

Free for companies with <100 employees and <$1M revenue. See license for details.
