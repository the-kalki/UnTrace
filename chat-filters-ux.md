# Project Plan: Prominent Chat Navigation & Selective Privacy Clean-up

> **File:** `chat-filters-ux.md`  
> **Status:** PROPOSED & READY FOR IMPLEMENTATION (`/create`)  
> **Target Module:** UnTrace Chrome Extension (Manifest V3)  
> **Target Branch:** `feature/chats-deletion`  
> **Affected Files:**
> - `src/sidepanel/sidepanel.html`
> - `src/sidepanel/sidepanel.css`
> - `src/sidepanel/sidepanel.js`
> - `src/core/chat-cleaner.js`
> - `tests/chat.test.js`

---

## 1. Context & Objectives

### User Need:
1. **Prominent Navigation / Entry Point (Accessibility):**
   - Currently, Chat Cleanup is hidden behind a tiny 14px icon in the top right header (`#btn-toggle-chat`).
   - The user needs Chat Cleanup to be a **first-class citizen** accessible immediately upon opening the extension via a prominent mode switcher (e.g., segmented tab bar: `Posts & Comments` vs `Direct Messages & Chats [EXPERIMENTAL]`).
2. **Selective Privacy Clean-up (Point 1.2 in PRD):**
   - Currently, user can only check/uncheck items manually or use All/None.
   - User needs automated filtering tools:
     - **Date Range Filters:** `All History`, `Older than 30 days`, `Older than 90 days`, `Older than 6 months`, `Older than 1 year`.
     - **Account Status Filters:** `All Accounts`, `Deleted Accounts Only ([deleted])`, `Active Accounts`.
     - **Channel Type Filters:** `All Types`, `Legacy PMs`, `1-on-1 Direct Chats`, `Group Channels`.
     - **Search Bar:** Live search filter by username or message snippet.
     - **Smart Selection Presets:** Quick buttons like `Select Inactive / Deleted`, `Select >6 Months`, `Select All`, `Clear`.

---

## 2. Proposed Architecture & UI/UX Design

### 2.1 Navigation & Mode Architecture
- **Segmented Top Mode Switcher** directly below the telemetry/status header:
  ```html
  <nav class="mode-tab-bar">
    <button id="tab-profile-mode" class="mode-tab active">
      <svg class="mode-tab-icon">...</svg>
      <span>Posts & Comments</span>
    </button>
    <button id="tab-chat-mode" class="mode-tab">
      <svg class="mode-tab-icon">...</svg>
      <span>DMs & Chats</span>
      <span class="badge-experimental">EXPERIMENTAL</span>
    </button>
  </nav>
  ```
- **Behavior:**
  - Clicking **Posts & Comments** shows the Profile action deck, Filter rules, and Profile scan/nuke workflow.
  - Clicking **DMs & Chats** shows the Chat cleaner workspace directly in the main stage (not squished into a toggle drawer).
  - Mode preference is saved in `chrome.storage.local` (`activeMode: 'profile' | 'chat'`) so user returns to the same view on reopening.

### 2.2 Selective Privacy Clean-up Filter Toolbar
Inside the Chat Workspace, above the channel cards:
1. **Search & Filter Bar:**
   - Text input: `🔍 Search username or snippet...` (instant client-side filtering).
2. **Filter Controls Grid (2x2 or flex wrap):**
   - **Date Range Dropdown:**
     - `All Time`
     - `Older than 30 Days`
     - `Older than 90 Days`
     - `Older than 6 Months`
     - `Older than 1 Year`
   - **Account Status Dropdown:**
     - `All Users`
     - `Deleted / Inactive ([deleted])`
     - `Active Users Only`
   - **Type Dropdown:**
     - `All Formats (PMs & Modern Chat)`
     - `1-on-1 Direct Chats Only`
     - `Group Channels Only`
     - `Legacy PMs Only`
3. **Smart Preset Badges:**
   - `[Select >6 Mo]`
   - `[Select Deleted]`
   - `[All (116)]`
   - `[Clear (0)]`
4. **Item Metadata Enhancements on Cards:**
   - Display account status tag: `[DELETED]` badge if recipient/author is deleted.
   - Display humanized relative date / timestamp.
   - Dim or hide filtered-out cards smoothly.

---

## 3. Detailed Task Breakdown

