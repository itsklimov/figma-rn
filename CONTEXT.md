# Figma-RN Project Context & Testing Standards

## 🎯 Project Overview
`figma-rn` is a Model Context Protocol (MCP) server designed to generate production-ready React Native code from Figma URLs. It follows a "One URL = One Folder" philosophy, where each generation produces a self-contained component directory with code, metadata, assets, and visual references.

## 🏗️ Core Architecture (Clean Architecture)
The project is organized into structured modules to decouple reasoning from delivery:
- `src/api`: Figma API clients and raw data transformers.
- `src/core`: The brain of the system.
  - `pipeline.ts`: Transforms Figma JSON into **ScreenIR** (Intermediate Representation).
  - `detection/`: Reusable logic for identifying lists, components, and forms in the IR.
  - `mapping/`: Matches design tokens to local project themes using Delta E color matching.
  - `generation/`: Generates optimized TSX/AST code from IR and matched tokens.
- `src/edge`: MCP tool definitions and file-system delivery (`get_screen`, `generate_screen`).

## 🧪 Testing & Validation Standards
At every session, we must maintain high confidence through two primary testing layers:

### 1. Regression Testing (Stable Functionality)
We use a custom regression suite to ensure architectural changes don't break the generator's output.
- **Workflow**: Use `/regression-test` (defined in `.agent/workflows/regression-test.md`).
- **Target**: Baseline for "Мастер главная" (`2256:25238`).
- **Command**: `FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) npx tsx scripts/regression-test.mts "URL" check`

### 2. Configuration & Auto-Discovery
The tool must correctly detect the project environment.
- **Test Suite**: `tests/e2e/config-automation.test.ts`
- **What to check**:
  - `framework`: (Expo vs React Native)
  - `stylePattern`: (`useTheme` hooks vs `StyleSheet.create`)
  - `theme`: Correct path to `colors.ts`, `typography.ts`, etc.
- **Run with**: `npx vitest run tests/e2e/config-automation.test.ts`

### 3. Unified Theme Access standards
The generator follows a strict pattern for design token access:
- **Prefix**: All tokens must be accessed via `theme.*` (normalized during extraction).
- **Static Styles**: `StyleSheet.create` uses a static `import { theme } from '@app/styles'`.
- **Hooks**: Components use `const { theme } = useTheme()` for dynamic styles or props.
- **Normalization**: Intermediary containers like `masterPalette` or `clientColors` are stripped during extraction to keep paths concise (e.g., `theme.color.primary`).

## 📋 LLM Session Checklist
When starting a new task or session, always:
1.  **Check the Baseline**: Run `/regression-test` to ensure the environment is healthy.
2.  **Validate Theme detection**: If styling fails, check `.figma/config.json` to see if `colorsFile` was correctly discovered.
3.  **Use `get_screen`**: Prefer the new `get_screen` tool for any generation, as it uses the clean pipeline.
4.  **Compare Visuals**: Use the generated `screenshot.png` in the element folder to manually verify output accuracy.

## 📁 Key Folders
- `.figma/`: All generated code and workspace registry.
- `.agent/workflows/`: Automation shortcuts for LLMs.
- `scripts/`: Integration and regression testing utilities.
