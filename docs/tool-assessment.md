# Tool Assessment

## Current Runtime Contract

`figma-rn` exposes one MCP tool in production runtime:

- `get_screen`

This is the only supported generation entrypoint.

## Why `get_screen` is canonical

- Uses a staged pipeline (`normalize -> layout -> recognize -> detect -> map -> generate`).
- Produces deterministic `.figma/{category}/{name}` output.
- Integrates with project token discovery and mapping.
- Supports asset extraction and screenshot capture in the same flow.

## Historical Context

`generate_screen` and `generate_flow` were legacy handlers from older architecture iterations. They are removed from runtime contract and retained only as historical references in commit history.

## Assessment Criteria Going Forward

- Contract correctness: `tools/list` must return only `get_screen`.
- Layering discipline: `recognize/layout/detection` must not import `generation`.
- Regression safety: baseline diff for `2256:25238` remains stable unless change is intentional.
- Documentation fidelity: docs must not advertise removed legacy tools.
- Validation must stay project-agnostic: compare Figma/API input structure to generated output, not only behavior inside one concrete app codebase.

## Improvement Bits

### Bit 1: Root Public API Boundary

- Problem: root prop extraction traverses nested `Component` / `Repeater` internals and pollutes the main screen interface with implementation-level props.
- Impact: one-shot LLM handoff gets a noisy public surface with false top-level inputs.
- Validation:
  - Unit: root screen props must exclude nested component-only props.
  - Live: compare `publicApi.props.length` and generic prop names on `8136:48458` before/after.

### Bit 2: Semantic Prop Naming Gaps

- Problem: content like `18:00`, `90 мин`, `4.6`, `(254)` still degrades into `style1800`, `style90`, `style46`, `style254`.
- Impact: generated props lose intent and force extra LLM interpretation.
- Validation:
  - Unit: content-pattern and generation tests for time, duration, rating, review count, address.
  - Live: verify noisy `style*` props decrease without losing rendered values.

### Bit 3: Theme Resolution Confidence

- Problem: unresolved theme integration still leaves `theme.` references plus warnings.
- Impact: generated code can be structurally correct but not immediately portable into the target codebase.
- Validation:
  - Unit: resolve only real exported theme modules.
  - Live: compare `integration.theme.mode` and warning count before/after.

### Bit 4: Manual Validation Loop

- Every behavior change must be checked in two ways:
  - Local regression: `bun run test`
  - Live regression: `FIGMA_LIVE_TESTS=1 bunx vitest run tests/e2e/get-screen-debug.test.ts`
- Before/after comparison must use the same Figma node and compare:
  - raw/semantic input counts from Figma/IR
  - generated JSX/code structure
  - validation/fidelity deltas
- Example live fixture:
  - `https://www.figma.com/design/wQQDVitfu2TuNuAXWOXRB1/MARAFET--Copy-?node-id=8136-48458&m=dev`

### Bit 5: Scope-Safe Prop Forwarding

- Problem: parent JSX can forward child component props that are not defined in the current component scope, producing plausible-looking but uncompilable identifiers.
- Impact: generated output passes fidelity checks visually but fails one-shot handoff because LLM receives invalid TSX.
- Validation:
  - Unit: root screen must not emit `<Child label={label} />` when `label` is not part of the root API.
  - Live: inspect generated code for undefined forwarded identifiers after `get_screen`.

### Bit 6: Decorative Vector Asset Isolation

- Problem: generic vector-derived shapes (`Union`, `Ellipse`, `Line`, `Vector`) can leak into the public API as image props instead of staying internal implementation assets.
- Impact: one-shot LLM handoff gets noisy, non-semantic inputs and may preserve decorative implementation details as external props.
- Validation:
  - Unit: generic vector-exported image assets must not be extracted as props.
  - Live: `publicApi.props` for `8136:48458` must stay limited to semantic text inputs after asset export improvements.

### Bit 7: Remaining Signal Quality Work

- Problem: correctness is substantially better, but generated subcomponents still contain generic names and sparse repeater data in some paths.
- Impact: LLM still has to infer intent for `element*`-style props and under-specified repeated items.
- Validation:
  - Unit: improve semantic naming and repeater extraction coverage without reintroducing root API noise.
  - Live: compare `publicApi`, repeated item data richness, and generic prop counts before/after on `8136:48458`.

### Bit 8: Non-Latin Identifier Fidelity

- Problem: meaningful non-Latin layer names and text content can collapse to generic fallbacks like `element`, even when the content itself is semantically rich.
- Impact: one-shot LLM handoff loses intent on multilingual designs and has to reconstruct prop meaning from surrounding JSX.
- Validation:
  - Unit: `toValidIdentifier()` must transliterate non-Latin names into stable ASCII identifiers.
  - Live: `genericInterfaces.length` should trend to zero on `8136:48458` without regressing `publicApi` or runtime validation.
