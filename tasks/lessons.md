# Dev Lessons & Patterns

## 1. Concurrency Bugs in Controlled Debounced Input Components
- **Issue:** When a React controlled text component (like `PromptEditor`) submits debounced saves to a global store (Zustand), those saves often trigger an asynchronous re-render that updates the component's state via a `useEffect` synchronization. If the user continues typing during the time between when the `save` starts and when the global update trickles back down (the "echo"), the older "echoed" state will overwrite the user's newest typed keystrokes. This results in the input cursor jumping to the beginning or end of the text and chunks of typed text completely vanishing.
- **Solution:** Implement an external state update SHIELD.
  - In `NoteEditor.jsx`, an `isEditing` toggle (active on focus) ignores external component updates.
  - In `Dashboard.jsx` and `SnippetLibrary.jsx`, since focus management might be too complicated or lost during renders for CodeMirror, we use an `isTypingRef.current = true` with a timeout (e.g., 1000ms after the last typed character) that blocks the `useEffect` from overwriting local editor state while actively typing.
- **Rule for LLM:** Always check bidirectional state bindings for delayed-echo bugs if debounced saves are hooked up to a unified backend/store. Never blindly allow `useEffect([globalVal]) -> setLocalVal(globalVal)` on active input nodes without a typing/editing shield.

## 2. CodeMirror Render Bottlenecks (Inline Functions)
- **Issue:** Passing inline anonymous functions (e.g., `onChange={(val) => setContent(val)}`) or unstable prop references to heavy third-party React wrappers like `@uiw/react-codemirror` causes massive typing lag. CodeMirror interprets the reference change as a directive to tear down and reconstruct its internal update listener extensions on *every keystroke*.
- **Solution:** ALWAYS memoize `onChange` handlers passed to `<CodeMirror>`. If the callback comes from a parent component and might be unstable, use the `useRef` + `useCallback` pattern to sever the reference dependency.
- **Rule for LLM:** Never pass un-memoized arrow functions directly into `<CodeMirror>` event props.

## 3. Shared Debounce Timers & Cross-Instance Race Conditions
- **Issue:** When multiple instances of an editor component (e.g. 34 Steps in a Prompt Chain) share a parent-level `debounceTimer` and `localEditorContent` state, clicking to type in a different instance *clears the timer* of the previous instance. The text typed in the previous editor is permanently lost because it is never flushed to the database. Additionally, asynchronous React state updates (`setActiveStepId`) fight against immediate keystroke events, resulting in new characters being wiped by stale closure data.
- **Solution:** 
  1. Pass explicit contextual IDs directly into the `onChange` event (`onEditorChange(val, step.id)`) so the timer *always* knows exactly which entity the data belongs to, defying stale closures.
  2. Implement a **Synchronous Flush Pipeline** (`flushPendingSave()`). Whenever the user clicks another step, clicks a button (Copy/Launch/Snapshot), or leaves the view, immediately clear the timer and synchronously execute the save with the pending data.
- **Rule for LLM:** If a debounced save mechanism manages data for a list or multi-view component, context switching MUST forcefully trigger a flush of pending updates before the local state is overwritten by the new context.

## 4. Stale Closures in Memoized Components with Ref-Callbacks
- **Issue:** When a component is wrapped in `React.memo` to prevent re-renders, and it uses `useLayoutEffect` to keep an `onChangeRef` updated, the ref will ONLY update if the component actually re-renders. If the parent's state changes (e.g., `activeStepId` changes) but the memoized props (e.g., `value=""`) stay exactly the same, the memoized component does NOT re-render. Consequently, the `onChangeRef` is trapped with a stale closure from the previous render. When the user eventually types, the stale callback executes, causing logic that relies on current state (like `activeStepId === targetStepId`) to fail silently.
- **Solution:** Never rely on closure variables inside handlers passed to deeply memoized components. Always use a mutable `useRef` (e.g., `activeStateRef.current = { stepId }`) in the parent component to guarantee access to the absolute latest state during event execution, regardless of when the callback was captured.
