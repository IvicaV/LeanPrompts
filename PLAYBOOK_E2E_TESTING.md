# 📘 Playbook: Automated E2E Injection Testing & Diagnostics

> **LeanPrompts Studio** — Automated End-to-End Testing & Verification Framework

This Playbook serves as a quick reference guide for running, maintaining, and debugging the automated **Playwright E2E Injection Matrix** across all 15+ supported LLM platforms.

---

## 🚀 Quick Command Reference

All commands must be executed from the project root (`Lean Prompts Test`).

```powershell
# 1. ALWAYS build the Chrome Extension before running E2E tests
npm run build

# 2. Run the FULL LLM Injection Matrix (All LLMs, All Modifiers)
npm run test:e2e

# 3. Test a SPECIFIC LLM (e.g., Gemini, ChatGPT, Claude)
npx playwright test --grep "Gemini"
npx playwright test --grep "ChatGPT"
npx playwright test --grep "Claude"

# 4. Interactive UI Mode (Visual Step-by-Step Execution)
npx playwright test --ui

# 5. Headed Debug Mode (Pauses browser execution for inspector inspection)
npx playwright test --debug
```

---

## 🧪 The Injection Test Matrix

The test runner iterates through all registered LLM strategies in `tests/e2e/llm-matrix.spec.js` and tests 5 core interaction variants:

| Test # | Variant | Modifiers | Tab State | Expected Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **[1]** | Standard Click (Text Only) | None | **Cold Start** (Tab Closed) | Target LLM tab opens ➔ Instant "Injecting..." toast ➔ Text injected ➔ Toast "Prompt synchronized!" |
| **[2]** | Standard Click (Text + Files) | None | **Cold Start** | Target LLM tab opens ➔ Files + Text staged ➔ Success toast |
| **[3]** | Ctrl + Click (Text Only) | `Ctrl / Meta` | **Warm Start** (Tab Open) | Tab reloads/navigates (`forceNavigate: true`) ➔ Text staged in fresh chat ➔ Success toast |
| **[4]** | Ctrl + Click (Text + Files) | `Ctrl / Meta` | **Warm Start** | Tab reloads ➔ Files + Text staged in fresh chat ➔ Success toast |
| **[5]** | Shift + Click (Open Only) | `Shift` | Any | `text = null` ➔ Target LLM tab opens ➔ Toast "Opening [LLM]..." ➔ No prompt injected |

---

## 🛑 Negative Behavior & Diagnostic Assertions

The test suite automatically fails or logs warnings on negative user experiences:

### 1. Toast Absence Detection (Missing Toast Alert)
- **Assertion**: `#lp-status-toast` must appear in the top-right corner of the target LLM tab within **6,000 ms**.
- **Failure Trigger**: If no toast appears, the test fails with:
  `[FAIL] [LLM]: Status toast (#lp-status-toast) did NOT appear within 6000ms!`

### 2. Latency Threshold Warning (Performance Degradation)
- **Benchmark**: Execution latency from button click to success toast is measured.
- **Warning Trigger**: If latency exceeds **8,000 ms**, a performance warning is logged in the test summary:
  `[PERF WARNING] [LLM] injection took 9400ms (threshold: 8000ms)`

### 3. Editor Text Verification
- **Assertion**: Reads target editor DOM element (`textarea`, `contenteditable`, `ProseMirror`) and verifies expected prompt text is present.

---

## 🛠️ Troubleshooting Guide: When an LLM Changes Its UI

If a third-party LLM (e.g., Gemini, ChatGPT) updates its web interface and an E2E test fails:

### Step-by-Step Repair Workflow

1. **Isolate the failing LLM in Headed Mode**:
   ```powershell
   npx playwright test --grep "Gemini" --headed
   ```
2. **Inspect the DOM in Playwright Inspector**:
   Identify the new CSS class, ID, or Shadow DOM host element for the editor or file input button.

3. **Update the Strategy File**:
   Open `src/engine_core/strategies/[LLMName]Strategy.js` and update `getInput()` or `getFileInput()`.

4. **Rebuild & Verify**:
   ```powershell
   npm run build
   npx playwright test --grep "[LLMName]"
   ```

5. **Commit the Fix**:
   ```powershell
   git add .
   git commit -m "fix([llm]): update selector for new UI layout"
   git push
   ```

---

## ➕ How to Add a New LLM to the Test Matrix

When integrating a new LLM platform:

1. Create `src/engine_core/strategies/NewLLMStrategy.js` extending `AbstractBaseStrategy`.
2. Register it in `src/engine_core/strategies/InjectionManager.js`.
3. Add entry to `LLMS_TO_TEST` array in `tests/e2e/llm-matrix.spec.js`:
   ```javascript
   { name: 'NewLLM', url: 'https://newllm.ai', selector: 'textarea' }
   ```
4. Run `npm run build && npm run test:e2e` to validate.

---
*LeanPrompts Studio Playbook — Keep this document in your project stack folder for fast access.*
