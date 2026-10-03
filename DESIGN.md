---
version: 1.0.0
name: UnTrace Tactical Incinerator
description: Tactical dark-mode design system for UnTrace high-assurance privacy extension
colors:
  background: "#090B10"
  surface: "#12151E"
  surfaceElevated: "#181D2A"
  surfaceActive: "#22293B"
  terminal: "#07080C"
  borderSubtle: "#1E2433"
  borderFocus: "#35405A"
  borderActive: "#00D2FF"
  textMain: "#F8FAFC"
  textSecondary: "#94A3B8"
  textMuted: "#64748B"
  accentEmber: "#FF4500"
  accentCyan: "#00D2FF"
  accentEmerald: "#10B981"
  accentAmber: "#F59E0B"
  accentDanger: "#EF4444"
typography:
  fontSans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
  fontMono: "JetBrains Mono", "Fira Code", Consolas, monospace
  fontSizeSm: 11px
  fontSizeBase: 12px
  fontSizeMd: 13px
  fontSizeLg: 15px
  fontSizeXl: 18px
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
---

# UnTrace Design Specification

## Overview
UnTrace is a high-assurance browser extension designed for privacy-critical operations: bulk history deletion, anti-archive scrambling, and direct communication purging. The visual language conveys tactical precision, absolute security, and irreversible control through a high-contrast dark aesthetic inspired by command-line interfaces and security operations consoles.

## Colors
- **Void Background (`#090B10`)**: The deepest black canvas providing zero distraction and maximum OLED energy efficiency.
- **Surface Elevation (`#12151E`, `#181D2A`)**: Layered cards and drawers providing spatial depth without harsh drop shadows.
- **Terminal Canvas (`#07080C`)**: Specialized monospace logging console simulating a live kernel feed.
- **Accent Ember (`#FF4500`)**: The Reddit brand lineage repurposed as a warning and initiation trigger for destructive nuking.
- **Accent Cyan (`#00D2FF`)**: Information highlights, active borders, and scanning status.
- **Accent Emerald (`#10B981`)**: Safe states, completed wipes, and preserved targets.
- **Accent Danger (`#EF4444`)**: Emergency abort triggers and unrecoverable warnings.

## Typography
- **UI & Labels**: Modern system sans-serif (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`) for high-legibility at 11–13px compact sidepanel sizes.
- **Data & Telemetry**: Clean monospace (`JetBrains Mono`, `Fira Code`, `Consolas`) for counters, hashes, timestamps, and terminal telemetry.

## Layout & Components
- **Chrome SidePanel Container**: Fixed 400px width responsive layout constrained to vertical scrolling with zero horizontal scrollbars.
- **Tactical Buttons**: Micro-radius (`4px` to `6px`) buttons with subtle border-glows on hover and active click compression.
- **Status Badges**: Semi-transparent chips (`background: rgba(accent, 0.12)`, `color: accent`) with 11px uppercase monospace weight.
- **Chat Drawer**: Sliding/collapsible drawer container dedicated to conversation discovery, granular channel selection, and batch execution.

## Do's and Don'ts
- **DO** use monospace numbers for all live-updating metrics (`00`, `429`, `100%`) to prevent layout shifts.
- **DO** require explicit user confirmation before initiating irreversible destructive sweeps.
- **DON'T** use soft pastels, playful illustrations, or rounded cartoonish shapes.
- **DON'T** obscure terminal logs during execution; transparency and traceability build user confidence.