### Phase 1: Navigation & Layout Architecture (UI/UX)
- [ ] **Task 1.1: Create Segmented Mode Switcher in `sidepanel.html`**
  - Place `.mode-tab-bar` with `Posts & Comments` and `DMs & Chats [EXPERIMENTAL]`.
  - Ensure responsive, tactile button styling in `sidepanel.css` adhering to `DESIGN.md`.
- [ ] **Task 1.2: Reorganize Main Content Containers**
  - Create `#view-profile` containing profile telemetry, filter rules, scan/nuke buttons.
  - Create `#view-chat` containing chat telemetry, chat filters, scan/purge controls, and scrollable channel list.
  - Add smooth fade transition between views.
- [ ] **Task 1.3: Wire Mode Switching in `sidepanel.js`**
  - Implement `switchMode(mode: 'profile' | 'chat')`.
  - Persist `activeMode` to `chrome.storage.local`.
  - Keep header chat button (`#btn-toggle-chat`) as a shortcut or sync it with the tab switcher.

### Phase 2: Chat Selective Filter Engine & Data Model
- [ ] **Task 2.1: Enhance Chat Metadata Parsing in `chat-cleaner.js` & `chat-bridge.js`**
  - Extract/normalize timestamp (`createdUtc` / `lastActivityUtc`).
  - Detect deleted/deactivated accounts (e.g., username is `[deleted]`, `ghost`, or profile inaccessible).
  - Categorize type: `legacy_pm`, `direct_chat`, `group_chat`.
- [ ] **Task 2.2: Implement Chat Filtering Logic in `sidepanel.js`**
  - Filter functions:
    - `filterBySearch(query)`
    - `filterByDate(cutoffTimestamp)`
    - `filterByAccountStatus(status: 'all' | 'deleted' | 'active')`
    - `filterByType(type: 'all' | 'pm' | 'direct' | 'group')`
  - Re-evaluate visibility and active selection dynamically.
- [ ] **Task 2.3: Implement Smart Selection Actions**
  - `selectOlderThan(days)`: Selects only visible matching items older than specified cutoff.
  - `selectDeletedAccounts()`: Selects only items with deleted participants.
  - Update `chatCountLabel` and `btnNukeChat` dynamic counter: `🔥 Purge Chats (N)`.

### Phase 3: Visual Polish & Feedback (`ui-ux-pro-max`)
- [ ] **Task 3.1: Modern Filter Bar Component in `sidepanel.css`**
  - Curated sleek dropdowns with dark elevated background (`var(--bg-surface-elevated)`), cyan focus rings, and custom chevron indicators.
  - Search input with clear button (`✕`) and instant live debounce (50ms).
- [ ] **Task 3.2: Chat Item Badges & Highlighting**
  - Distinct badge for `[DELETED]` accounts with subtle ember tint.
  - Distinct badge for `[GROUP]` vs `[DIRECT]` vs `[PM]`.
  - Matched search terms highlighted or styled clearly.
- [ ] **Task 3.3: Empty Filter State**
  - When search/filters match 0 items: Friendly UI message `"No conversations match your current filters. [Reset Filters]"`.

### Phase 4: Automated Testing & Verification
- [ ] **Task 4.1: Extend `tests/chat.test.js`**
  - Test date-based filtering logic (cutoff timestamps for 30d, 90d, 180d, 365d).
  - Test deleted account detection and smart selection.
  - Test search filter string matching.
- [ ] **Task 4.2: Browser Integration Verification**
  - Test switching modes between Profile and Chat.
  - Test selecting 116 chats with date filters and verifying `Purge Chats (N)` updates correctly.

---

## 4. Verification Checklist (Definition of Done)

- [ ] Extension opens with prominent segmented navigation (`Posts & Comments` vs `DMs & Chats [EXPERIMENTAL]`).
- [ ] User can switch between Profile mode and Chat mode in 1 click.
- [ ] Mode persists across sidepanel close/reopen.
- [ ] Chat drawer/view includes:
  - [ ] Search input for usernames & snippets.
  - [ ] Date filter dropdown (All, 30d, 90d, 6mo, 1yr).
  - [ ] Account status filter (All, Deleted, Active).
  - [ ] Smart selection buttons (`Select >6 Mo`, `Select Deleted`, `All`, `None`).
- [ ] All action buttons (`Export JSON`, `Purge Chats (N)`) stay above the fold and update their count dynamically.
- [ ] All unit tests pass (`npm test`).
