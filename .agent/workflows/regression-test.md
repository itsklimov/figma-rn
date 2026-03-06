---
description: Run regression testing to compare generator output before and after changes
---

// turbo-all

# Regression Testing Workflow

Use this workflow to validate architectural refactors and generation changes against the baseline screen **Мастер главная** (`2256:25238`).

## 1. Run Regression Check

```bash
FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) bunx tsx scripts/regression-test.mts "https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2256-25238&m=dev" check
```

## 2. Inspect Diff if Changed

```bash
diff .figma/regression/baselines/baseline_2256-25238.tsx .figma/regression/current/baseline_2256-25238.tsx
```

- No changes: refactor is output-neutral.
- Changes detected: verify they are intentional improvements.

## 3. Update Baseline (Intentional Changes)

```bash
FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) bunx tsx scripts/regression-test.mts "https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2256-25238&m=dev" baseline
```
