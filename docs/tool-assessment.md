# Figma-RN Tool Assessment

## 1. Legacy Tools Comparison: `generate_screen` vs `generate_flow`

Between the two legacy tools, **`generate_screen` is currently superior** for production-grade work.

| Feature | `generate_screen` (Legacy) | `generate_flow` (Legacy) |
| :--- | :--- | :--- |
| **Focus** | Depth & Polish (Single Component) | Breadth & Structure (Multi-screen) |
| **Output Quality** | High: Self-contained folder with screenshot, tokens, and assets. | Medium: Scaffolds navigation but may need more cleanup. |
| **Validation** | Built-in screenshot capture and LLM review checklist. | Summary-based; hard to verify all screens at once visually. |
| **Persistence** | Categorized into `.figma/screens`, `/modals`, etc. | Flatter file structure, usually direct to project folders. |

**Verdict**: `generate_screen` is better because it ensures each component is "correct" before moving to the next. The "one URL = one folder" philosophy provides a safer, more verifiable developer experience.

---

## 2. The New Architecture: `get_screen`

The refactoring move from root-level monolithic scripts to structured modules (`src/core`, `src/edge`, `src/api`) is a massive leap forward.

### Why `get_screen` is the "Future":
- **Intermediate Representation (IR)**: Unlike legacy tools that try to generate code directly from raw Figma JSON, `get_screen` uses a **ScreenIR** layer. This allows for complex transformations (like layout detection and semantic recognition) to happen *before* a single line of code is written.
- **Multi-File Extraction**: It automatically identifies repeated patterns and extracts them into sub-components, following React best practices.
- **Token Mapping**: It matches Figma colors/spacing against your *actual* project theme tokens, avoiding hardcoded hex values.

---

## 3. Assessment Against the "Ideal One-Shot Tool"

An ideal one-shot Figma-to-code tool should meet three criteria:
1.  **Architectural Integrity** (Represented by `get_screen`)
2.  **Rich Validation & Assets** (Represented by `generate_screen`)
3.  **Semantic Intelligence** (Deep recognition of forms, lists, etc.)

### Current Gap Analysis:
*   **Legacy (`generate_screen`)** has the **Assets & Validation**.
*   **New (`get_screen`)** has the **Architecture & Clean Code**.

**Final Recommendation**:
You should prioritize **`get_screen`** as your primary tool. It produces more maintainable code and respects your existing theme. However, it would reach "Ideal Status" by incorporating the rich verification features (screenshot embeds and detailed review checklists) that currently exist in the legacy `generate_screen` handler.

The refactoring to "Structured Folders" has successfully decoupled the **Reasoning** (Core) from the **IO/Delivery** (Edge), making the entire system significantly more efficient and easier to evolve.
