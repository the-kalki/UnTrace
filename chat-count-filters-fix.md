# Implementation Plan: Chat Purge Dynamic Count, 7-Day Filter & 134 vs 64 Conversations Audit

**Plan File:** `chat-count-filters-fix.md`  
**Date:** 2026-10-03  
**Status:** DRAFT (Awaiting User Review / `/create`)

---

## 1. Problem Statement & User Requirements

1. **Dynamic Purge Button Counter:**
   - **Current Behavior:** The purge button shows a static/global count `🔥 Purge Chats (${state.selectedChatIds.size})` (e.g. 64), even when filters are applied and only a subset (e.g. 5) of conversations are shown on screen.
   - **Target Behavior:** The button must dynamically update to reflect the count of *currently visible & selected* conversations (e.g. `🔥 Purge Selected (5)`). Purge execution must strictly target the visible selected set when filtering is active to prevent accidentally wiping filtered-out conversations.

2. **New Date Filter: `> 7 Days Old`:**
   - **Current Dropdown Options:** `All Dates`, `> 30 Days Old`, `> 90 Days Old`, `> 6 Months Old`, `> 1 Year Old`.
   - **Target Behavior:** Insert `<option value="7d">&gt; 7 Days Old</option>` right below `All Dates` in `sidepanel.html` and support `7d` in `filterChatItems()` in `chat-cleaner.js`.

3. **Discrepancy Investigation & Recovery (134 Initial vs 64 Current):**
   - **The Issue:** The user observed 134 total conversations in initial scans, but after recent changes only 64 conversations are discovered.
   - **Priority Goal:** Determine whether the initial 134 included duplicates (64 x 2 = 128 + PMs/headers) caused by dual ID schemes (`/chat/user/x` vs `chat_x`), or whether valid conversations are being omitted due to DOM virtualization/scrolling limits, restrictive row heuristics, or unpaginated API endpoints. Implement auto-scrolling DOM extraction and multi-page harvesting to ensure 100% of conversations are captured.

---

## 2. Technical Investigation & Root Cause Hypotheses

### A. The 134 vs 64 Count Mystery
1. **Hypothesis 1 (Double Extraction Duplication):**
   - Before the normalized ID fix, Strategy 1 (`<a>` tags) assigned `id = href` (`https://www.reddit.com/chat/user/name`) and Strategy 2 (`candidateRows`) assigned `id = chat_name`.
   - Because both strategies scanned the same conversation row with different IDs, every conversation was added twice ($64 \times 2 = 128$, plus active tabs/PMs = $134$).
2. **Hypothesis 2 (Virtual Scrolling Drop-off in DOM):**
   - Reddit's modern chat list is a virtualized scroller (`virtuoso-scroller` or shadow DOM scroller). At any one moment without scrolling, Reddit DOM only mounts ~40–65 visible rows.
   - If the user had previously scrolled down their chat list on Reddit before scanning, all 134 rows were mounted; if scanned while unscrolled, only ~64 rows are mounted!
   - **Fix:** Add automatic iterative scrolling in `chat-bridge.js` during `SCAN_CHAT_DOM` to traverse the chat channel scroller and capture all conversation items.
3. **Hypothesis 3 (Overly Strict Heuristics in Strategy 2):**
   - `firstLine.length > 30` drops group chats with long titles (e.g. "Crypto Discussions & Trading").
   - `lines.length >= 2 && lines[0].length < 24` drops rows where preview text or timestamps are rendered in separate flex containers.
4. **Hypothesis 4 (Unpaginated Legacy PMs):**
   - `fetchLegacyPMs` has a single-page fetch of `limit=100`. Reddit PMs frequently span multiple pages using `after` pagination cursors.

---

## 3. Step-by-Step Task Breakdown

