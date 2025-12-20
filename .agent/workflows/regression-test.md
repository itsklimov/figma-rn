---
description: Run regression testing to compare tool output before and after changes
---

// turbo-all

# Regression Testing Workflow

Use this workflow to verify that your changes to the generator logic preserve or improve code quality. This workflow tracks changes to the specific screen: **Мастер главная** (`2256:25238`).

## 1. Run Regression Check
Run this command after making changes to compare the new output with the baseline.
`FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) npx tsx scripts/regression-test.mts "https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2256-25238&m=dev" check`

## 2. Evaluate Changes
The script will notify you if changes were detected.
- If **NO CHANGES** are detected, your refactoring was neutral (perfect for architectural cleanups).
- If **CHANGES** are detected, compare the files to ensure they are improvements.

**Compare command:**
`diff .figma/regression/baselines/baseline_2256-25238.tsx .figma/regression/current/baseline_2256-25238.tsx`

## 3. Update Baseline
If the changes are intentional and desired (e.g., adding a new feature or fixing a bug), update the baseline so future tests compare against this new state.
`FIGMA_TOKEN=$(grep FIGMA_TOKEN .env | cut -d '"' -f 2) npx tsx scripts/regression-test.mts "https://www.figma.com/design/UP4RaLYLk41imjPis2j6an/MARAFET-dev?node-id=2256-25238&m=dev" baseline`
