# ⚡️ Figma to React Native (MCP)

> **One-Shot Production Code.** Turn any Figma screen into a clean, feature-sliced React Native component in seconds.

[![MCP](https://img.shields.io/badge/MCP-Ready-blue)](https://modelcontextprotocol.io) [![TypeScript](https://img.shields.io/badge/Built%20With-TypeScript-blue)](https://www.typescriptlang.org/)

---

## 🚀 Why Use This?

*   **Zero Manual Setup**: Auto-detects your tokens, themes, and folder structure.
*   **Production Quality**: Generates `FlatList` for lists, `react-hook-form` for inputs, and proper TypeScript interfaces.
*   **Pixel Perfect**: Uses Delta E algorithms to match Figma hex codes to your existing theme variables.
*   **Asset Handling**: Automatically downloads and links icons/images to your `./assets` folder.

## 🛠 Prerequisites

*   **Node.js** (v18+)
*   **Figma Access Token** ([Get it here](https://www.figma.com/developers/api#access-tokens))

---

## 📦 Quick Start

### 1. Install
Clone and build the server locally:

```bash
git clone https://github.com/itsklimov/figma-rn
cd figma-rn
yarn install && yarn build
```

### 2. Configure MCP (Claude Desktop)
Add this to your text editor's MCP config (e.g., `claude_desktop_config.json`):

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
*Note: Replace `/ABSOLUTE/PATH/TO/...` with the real path to the cloned folder.*

---

## 🎮 How to Use

Once installed, just ask Claude!

**"Generate this screen: [FIGMA_URL]"**

Claude will use the `get_screen` tool to:
1.  **Analyze** the Figma node.
2.  **Map** colors and spacing to your local theme.
3.  **Generate** the component, styles, and assets.
4.  **Save** everything to `.figma/screens/YourScreen`.

### Example Prompt

```text
Generate the Login screen from https://www.figma.com/design/ABC...?node-id=1-2
Save it to src/features/auth
```

### What You Get
A complete feature folder is created automatically:

```text
src/features/auth/
├── index.tsx          # ⚛️ The Main Component
├── styles.ts          # 🎨 Styles (mapped to your theme)
├── assets/            # 🖼️ Downloaded icons & images
└── meta.json          # 📊 Generation metadata
```

---

## 🔧 Core Capabilities

| Feature | Description |
| :--- | :--- |
| **Smart Lists** | Detects repeating patterns and generates optimized `FlatList` code. |
| **Theme Matching** | Never hardcodes hex values. Matches `#F00` to `theme.colors.error`. |
| **Asset Pipeline** | Extracts SVGs and PNGs, saves them locally, and generates `require()` paths. |
| **Hooks Generation** | Automatically scaffolds `useNavigation` and clean props interfaces. |

---

## ❓ Troubleshooting

**"Tool not found?"**
*   Restart Claude Desktop.
*   Check that `yarn build` completed successfully.
*   Verify the path in your config JSON is absolute and points to `dist/index.js`.

**"Images missing?"**
*   Ensure the Figma node allows export permissions.
*   The tool handles standard vector exports automatically.

---

_Built with ❤️ for speed._