### Phase 1: Dynamic Purge Button Count & Scoped Execution
- **File:** `src/sidepanel/sidepanel.js`
  - In `updateChatButtonStates()`:
    - Calculate `selectedVisibleCount` (count of IDs in `state.selectedChatIds` that are currently rendered in the filtered view).
    - If filters are applied (`totalFiltered < totalDiscovered`):
      - Update button text: `selectedVisibleCount > 0 ? "🔥 Purge Selected (" + selectedVisibleCount + ")" : "🔥 Purge Selected"`
      - Button disable condition: `selectedVisibleCount === 0 || state.isChatPurging`.
    - If no filters are applied (`totalFiltered === totalDiscovered`):
      - Update button text: `selectedTotalCount > 0 ? "🔥 Purge Chats (" + selectedTotalCount + ")" : "🔥 Purge Chats"`
      - Button disable condition: `selectedTotalCount === 0 || state.isChatPurging`.
  - In `handleNukeChats()`:
    - When executing the purge, extract only the *visible and selected* channel IDs if filters are active, or prompt the user with clear confirmation:
      `"Permanently purge ${targetIds.length} selected chats/messages? This cannot be undone."`

---

### Phase 2: Add `> 7 Days Old` Filter Option
- **File:** `src/sidepanel/sidepanel.html`
  - Update `#chat-filter-date`:
    ```html
    <select id="chat-filter-date" class="chat-filter-select" title="Filter by conversation date">
      <option value="all">All Dates</option>
      <option value="7d">&gt; 7 Days Old</option>
      <option value="30d">&gt; 30 Days Old</option>
      <option value="90d">&gt; 90 Days Old</option>
      <option value="180d">&gt; 6 Months Old</option>
      <option value="365d">&gt; 1 Year Old</option>
    </select>
    ```
- **File:** `src/core/chat-cleaner.js`
  - In `filterChatItems(items, filters)`:
    - Add:
      ```javascript
      if (dateRange === '7d') maxAgeDays = 7;
      ```

---

### Phase 3: Comprehensive 134 vs 64 Recovery & Auto-Scroll Scanner
- **File:** `src/content/chat-bridge.js`
  - **Iterative Channel Scroller:**
    - Add `scrollChatChannelsContainer(roots)` to find channel list scroll containers:
      `[data-testid*="channel-list"], [data-testid*="virtuoso-scroller"], nav[aria-label*="chat" i], div[class*="channelList" i]`.
    - In `SCAN_CHAT_DOM`, perform 3–5 rapid scroll steps down the conversation list with micro-sleeps (80ms) to ensure virtualized DOM rows are rendered and gathered into `seenIds`.
  - **Relax Restrictive Row Filters:**
    - Increase title length check from `30` to `60` characters for group channels.
    - Check for usernames formatted as `u/username`, display names, or channel cards.
    - Support additional selector fallbacks: `[data-testid*="conversation-list-item"]`, `div[role="row"]`, `div[role="listitem"]`.
- **File:** `src/core/chat-cleaner.js`
  - **Multi-page Legacy PM Harvesting:**
    - Update `fetchLegacyPMs(limit = 100)` to support pagination loop (`after` token) up to 500 messages so no older direct messages are dropped.

---

### Phase 4: Automated Testing & Verification
- **File:** `tests/chat.test.js`
  - Add test case for `dateRange: '7d'`:
    - Ensure an 8-day-old message is included and a 2-day-old message is filtered out.
  - Add test case verifying dynamic count logic with filtered subsets.
  - Run `npm test` to verify 100% test passing.

---

## 4. Verification Checklist & Success Criteria

- [ ] **Dynamic Purge Button:** When 64 chats exist and filter shows 5, button says `🔥 Purge Selected (5)`. When 0 visible are checked, button is disabled.
- [ ] **7-Day Filter:** Selecting `> 7 Days Old` properly displays chats older than 7 days without returning 0.
- [ ] **Total Count Recovery:** Auto-scroll scan captures all virtualized conversation rows without duplicates.
- [ ] **Zero Duplicate IDs:** Every direct chat and channel has a consistent normalized ID.
- [ ] **Unit Tests:** `npm test` passes with zero regressions.

---

## 5. Next Steps
- User review of this plan.
- Run `/create` to implement all phases across `sidepanel.html`, `sidepanel.js`, `chat-cleaner.js`, `chat-bridge.js`, and `chat.test.js`.
