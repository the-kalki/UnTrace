# Contributing to UnTrace

Thank you for your interest in contributing to **UnTrace**! We welcome contributions from developers, designers, privacy advocates, and security researchers worldwide.

---

## 🧭 Code of Conduct
Please read and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md) in all project interactions.

---

## 🛠️ Local Development Setup

UnTrace is a lightweight, zero-dependency Manifest V3 Chrome Extension. You don't need any complex build tools to start contributing.

### 1. Clone the Repository
```bash
git clone https://github.com/the-kalki/UnTrace.git
cd UnTrace
```

### 2. Load Unpacked in Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions`.
2. In the top-right corner, enable **Developer mode**.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `UnTrace` project folder.
5. The extension icon will appear in your Chrome toolbar.

### 3. Run Tests
Ensure all unit tests pass before submitting changes:
```bash
node tests/core.test.js
```

### 4. Local UI Preview
You can preview the side panel UI locally in a browser without reloading Chrome:
```bash
python3 -m http.server 3000
# Open http://localhost:3000/test-preview.html
```

---

## 🎯 How to Contribute

### Reporting Bugs
- Check the [Issues tab](https://github.com/the-kalki/UnTrace/issues) to make sure the bug hasn't already been reported.
- If not, open a new issue using our **Bug Report template**.
- Include details such as browser version, Reddit interface (old/new/shreddit), console error logs, and reproduction steps.

### Proposing Enhancements
- Have an idea for a new filter, improved rate-limiting, or better UX? Open an issue using the **Feature Request template** to discuss before submitting code.

### Submitting Pull Requests (PRs)
1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Follow our coding guidelines:
   - Use clean, modular ES6+ JavaScript.
   - Strictly follow Manifest V3 security rules (no `eval()`, no inline scripts, explicit permissions).
   - Maintain the **Tactical Incinerator** minimal UI design tokens defined in `DESIGN.md`.
   - Ensure all unit tests pass with `node tests/core.test.js`.
3. Commit your changes with a descriptive message:
   ```bash
   git commit -m "feat: add date filter preset for 3 months"
   ```
4. Push to your branch and open a Pull Request against the `main` branch.

---

## 📜 Coding & Architecture Standards
- **Manifest V3 Strict Compliance:** No dynamic code execution, no remote scripts.
- **Privacy-First (Zero Data Collection):** Credentials, modhashes, and user content must **NEVER** leave the user's browser.
- **Adaptive Rate Limiting:** All batch operations must respect jittered pacing to prevent hitting Reddit's HTTP 429 rate limit.
