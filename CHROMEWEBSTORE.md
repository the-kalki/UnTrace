# Chrome Web Store Listing — UnTrace: Bulk Reddit Privacy Cleaner

> Last Updated: 2026-10-03

## Store Listing

**Extension Name** [REQUIRED]
UnTrace - Bulk Reddit Privacy Cleaner

**Short Description** [REQUIRED]
Bulk overwrite & delete Reddit posts, comments, and chat messages with a persistent side panel to protect your digital privacy.

**Detailed Description** [REQUIRED]
Bulk Reddit Nuke & Privacy Cleaner is a 100% Free & Open-Source privacy extension designed to give you complete control over your Reddit history.

When you delete comments directly on Reddit, third-party scrapers and web archives may still preserve your original words. This extension uses a two-stage overwriting engine: it first overwrites your comments and submissions with cryptographically randomized gibberish before issuing permanent deletion requests. This ensures your original content is replaced in version caches and scrapers before deletion.

KEY FEATURES
- Persistent Side Panel: Runs smoothly inside Chrome's dedicated side panel so you can monitor real-time progress without risk of closing a popup window.
- Overwrite Before Delete: Replaces comment and submission text with random characters before permanently deleting.
- One-Click Pre-Nuke Backup: Export a complete JSON backup of all your posts and comments before performing any deletion.
- Bulk Posts & Comments Purge: Scans and cleans thousands of items sequentially with built-in rate-limit protection.
- Experimental Chat Cleaner: Includes a dedicated beta module to delete Reddit Chat messages and conversation history.
- Advanced Custom Filters: Filter deletions by date range, karma score threshold, or specific subreddits.
- 100% Free & Open-Source: No paywalls, no subscriptions, and zero tracking.

HOW TO USE
1. Log in to your Reddit account in Google Chrome.
2. Click the extension icon in your Chrome toolbar to open the Side Panel.
3. Configure your desired filters (or select "Clean All").
4. Click "Export Backup" to save a local copy of your history.
5. Click "Start Overwrite & Delete" to run the automated privacy cleaner.

PRIVACY & SAFETY FIRST
Your credentials and session tokens never leave your browser. All requests are sent directly from your own browser tab to Reddit's servers. There are no tracking scripts, third-party servers, or hidden analytics.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Bulk overwrite and permanently delete comments, posts, and chats on Reddit to protect user privacy.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|---|---|---|---|
| Store Icon [REQUIRED] | 128×128 PNG | ⬜ Not created | `assets/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | `assets/screenshots/screenshot-1.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | `assets/screenshots/screenshot-2.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | `assets/screenshots/screenshot-3.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | `assets/promo/promo-small.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | `assets/promo/promo-marquee.png` |

---

## Permissions Justification

| Permission | Type | Justification |
|---|---|---|
| `sidePanel` | permissions | Displays the persistent deletion dashboard and live terminal logs without interrupting user browsing. |
| `storage` | permissions | Saves user preferences, deletion filter rules, and ongoing job progress so operations can pause and resume across browser sessions. |
| `alarms` | permissions | Manages rate-limiting timers and resumes paused bulk queues in the background service worker without keeping CPU threads constantly blocked. |
| `tabs` | permissions | Accesses the active Reddit tab URL and ID from the side panel to ensure actions only execute on authenticated Reddit pages. |
| `*://*.reddit.com/*` | host_permissions | Communicates directly with Reddit's web platform to harvest user comments, execute edit overwrite requests, and issue deletion commands on behalf of the logged-in user. |
| `*://gql.reddit.com/*` | host_permissions | Connects to Reddit's modern GraphQL API to query and delete direct chat messages and conversation threads in the experimental module. |

---

## Privacy & Data Use

### Data Collection
**Does the extension collect user data?** No

All operations run entirely client-side inside the user's browser. Zero personal communications, authentication tokens, or post content are collected or transmitted to external servers.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://[username].github.io/BulkRedditActions/privacy-policy.html

---

## Distribution

**Visibility**: Public  
**Regions**: All regions  

---

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| 1.0.0 | 2026-10-03 | Initial release with Side Panel UI, Post/Comment overwrite & delete, Pre-nuke backup, Experimental Chat cleaner, and rate-limiting. | Draft |
