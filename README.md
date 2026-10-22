# TabBox - Multi-Mode Grid Vertical Tabs Chrome Extension

> **Architected by Komunis Concept** • Chrome Manifest V3  
> Free Chrome Side Panel + Pro In-Page Rail, Edge-Docked Companion Window & Arc Bento Modal.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-success)](manifest.json)
[![Pricing](https://img.shields.io/badge/Pricing-Free%20%2B%20%2410%20Lifetime-purple)](https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=status)

---

## ⚡ The 4 Architecture Modes

TabBox breaks free from Chrome's rigid sidebar limitations with 4 distinct layout architectures:

1. **Mode 1: In-Page Shadow DOM Rail & Floating Chat Bubble (`PRO`)**
   - Bypasses Chrome’s 320px sidebar floor by squishing the active webpage margin.
   - Snaps to an ultra-compact **56px icon strip** or converts into a draggable **floating chat circle launcher** with zero layout shift.
   - Hover-to-peek expansion overlays smoothly above the page.

2. **Mode 2: Synchronized Docked Companion Window (`PRO`)**
   - Spawns a frameless companion window snapped to the left browser edge.
   - Automatically synchronizes position and height with the main browser window during drag, resize, and minimize.
   - Expands down to 100px or up to 480px width.

3. **Mode 3: Arc-Style Bento Command Modal (`PRO` - `Alt+B`)**
   - Full keyboard-driven command palette overlay.
   - Fuzzy-search tabs and jump instantly without touching the mouse.
   - Displays real-time visual snapshots in a multi-column bento card grid.

4. **Mode 4: Native Chrome Side Panel (`FREE FOREVER`)**
   - Lives directly inside Chrome’s native persistent sidebar (`chrome.sidePanel`).
   - 2 to 6 Bento column slider, visual snapshots, tab snoozer, duplicate cleaner, and search.

---

## 💎 Pricing & Licensing

- **Free Tier ($0 Forever)**:
  - Mode 4: Chrome Native Side Panel
  - 2 to 6 Bento column slider
  - Instant search & smart website grouping
  - Tab snooze & RAM saver
  - 1 Saved Workspace session
  - **7-Day Full Reverse Trial** of all Pro features upon install.

- **Pro Tier ($10 Lifetime Deal or $4 / Year)**:
  - All 4 Architecture Modes (In-Page Rail, Chat Circle, Docked Window, Bento Modal)
  - Unlimited Saved Workspaces & Sessions
  - 1-Click Native Split Screen
  - Instant online license key activation & verification via `komunisconcept.org.ng`.

---

## 💡 How It Works & Chrome's Architecture

In Google Chrome, extensions are sandboxed and **cannot inject custom CSS or replace native top/vertical browser bars directly**. 

However, Google introduced the **Chrome Side Panel API** (`chrome.sidePanel`), which allows extensions to live in Chrome's native persistent sidebar. **TabBox** uses this API to give you a dedicated vertical tab strip with customizable box sizes, real-time sync, and quick tab switching.

---

## ✨ Complete Feature Suite

1. 🔲 **"Little Boxes" Grid Layout (2 to 6 per row)**:
   - Stepper (`−`/`+`) and slider in the toolbar to adjust column count from **2, 3, 4, 5, or 6 boxes per row**.
   - Dynamically adapts to any sidebar width.

2. 🖼️ **Mini Visual Tab Previews**:
   - Captures and displays real live visual snapshots (screenshots) inside each box as you browse.
   - Smart fallback mockup with domain name and site icon for internal or pending tabs.
   - **Size Function (`S`, `M`, `L`)**: Switch between Small (65px), Medium (85px), and Large (115px) card heights.
   - **Visual Mode Toggle**: Switch between **Visual Snapshot Mode** and **Compact Icon Tile Mode**.

3. 🗂️ **Color-Coded Tab Groups**:
   - Seamless integration with Chrome's native Tab Groups (`chrome.tabGroups`).
   - Group folders with native colors (Blue, Red, Green, Yellow, Purple, etc.) and collapsible accordion grids.

4. 🔍 **Hover-to-Enlarge Peek (Magnifier Card)**:
   - Hovering over any tab box for 280ms opens a floating high-res magnifier card showing the full screenshot, full title, domain, audio badge, and memory status.

5. 💤 **Smart Tab Snooze & Memory Saver**:
   - `💤 Sleep Inactive` one-click button in the toolbar.
   - Discards idle background tabs using `chrome.tabs.discard()` to immediately free up system RAM.
   - Sleeping tabs display a subtle `💤` badge.

6. 🗄️ **Duplicate Tab Finder & 1-Click Cleanup**:
   - Highlights duplicate URLs with a `2x` badge.
   - A `🧹 X dups` button appears automatically in the toolbar to close duplicate tabs with a single click.

7. 💾 **Session Snapshot & Save Workspaces**:
   - `💾` button in header lets you name and save current open tabs as a persistent workspace.
   - Restore saved workspaces anytime with 1 click.

8. 🔀 **Smart Auto-Sorting**:
   - `🔀` Sort menu in header:
     - Group by Website (Domain)
     - Sort by Title (A - Z)
     - Sort by Recent Activity

9. 🎛️ **Right-Click Context Menu**:
   - **🪟 Split Side-by-Side**: Tiles current window on the left 50% and selected tab on the right 50% of the screen.
   - **📌 Pin / Unpin Tab**
   - **🔇 Mute / Unmute Audio**
   - **🔄 Duplicate Tab**
   - **💤 Sleep Tab (Free RAM)**
   - **↗️ Move to New Window**
   - **🚫 Close Other Tabs**
   - **❌ Close Tab**

10. 🖱️ **Quick Interactions**:
    - **Left-click**: Switch to tab.
    - **Middle-click**: Close tab.
    - **Corner `×` button**: Close tab on hover.
    - **Drag & Drop**: Reorder tabs by dragging boxes.
    - **Instant Search**: Real-time filtering by title or URL.
    - **Keyboard Shortcut**: <kbd>Alt</kbd> + <kbd>B</kbd> to toggle the sidebar.
    - **Dark & Light Mode**: Automatically adapts to your system/Chrome theme.

---

## 🚀 How to Install & Test in Chrome

1. Open **Google Chrome**.
2. Navigate to `chrome://extensions/` in the address bar.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner (or click **Reload** 🔄 if already loaded).
5. Select this project folder:
   ```
   c:\Users\Ojuaw\Documents\antigravity\modest-einstein
   ```
6. Click the **TabBox** icon in your Chrome toolbar or press <kbd>Alt</kbd> + <kbd>B</kbd> to open the side panel!

---

## 🤖 Remote FTP Deployer & Automated Cron Posting

TabBox includes a dedicated CLI deployment tool to upload the automated posting queue & Reddit radar to your remote web server via FTP, verify HTTP execution, and configure a 4-hour cron job:

### 1. Interactive Setup Wizard
```bash
npm run setup-ftp
# or with Python:
npm run setup-ftp-py
```

### 2. CLI Flags / One-Liner
```bash
node automations/ftp_cron_setup.js \
  --host=ftp.yourdomain.com \
  --user=your_username \
  --pass=your_password \
  --dir=public_html/tabbox-auto \
  --domain=https://yourdomain.com \
  --webhook=https://discord.com/api/webhooks/...
```

### 3. What It Sets Up
* **Uploads Payload**: Deploys `cron_poster.php`, `social_calendar.json`, and `run_cron.sh` to your server.
* **Verifies HTTP Health**: Pings your remote endpoint with an auto-generated secret token (`?token=xyz`) to verify 200 OK.
* **Provides 4-Hour Cron Commands**: Gives you the exact cPanel command, Web-Cron URL (for cron-job.org / EasyCron), or standard server crontab line (`0 */4 * * *`).
