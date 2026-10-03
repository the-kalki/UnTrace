# ⚡ UnTrace — Bulk Reddit Privacy Cleaner

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.png?v=103)](https://github.com/the-kalki/UnTrace)

> **UnTrace** is a 100% Free & Open-Source, privacy-first Chrome Extension built to bulk overwrite and permanently erase your Reddit comments, submissions, and chat history. Designed with a sleek, space-optimized Chrome Side Panel.

---

## 🌟 Why UnTrace?

When you delete comments directly on Reddit, third-party scrapers and web archives may still cache your original text. UnTrace solves this with a **Two-Stage Destructive Pipeline**:
1. **Stage 1 (Overwrite):** Overwrites comment and submission bodies with cryptographically secure random alphanumeric gibberish so that live caches and search engines replace the original text with junk.
2. **Stage 2 (Purge):** Calls Reddit's permanent deletion endpoints to remove the record completely from Reddit's database.

---

## ✨ Features

- 🖥️ **Persistent Chrome Side Panel:** Built with `chrome.sidePanel` so you can monitor real-time progress without fear of closing a popup.
- ⚡ **Zero External API Keys Needed:** Operates securely inside your authenticated browser session using Reddit's session cookies and CSRF `modhash`.
- 💾 **Pre-Nuke JSON Export:** One-click offline backup export of your complete Reddit history (`.json`) before executing permanent deletions.
- 🎯 **Granular Scope & Filters:**
  - Date Scopes: All time, older than 1 month, 6 months, or 1 year.
  - Karma Guard: Preserve high-karma contributions above a custom threshold.
  - Subreddit Rules: Whitelist (only delete selected) or Blacklist (preserve selected).
  - Safety Preserves: Automatically skip saved and gilded items.
- ⏳ **Adaptive Rate Limiter:** Built-in jitter delays (600ms–1200ms) with automatic exponential backoff on HTTP 429 ("Too Many Requests") to keep your account safe from throttling.
- 💬 **Reddit Chat Cleaner (Beta):** Dedicated module to purge one-on-one direct messages and chat channels.
- 🛡️ **100% Client-Side & Private:** Zero tracking, zero telemetry, and zero data leaves your browser.

---

## 🚀 Quick Start (Load in Google Chrome)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/the-kalki/UnTrace.git
   cd UnTrace
   ```
2. Open Google Chrome and go to `chrome://extensions`.
3. In the top-right corner, enable **Developer mode**.
4. Click **Load unpacked** in the top-left corner.
5. Select this `UnTrace` folder.
6. Open [Reddit](https://www.reddit.com) in any tab, make sure you are logged in, and click the **UnTrace** icon in your toolbar to open the Side Panel.

---

## 🧪 Testing

Run unit tests directly with Node.js:
```bash
node tests/core.test.js
```

---

## 🤝 Open for Contributions!

UnTrace is proudly open-source and welcomes contributions! Whether you want to add new filters, improve rate-limiting, enhance the UI, or report bugs, we'd love your help.

- Read our **[Contribution Guidelines](CONTRIBUTING.md)** to get started.
- Check out our **[Code of Conduct](CODE_OF_CONDUCT.md)**.
- Browse or open issues on our **[Issue Tracker](https://github.com/the-kalki/UnTrace/issues)**.

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.
