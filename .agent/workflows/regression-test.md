---
description: Run regression testing to compare tool output before and after changes
---

// turbo-all

# Regression Testing Workflow

Use this workflow to verify that your changes to the generator logic preserve or improve code quality.

## 1. Run Regression Check
Run this command after making changes to compare the new output with the baseline.
`FIGMA_TOKEN=... npx tsx scripts/regression-test.mts "<figma-url-with-node-id>" check "<target-project-root>"`

## 2. Evaluate Changes
The script will notify you if changes were detected.
- If **NO CHANGES** are detected, your refactoring was neutral (perfect for architectural cleanups).
- If **CHANGES** are detected, compare the files to ensure they are improvements.

**Compare command:**
`diff .figma/regression/baselines/baseline_<node-id>.tsx .figma/regression/current/baseline_<node-id>.tsx`

## 3. Update Baseline
If the changes are intentional and desired (e.g., adding a new feature or fixing a bug), update the baseline so future tests compare against this new state.
`FIGMA_TOKEN=... npx tsx scripts/regression-test.mts "<figma-url-with-node-id>" baseline "<target-project-root>"`
