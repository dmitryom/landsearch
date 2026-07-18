# Draggable Map Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plot details, quick filters, and plot results panels independently movable and pinnable on desktop while preserving their current mobile layout.

**Architecture:** Add a focused `DraggableMapPanel` render-prop component that owns pointer/keyboard movement, viewport clamping, persistence, and responsive disabling. Existing feature components keep their content and actions, and only place their current outer panel inside the shared positioning wrapper.

**Tech Stack:** Next.js 15, React, TypeScript, Tailwind CSS, Lucide icons, browser `PointerEvent`, existing safe storage helpers, Node test runner, Playwright CLI.

## Global Constraints

- Panels start pinned in their existing positions.
- Dragging is enabled only after the user explicitly unpins a panel.
- State is stored independently under `landsearch:panel:plot`, `landsearch:panel:quick-filters`, and `landsearch:panel:results`.
- Free movement is disabled below `768px`.
- No new runtime dependency is introduced.
- Interactive controls and scroll areas must not initiate dragging.
- Panels must remain inside the map workspace after dragging and window resize.

---

### Task 1: Shared persistent draggable panel

**Files:**
- Create: `frontend/components/ui/DraggableMapPanel.tsx`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Produces: `DraggableMapPanel({ storageKey, anchor, className, mobileClassName, children })`.
- Produces render state: `{ pinned, canDrag, dragHandleProps, togglePinned, resetPosition }`.
- Supported anchors: `'top-right' | 'bottom-right' | 'bottom-center'`.

- [ ] **Step 1: Write the failing contract test**

Add source assertions that require pointer capture, `localStorage` keys through `safeGet`/`safeSet`, `Pin`/`PinOff`, keyboard arrows, `Home`, a `768px` media query, and clamping against the parent rectangle.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: FAIL because `DraggableMapPanel.tsx` does not exist.

- [ ] **Step 3: Implement the shared component**

Create a client component with these public types:

```tsx
export type PanelAnchor = 'top-right' | 'bottom-right' | 'bottom-center'

export interface DraggablePanelControls {
  pinned: boolean
  canDrag: boolean
  dragHandleProps: React.HTMLAttributes<HTMLElement>
  togglePinned: () => void
  resetPosition: () => void
}
```

Persist `{ x: number, y: number, pinned: boolean }`, defaulting to `{ x: 0, y: 0, pinned: true }`. Use pointer capture and window-level move/up listeners. Ignore pointer starts from `button`, `a`, `input`, `select`, `textarea`, `[role="button"]`, and `[data-no-panel-drag]`. Clamp each movement using the panel and parent bounding rectangles. Re-clamp on `resize`. Disable movement when `matchMedia('(max-width: 767px)')` matches. Support `Arrow*`, `Shift+Arrow*`, and `Home` on the drag handle.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the shared infrastructure**

```bash
git add frontend/components/ui/DraggableMapPanel.tsx frontend/tests/settlement-map-link.test.mjs
git commit -m "feat: add persistent draggable map panel"
```

### Task 2: Integrate the three map panels

**Files:**
- Modify: `frontend/components/ui/PlotPopup.tsx`
- Modify: `frontend/components/ui/QuickFilters.tsx`
- Modify: `frontend/components/PlotCardList.tsx`
- Modify: `frontend/tests/settlement-map-link.test.mjs`

**Interfaces:**
- Consumes: `DraggableMapPanel` and `DraggablePanelControls` from Task 1.
- Uses storage keys `landsearch:panel:plot`, `landsearch:panel:quick-filters`, `landsearch:panel:results`.

- [ ] **Step 1: Write failing integration assertions**

Require every component to render `DraggableMapPanel`, its exact storage key, pin/reset controls with accessible labels, and a drag handle. Require `PlotCardList` maximized mode to suppress custom translation and restore it afterward.

- [ ] **Step 2: Run the test and verify RED**

Run: `cd frontend && node --test tests/settlement-map-link.test.mjs`

Expected: FAIL because the panels do not consume the shared component.

- [ ] **Step 3: Wrap `PlotPopup`**

Use anchor `top-right`. Put the drag handle on the cadastral header, and add icon-only `Pin`/`PinOff` and `RotateCcw` controls beside copy and close. Keep the existing dialog role, focus behavior, tabs, lead form, and scrolling inside the panel.

- [ ] **Step 4: Wrap `QuickFilters`**

Use anchor `bottom-center`. Make the «Быстрый выбор» label the drag handle when unpinned, add pin and reset icon buttons, and keep filter chips horizontally scrollable and independently clickable.

- [ ] **Step 5: Wrap `PlotCardList`**

Use anchor `bottom-right`. Make the list title area the drag handle, add pin and reset controls, and keep resize, hide, expand, compare, favorite, and CSV actions unchanged. When maximized, set the wrapper to its default translation and disable drag until maximization ends.

- [ ] **Step 6: Run integration tests and production build**

Run:

```bash
cd frontend
node --test tests/settlement-map-link.test.mjs
NODE_ENV=production NEXT_PUBLIC_API_URL=https://v3163460.hosted-by-vdsina.ru/api/v1 npm run build
```

Expected: tests pass and Next.js build exits `0`.

- [ ] **Step 7: Commit integrations**

```bash
git add frontend/components/ui/PlotPopup.tsx frontend/components/ui/QuickFilters.tsx frontend/components/PlotCardList.tsx frontend/tests/settlement-map-link.test.mjs
git commit -m "feat: make map panels movable and pinnable"
```

### Task 3: Production deployment and browser verification

**Files:**
- Verify deployed frontend output only; no new source file.

**Interfaces:**
- Consumes all Task 1 and Task 2 behavior.

- [ ] **Step 1: Restart the frontend from the completed build**

Restart `landsearch-frontend` only after `.next/standalone/server.js` and the referenced static chunks exist. Verify `/`, the page chunk, and service health return successful responses.

- [ ] **Step 2: Test desktop pointer movement**

At `1280x800`, select a plot, unpin and drag each of the three panels, pin it, and verify it no longer moves. Reload and verify all positions persist. Use «Вернуть исходное положение» and verify the default placement returns.

- [ ] **Step 3: Test viewport constraints and panel actions**

Attempt to drag each panel beyond all four edges. Verify headers remain reachable. Exercise plot tabs, quick filters, list resize/hide/maximize, and a plot selection to ensure drag handling does not steal control events.

- [ ] **Step 4: Test responsive layout**

At `390x844`, verify the existing lower-sheet layout, hidden desktop pin controls, usable filters, and no overlap with the map toolbar.

- [ ] **Step 5: Capture and inspect visual evidence**

Capture screenshots at `1280x800`, `1440x900`, and `390x844`. Check canvas pixels are nonblank and that no panel or text overlaps incoherently.

- [ ] **Step 6: Run final verification**

Run frontend tests again, check `git diff --check`, service state, root HTTP `200`, and browser console/network errors. Remove temporary browser sessions before reporting completion.
