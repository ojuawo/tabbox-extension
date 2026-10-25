// TabBox In-Page Shadow DOM Rail (Architecture 1) & Command Palette Modal (Architecture 3)
(() => {
  if (window !== window.top) return;
  if (window.__TABBOX_CONTENT_INITIALIZED__) return;
  window.__TABBOX_CONTENT_INITIALIZED__ = true;

  const DEFAULT_FAVICON = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
  )}`;

  let state = {
    tabs: [],
    groups: [],
    thumbnails: {},
    activeMode: 'sidepanel',
    railWidth: 240,
    railCollapsed: false,
    railStyle: 'strip', // 'strip' (pinned margin rail) or 'bubble' (floating chat circle)
    bubbleTop: 50,      // vertical position percentage
    isBubbleFlyoutOpen: false,
    proStatus: { isPro: false, inTrial: false, tier: 'free', daysRemaining: 0 }
  };

  let isHoverPeeking = false;
  let hoverIntentTimer = null;
  let isResizingRail = false;
  let isCommandModalOpen = false;
  let modalSearchQuery = '';
  let railSearchQuery = '';
  let flyoutSearchQuery = '';
  let selectedModalIndex = 0;
  let draggedTabId = null;

  // Chat Circle / Bubble Launcher Variables
  let bubbleHoverTimer = null;
  let bubbleCloseTimer = null;
  let isDraggingBubble = false;
  let bubbleStartY = 0;
  let hasDraggedBubble = false;

  let hostEl = null;
  let shadow = null;
  let port = null;

  // Connect to Background Message Bus
  function connectBus() {
    try {
      port = chrome.runtime.connect({ name: 'tabbox-bus' });
      port.onMessage.addListener((msg) => {
        if (msg.action === 'INIT_STATE' || msg.action === 'TABS_UPDATED') {
          state = { ...state, ...msg };
          syncUI();
        } else if (msg.action === 'MODE_CHANGED') {
          state.activeMode = msg.mode;
          if (msg.mode !== 'command-grid') {
            isCommandModalOpen = false;
          }
          syncUI();
        } else if (msg.action === 'PRO_STATUS_UPDATED' && msg.proStatus) {
          state.proStatus = msg.proStatus;
          syncUI();
        } else if (msg.action === 'THUMBNAIL_UPDATED' && msg.tabId && msg.dataUrl) {
          state.thumbnails[msg.tabId] = msg.dataUrl;
          syncUI();
        }
      });
      port.onDisconnect.addListener(() => {
        port = null;
        setTimeout(connectBus, 1000);
      });
    } catch (e) {}
  }

  function sendBus(payload) {
    try {
      if (port) {
        port.postMessage(payload);
      } else {
        chrome.runtime.sendMessage(payload).catch(() => {});
      }
    } catch (e) {
      chrome.runtime.sendMessage(payload).catch(() => {});
    }
  }

  // Listen to direct messages from background.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'MODE_CHANGED') {
      state.activeMode = msg.mode;
      if (msg.mode !== 'command-grid') isCommandModalOpen = false;
      syncUI();
      sendResponse({ ok: true });
    } else if (msg.action === 'TOGGLE_COMMAND_MODAL') {
      isCommandModalOpen = msg.forceOpen !== undefined ? msg.forceOpen : !isCommandModalOpen;
      if (isCommandModalOpen) {
        modalSearchQuery = '';
        const activeIdx = state.tabs.findIndex(t => t.active);
        selectedModalIndex = activeIdx >= 0 ? activeIdx : 0;
      }
      syncUI();
      if (isCommandModalOpen) focusModalSearch();
      sendResponse({ ok: true });
    } else if (msg.action === 'TOGGLE_RAIL_COLLAPSE') {
      state.railCollapsed = !state.railCollapsed;
      isHoverPeeking = false;
      sendBus({ action: 'SAVE_RAIL_PREFS', railCollapsed: state.railCollapsed });
      syncUI();
      sendResponse({ ok: true });
    } else if (msg.action === 'TABS_UPDATED') {
      state = { ...state, ...msg };
      syncUI();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Mount Shadow DOM Container
  function ensureShadowHost() {
    if (hostEl && shadow) return;
    hostEl = document.getElementById('tabbox-rail-host');
    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.id = 'tabbox-rail-host';
      document.documentElement.appendChild(hostEl);
    }
    shadow = hostEl.shadowRoot || hostEl.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #f8fafc;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          user-select: none;
        }
        [hidden] {
          display: none !important;
        }

        /* =========================================================
           ARCHITECTURE 1: IN-PAGE SHADOW DOM RAIL
           ========================================================= */
        .tb-rail {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          width: 240px;
          background: #121316;
          border-right: 1px solid #262932;
          z-index: 2147483646;
          display: flex;
          flex-direction: column;
          transition: width 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms ease;
          overflow: hidden;
        }
        .tb-rail.is-resizing {
          transition: none !important;
        }
        .tb-rail.is-peeking {
          box-shadow: 8px 0 28px rgba(0, 0, 0, 0.55);
        }

        /* Top Bar & Mode Switcher inside Rail */
        .tb-rail-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px;
          gap: 4px;
          border-bottom: 1px solid #20232b;
          background: #16181d;
        }
        .tb-icon-btn {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          border: 1px solid #2a2e39;
          background: #1e2026;
          color: #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.12s ease;
          font-size: 12px;
        }
        .tb-icon-btn:hover {
          background: #2b2f3a;
          color: #ffffff;
          border-color: #6366f1;
        }
        .tb-icon-btn.primary {
          background: #6366f1;
          border-color: #6366f1;
          color: #ffffff;
        }
        .tb-icon-btn.primary:hover {
          background: #4f46e5;
        }

        .tb-search-input {
          flex: 1;
          min-width: 0;
          height: 28px;
          background: #1e2026;
          border: 1px solid #2a2e39;
          border-radius: 7px;
          color: #f8fafc;
          font-size: 11px;
          padding: 0 8px;
          outline: none;
        }
        .tb-search-input:focus {
          border-color: #6366f1;
        }

        /* Mode Switcher Pill Bar */
        .tb-mode-bar {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 2px;
          padding: 4px 6px;
          background: #16181d;
          border-bottom: 1px solid #20232b;
        }
        .tb-mode-pill {
          border: 1px solid #262932;
          background: #1a1c22;
          color: #94a3b8;
          font-size: 9.5px;
          font-weight: 600;
          padding: 3px 2px;
          border-radius: 5px;
          cursor: pointer;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: all 0.12s ease;
        }
        .tb-mode-pill:hover {
          color: #ffffff;
          background: #252830;
        }
        .tb-mode-pill.active {
          background: #6366f1;
          border-color: #818cf8;
          color: #ffffff;
        }

        /* Expanded Bento Grid vs Collapsed Strip */
        .tb-rail-scroll {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 6px;
        }
        .tb-rail-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .tb-rail-scroll::-webkit-scrollbar-thumb {
          background: #2e323d;
          border-radius: 4px;
        }

        .tb-rail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
          gap: 6px;
        }

        /* Collapsed 56px Mini-Box State */
        .tb-rail.is-collapsed-view .tb-search-input,
        .tb-rail.is-collapsed-view .tb-mode-bar,
        .tb-rail.is-collapsed-view .tb-new-btn {
          display: none !important;
        }
        .tb-rail.is-collapsed-view .tb-rail-top {
          justify-content: center;
          padding: 6px 4px;
        }
        .tb-rail.is-collapsed-view .tb-rail-scroll {
          padding: 6px 7px;
        }
        .tb-rail.is-collapsed-view .tb-rail-grid {
          grid-template-columns: 40px;
          justify-content: center;
          gap: 6px;
        }

        /* Tab Box Card */
        .tb-box {
          position: relative;
          background: #1e2026;
          border: 1px solid #2b2f3a;
          border-radius: 10px;
          padding: 8px 6px 6px 6px;
          height: 68px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          overflow: hidden;
          transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
        }
        .tb-box:hover {
          background: #262932;
          border-color: #475569;
          transform: translateY(-1px);
        }
        .tb-box.active {
          background: #1e2235;
          border-color: #a8c7fa;
          box-shadow: 0 0 0 1.5px rgba(99, 102, 241, 0.45), 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        /* Collapsed 40x40 square favicon box */
        .tb-rail.is-collapsed-view .tb-box {
          width: 40px;
          height: 40px;
          padding: 0;
          justify-content: center;
          border-radius: 10px;
        }
        .tb-rail.is-collapsed-view .tb-box-title,
        .tb-rail.is-collapsed-view .tb-box-actions {
          display: none !important;
        }

        .tb-box-favicon {
          width: 20px;
          height: 20px;
          object-fit: contain;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .tb-box-title {
          width: 100%;
          font-size: 10px;
          color: #e2e8f0;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }
        .tb-box.active .tb-box-title {
          color: #a8c7fa;
          font-weight: 600;
        }

        /* Hover Action Buttons on Box */
        .tb-box-actions {
          position: absolute;
          top: 3px;
          right: 3px;
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity 0.12s ease;
        }
        .tb-box:hover .tb-box-actions {
          opacity: 1;
        }
        .tb-act-btn {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: none;
          background: rgba(15, 23, 42, 0.78);
          color: #f8fafc;
          font-size: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .tb-act-btn:hover {
          background: #6366f1;
        }
        .tb-act-btn.close:hover {
          background: #ef4444;
        }

        /* 4px Draggable Right-Border Resizer Handle */
        .tb-rail-resizer {
          position: absolute;
          top: 0;
          right: 0;
          width: 4px;
          height: 100%;
          cursor: col-resize;
          background: transparent;
          z-index: 10;
          transition: background 0.15s ease;
        }
        .tb-rail-resizer:hover,
        .tb-rail.is-resizing .tb-rail-resizer {
          background: #6366f1;
        }

        .tb-pro-badge {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #ffffff;
          font-size: 8px;
          font-weight: 800;
          padding: 1px 3px;
          border-radius: 3px;
          letter-spacing: 0.4px;
          margin-left: 2px;
          vertical-align: middle;
        }

        /* =========================================================
           ARCHITECTURE 1B: FLOATING CHAT CIRCLE / BUBBLE LAUNCHER
           ========================================================= */
        .tb-bubble-container {
          position: fixed;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          z-index: 2147483647;
          display: flex;
          align-items: center;
          user-select: none;
        }

        .tb-bubble-trigger {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: #14161d;
          border: 2px solid #6366f1;
          box-shadow: 0 4px 20px rgba(99, 102, 241, 0.45), 0 2px 8px rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          position: relative;
          transition: transform 0.15s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.15s ease, border-color 0.15s ease;
          flex-shrink: 0;
        }
        .tb-bubble-trigger:hover {
          transform: scale(1.08);
          box-shadow: 0 6px 26px rgba(99, 102, 241, 0.65), 0 4px 12px rgba(0, 0, 0, 0.5);
          border-color: #818cf8;
        }
        .tb-bubble-trigger:active,
        .tb-bubble-trigger.is-dragging {
          cursor: grabbing;
          transform: scale(0.96);
        }
        .tb-bubble-icon {
          width: 22px;
          height: 22px;
          color: #a8c7fa;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tb-bubble-icon svg {
          width: 100%;
          height: 100%;
        }
        .tb-bubble-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #4f46e5;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid #14161d;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
        }

        /* Floating Bento Tab Flyout */
        .tb-bubble-flyout {
          position: fixed;
          left: 66px;
          width: 290px;
          max-height: 520px;
          background: rgba(18, 19, 22, 0.96);
          backdrop-filter: blur(16px);
          border: 1px solid #2e3340;
          border-radius: 14px;
          box-shadow: 0 20px 54px rgba(0, 0, 0, 0.7);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: tbBubbleOpen 150ms cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 2147483647;
        }
        @keyframes tbBubbleOpen {
          from { opacity: 0; transform: translateX(-12px) scale(0.96); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }

        .tb-flyout-header {
          padding: 8px;
          border-bottom: 1px solid #20232b;
          background: #16181d;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tb-flyout-top-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tb-flyout-body {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 8px;
          max-height: 380px;
        }
        .tb-flyout-body::-webkit-scrollbar {
          width: 4px;
        }
        .tb-flyout-body::-webkit-scrollbar-thumb {
          background: #2e323d;
          border-radius: 4px;
        }
        .tb-flyout-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-top: 1px solid #20232b;
          background: #14161d;
          font-size: 11px;
          color: #94a3b8;
        }

        /* =========================================================
           ARCHITECTURE 3: COMMAND PALETTE BENTO MODAL (Alt+B)
           ========================================================= */
        .tb-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(10, 12, 18, 0.65);
          backdrop-filter: blur(12px);
          z-index: 2147483647;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          animation: tbFadeIn 140ms ease-out;
        }
        @keyframes tbFadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .tb-modal-card {
          width: 85vw;
          max-width: 720px;
          max-height: 82vh;
          background: rgba(18, 19, 22, 0.94);
          border: 1px solid #2e3340;
          border-radius: 16px;
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .tb-modal-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid #262932;
          background: rgba(24, 26, 32, 0.85);
        }
        .tb-modal-search {
          flex: 1;
          background: #1e2026;
          border: 1px solid #333846;
          border-radius: 10px;
          color: #ffffff;
          font-size: 14px;
          padding: 9px 14px;
          outline: none;
        }
        .tb-modal-search:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
        }
        .tb-modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }
        .tb-modal-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(135px, 1fr));
          gap: 10px;
        }
        .tb-modal-box {
          position: relative;
          background: #1e2026;
          border: 1.5px solid #2b2f3a;
          border-radius: 10px;
          overflow: hidden;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          transition: all 0.12s ease;
        }
        .tb-modal-box:hover,
        .tb-modal-box.kb-selected {
          border-color: #a8c7fa;
          background: #252834;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.25);
        }
        .tb-modal-box.active {
          border-color: #6366f1;
        }
        .tb-modal-thumb {
          height: 76px;
          background: #15171c;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-bottom: 1px solid #262932;
          overflow: hidden;
        }
        .tb-modal-thumb img.shot {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top;
        }
        .tb-modal-thumb img.fav {
          width: 28px;
          height: 28px;
          object-fit: contain;
        }
        .tb-modal-info {
          padding: 7px 9px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tb-modal-info img {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
        }
        .tb-modal-info span {
          font-size: 11px;
          color: #f1f5f9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tb-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          border-top: 1px solid #262932;
          background: #15171c;
          font-size: 11px;
          color: #94a3b8;
          flex-wrap: wrap;
          gap: 8px;
        }
        .tb-kbd-hints span {
          margin-right: 10px;
        }
        .tb-kbd {
          background: #252830;
          border: 1px solid #363b47;
          border-radius: 4px;
          padding: 1px 5px;
          font-size: 10px;
          color: #cbd5e1;
        }
      </style>

      <!-- Architecture 1A: In-Page Rail Strip -->
      <aside id="tb-rail" class="tb-rail" hidden>
        <div class="tb-rail-top">
          <button id="tb-collapse-btn" class="tb-icon-btn" title="Collapse / Expand Rail (56px vs Bento)">☰</button>
          <input id="tb-rail-search" type="text" class="tb-search-input" placeholder="Search tabs..." />
          <button id="tb-new-tab-btn" class="tb-icon-btn primary tb-new-btn" title="New Tab">+</button>
          <button id="tb-rail-to-bubble-btn" class="tb-icon-btn" title="Switch to Floating Chat Bubble (Pro - Zero Margin Shift)">◓</button>
        </div>

        <div class="tb-mode-bar" id="tb-rail-modes">
          <button class="tb-mode-pill" data-mode="inpage-rail" title="1: In-Page Shadow DOM Rail">1: Rail <span class="tb-pro-badge">PRO</span></button>
          <button class="tb-mode-pill" data-mode="docked-window" title="2: Docked Companion Window">2: Dock <span class="tb-pro-badge">PRO</span></button>
          <button class="tb-mode-pill" data-mode="command-grid" title="3: Command Bento Modal">3: Modal <span class="tb-pro-badge">PRO</span></button>
          <button class="tb-mode-pill" data-mode="sidepanel" title="4: Chrome Side Panel">4: Panel</button>
        </div>

        <div class="tb-rail-scroll">
          <div id="tb-rail-grid" class="tb-rail-grid"></div>
        </div>

        <div id="tb-rail-resizer" class="tb-rail-resizer" title="Drag to resize rail (below 90px snaps to 56px)"></div>
      </aside>

      <!-- Architecture 1B: Floating Chat Circle / Bubble Launcher (Pro) -->
      <div id="tb-bubble-container" class="tb-bubble-container" hidden>
        <!-- Floating Bubble Trigger Pill -->
        <div id="tb-bubble-trigger" class="tb-bubble-trigger" title="TabBox Bubble: Hover or Click to open, Drag up/down to reposition">
          <div class="tb-bubble-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
            </svg>
          </div>
          <div id="tb-bubble-badge" class="tb-bubble-badge">0</div>
        </div>

        <!-- Floating Bento Tab Flyout Card -->
        <div id="tb-bubble-flyout" class="tb-bubble-flyout" hidden>
          <div class="tb-flyout-header">
            <div class="tb-flyout-top-row">
              <input id="tb-flyout-search" type="text" class="tb-search-input" placeholder="Search tabs..." />
              <button id="tb-flyout-new-btn" class="tb-icon-btn primary" title="New Tab">+</button>
              <button id="tb-flyout-to-strip-btn" class="tb-icon-btn" style="width:auto;padding:0 7px;font-size:10px;font-weight:600;" title="Switch to Pinned Rail Strip">☵ Strip</button>
              <button id="tb-flyout-close-btn" class="tb-icon-btn" title="Close Flyout (Esc)">✕</button>
            </div>
            <div class="tb-mode-bar" id="tb-flyout-modes">
              <button class="tb-mode-pill active" data-mode="inpage-rail">1: Rail <span class="tb-pro-badge">PRO</span></button>
              <button class="tb-mode-pill" data-mode="docked-window">2: Dock <span class="tb-pro-badge">PRO</span></button>
              <button class="tb-mode-pill" data-mode="command-grid">3: Modal <span class="tb-pro-badge">PRO</span></button>
              <button class="tb-mode-pill" data-mode="sidepanel">4: Panel</button>
            </div>
          </div>
          <div class="tb-flyout-body">
            <div id="tb-flyout-grid" class="tb-rail-grid"></div>
          </div>
          <div class="tb-flyout-footer">
            <span id="tb-flyout-count">0 tabs</span>
            <span style="font-size: 10px; color: #818cf8; cursor: grab;" id="tb-flyout-drag-hint">↕ Drag bubble up/down</span>
          </div>
        </div>
      </div>

      <!-- Architecture 3: Command Palette Bento Modal -->
      <div id="tb-modal-backdrop" class="tb-modal-backdrop" hidden>
        <div class="tb-modal-card" id="tb-modal-card">
          <div class="tb-modal-header">
            <input id="tb-modal-search" type="text" class="tb-modal-search" placeholder="Search tabs or use Arrow keys + Enter..." />
            <button id="tb-open-full-grid" class="tb-icon-btn" style="width:auto;padding:0 10px;font-weight:600;" title="Open Full Standalone Bento Grid Page">◫ Full Grid</button>
            <button id="tb-modal-close" class="tb-icon-btn" title="Close (Esc)">✕</button>
          </div>
          <div class="tb-mode-bar" id="tb-modal-modes" style="padding:6px 16px;">
            <button class="tb-mode-pill" data-mode="inpage-rail">1: Rail <span class="tb-pro-badge">PRO</span></button>
            <button class="tb-mode-pill" data-mode="docked-window">2: Dock <span class="tb-pro-badge">PRO</span></button>
            <button class="tb-mode-pill" data-mode="command-grid">3: Modal <span class="tb-pro-badge">PRO</span></button>
            <button class="tb-mode-pill" data-mode="sidepanel">4: Panel</button>
          </div>
          <div class="tb-modal-body">
            <div id="tb-modal-grid" class="tb-modal-grid"></div>
          </div>
          <div class="tb-modal-footer">
            <div class="tb-kbd-hints">
              <span><b class="tb-kbd">←↑↓→</b> Navigate</span>
              <span><b class="tb-kbd">Enter</b> Switch</span>
              <span><b class="tb-kbd">Del</b> Close Tab</span>
              <span><b class="tb-kbd">Esc</b> Dismiss</span>
            </div>
            <span id="tb-modal-count">0 tabs</span>
          </div>
        </div>
      </div>
    `;

    bindShadowEvents();
  }

  function bindShadowEvents() {
    const rail = shadow.getElementById('tb-rail');
    const collapseBtn = shadow.getElementById('tb-collapse-btn');
    const railSearch = shadow.getElementById('tb-rail-search');
    const newTabBtn = shadow.getElementById('tb-new-tab-btn');
    const resizer = shadow.getElementById('tb-rail-resizer');

    const modalBackdrop = shadow.getElementById('tb-modal-backdrop');
    const modalCard = shadow.getElementById('tb-modal-card');
    const modalSearch = shadow.getElementById('tb-modal-search');
    const modalClose = shadow.getElementById('tb-modal-close');
    const openFullGridBtn = shadow.getElementById('tb-open-full-grid');

    // Collapse / Expand Toggle
    collapseBtn.addEventListener('click', () => {
      state.railCollapsed = !state.railCollapsed;
      isHoverPeeking = false;
      if (!state.railCollapsed && state.railWidth < 90) {
        state.railWidth = 240;
      }
      sendBus({
        action: 'SAVE_RAIL_PREFS',
        railCollapsed: state.railCollapsed,
        railWidth: state.railWidth
      });
      syncUI();
    });

    // Hover-Peek with 120ms intent debounce when collapsed
    rail.addEventListener('mouseenter', () => {
      if (!state.railCollapsed || isResizingRail) return;
      clearTimeout(hoverIntentTimer);
      hoverIntentTimer = setTimeout(() => {
        isHoverPeeking = true;
        syncUI();
      }, 120);
    });

    rail.addEventListener('mouseleave', () => {
      clearTimeout(hoverIntentTimer);
      if (isHoverPeeking) {
        isHoverPeeking = false;
        syncUI();
      }
    });

    // Search inside Rail
    railSearch.addEventListener('input', (e) => {
      railSearchQuery = e.target.value.toLowerCase().trim();
      renderRailBoxes();
    });

    // New Tab
    newTabBtn.addEventListener('click', () => {
      sendBus({ action: 'CREATE_TAB' });
    });

    // Draggable 4px Resizer Handle (snaps to 56px if dragged below 90px)
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizingRail = true;
      rail.classList.add('is-resizing');

      const onMouseMove = (moveEvent) => {
        const newW = Math.max(56, Math.min(480, moveEvent.clientX));
        if (newW < 90) {
          state.railCollapsed = true;
          isHoverPeeking = false;
        } else {
          state.railCollapsed = false;
          state.railWidth = newW;
        }
        syncUI();
      };

      const onMouseUp = () => {
        isResizingRail = false;
        rail.classList.remove('is-resizing');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        sendBus({
          action: 'SAVE_RAIL_PREFS',
          railWidth: state.railWidth,
          railCollapsed: state.railCollapsed
        });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Switch Rail Strip to Chat Bubble (Pro)
    const railToBubbleBtn = shadow.getElementById('tb-rail-to-bubble-btn');
    if (railToBubbleBtn) {
      railToBubbleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.railStyle = 'bubble';
        sendBus({ action: 'SAVE_RAIL_PREFS', railStyle: 'bubble' });
        syncUI();
      });
    }

    // =========================================================
    // Architecture 1B: Floating Chat Circle / Bubble Events
    // =========================================================
    const bubbleContainer = shadow.getElementById('tb-bubble-container');
    const bubbleTrigger = shadow.getElementById('tb-bubble-trigger');
    const bubbleFlyout = shadow.getElementById('tb-bubble-flyout');
    const flyoutSearch = shadow.getElementById('tb-flyout-search');
    const flyoutNewBtn = shadow.getElementById('tb-flyout-new-btn');
    const flyoutToStripBtn = shadow.getElementById('tb-flyout-to-strip-btn');
    const flyoutCloseBtn = shadow.getElementById('tb-flyout-close-btn');

    function updateFlyoutPosition(centerClientY) {
      if (!bubbleFlyout) return;
      const vh = window.innerHeight || 800;
      const flyoutH = 460;
      let targetTop = (centerClientY || (vh * (state.bubbleTop || 50) / 100)) - (flyoutH / 2);
      targetTop = Math.max(16, Math.min(vh - flyoutH - 16, targetTop));
      bubbleFlyout.style.top = `${targetTop}px`;
    }

    function openFlyout() {
      clearTimeout(bubbleCloseTimer);
      clearTimeout(bubbleHoverTimer);
      state.isBubbleFlyoutOpen = true;
      if (bubbleFlyout) {
        bubbleFlyout.hidden = false;
        const rect = bubbleTrigger.getBoundingClientRect();
        updateFlyoutPosition(rect.top + rect.height / 2);
        renderFlyoutBoxes();
        setTimeout(() => {
          if (flyoutSearch) flyoutSearch.focus();
        }, 50);
      }
    }

    function closeFlyout() {
      clearTimeout(bubbleHoverTimer);
      state.isBubbleFlyoutOpen = false;
      if (bubbleFlyout) bubbleFlyout.hidden = true;
    }

    function scheduleFlyoutClose(delay = 240) {
      clearTimeout(bubbleCloseTimer);
      bubbleCloseTimer = setTimeout(() => {
        closeFlyout();
      }, delay);
    }

    // Hover on bubble trigger (150ms debounce)
    bubbleTrigger.addEventListener('mouseenter', () => {
      if (isDraggingBubble) return;
      clearTimeout(bubbleCloseTimer);
      bubbleHoverTimer = setTimeout(() => {
        openFlyout();
      }, 150);
    });

    bubbleTrigger.addEventListener('mouseleave', () => {
      clearTimeout(bubbleHoverTimer);
      if (!isDraggingBubble) {
        scheduleFlyoutClose(240);
      }
    });

    // Click on bubble trigger
    bubbleTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasDraggedBubble) {
        hasDraggedBubble = false;
        return;
      }
      if (state.isBubbleFlyoutOpen) {
        closeFlyout();
      } else {
        openFlyout();
      }
    });

    // Flyout hover retention
    bubbleFlyout.addEventListener('mouseenter', () => {
      clearTimeout(bubbleCloseTimer);
    });

    bubbleFlyout.addEventListener('mouseleave', () => {
      scheduleFlyoutClose(240);
    });

    // Draggable vertical positioning of Chat Bubble along viewport edge
    bubbleTrigger.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDraggingBubble = true;
      hasDraggedBubble = false;
      bubbleStartY = e.clientY;
      bubbleTrigger.classList.add('is-dragging');

      const onMouseMove = (moveEvent) => {
        const deltaY = moveEvent.clientY - bubbleStartY;
        if (Math.abs(deltaY) > 4) {
          hasDraggedBubble = true;
        }
        const vh = window.innerHeight || 800;
        let newPercent = (moveEvent.clientY / vh) * 100;
        newPercent = Math.max(5, Math.min(95, newPercent));
        state.bubbleTop = newPercent;
        bubbleContainer.style.top = `${newPercent}%`;
        if (state.isBubbleFlyoutOpen) {
          updateFlyoutPosition(moveEvent.clientY);
        }
      };

      const onMouseUp = () => {
        isDraggingBubble = false;
        bubbleTrigger.classList.remove('is-dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        if (hasDraggedBubble) {
          sendBus({ action: 'SAVE_RAIL_PREFS', bubbleTop: state.bubbleTop });
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Flyout Search
    flyoutSearch.addEventListener('input', (e) => {
      flyoutSearchQuery = e.target.value.toLowerCase().trim();
      renderFlyoutBoxes();
    });

    // Flyout New Tab
    flyoutNewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sendBus({ action: 'CREATE_TAB' });
    });

    // Flyout Close
    flyoutCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFlyout();
    });

    // Flyout switch to Rail Strip
    flyoutToStripBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFlyout();
      state.railStyle = 'strip';
      sendBus({ action: 'SAVE_RAIL_PREFS', railStyle: 'strip' });
      syncUI();
    });

    // Mode Switcher Pills (in Rail, Bubble Flyout, and Modal)
    shadow.querySelectorAll('.tb-mode-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFlyout();
        const targetMode = btn.dataset.mode;
        if (targetMode !== 'sidepanel' && state.proStatus && !state.proStatus.isPro) {
          sendBus({ action: 'OPEN_PAYWALL', requestedMode: targetMode });
          return;
        }
        sendBus({ action: 'SET_MODE', mode: targetMode });
      });
    });

    // Outside click & Escape to dismiss Flyout
    window.addEventListener('click', (e) => {
      if (state.isBubbleFlyoutOpen && hostEl && !e.composedPath().includes(hostEl)) {
        closeFlyout();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isBubbleFlyoutOpen) {
        closeFlyout();
      }
    });

    // Command Modal Events
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        isCommandModalOpen = false;
        syncUI();
      }
    });
    modalCard.addEventListener('click', (e) => e.stopPropagation());
    modalClose.addEventListener('click', () => {
      isCommandModalOpen = false;
      syncUI();
    });
    openFullGridBtn.addEventListener('click', () => {
      isCommandModalOpen = false;
      syncUI();
      sendBus({ action: 'OPEN_GRID_VIEW' });
    });

    modalSearch.addEventListener('input', (e) => {
      modalSearchQuery = e.target.value.toLowerCase().trim();
      selectedModalIndex = 0;
      renderModalBoxes();
    });

    // Arrow key navigation + Enter + Delete inside Command Modal
    modalSearch.addEventListener('keydown', (e) => {
      const filtered = getFilteredModalTabs();
      if (filtered.length === 0) return;

      const gridEl = shadow.getElementById('tb-modal-grid');
      const cols = Math.max(1, Math.floor((gridEl.clientWidth || 600) / 145));

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectedModalIndex = (selectedModalIndex + 1) % filtered.length;
        renderModalBoxes();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectedModalIndex = (selectedModalIndex - 1 + filtered.length) % filtered.length;
        renderModalBoxes();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedModalIndex = Math.min(filtered.length - 1, selectedModalIndex + cols);
        renderModalBoxes();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedModalIndex = Math.max(0, selectedModalIndex - cols);
        renderModalBoxes();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = filtered[selectedModalIndex];
        if (chosen) {
          isCommandModalOpen = false;
          syncUI();
          sendBus({ action: 'SWITCH_TAB', tabId: chosen.id });
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && modalSearchQuery.length === 0) {
        e.preventDefault();
        const chosen = filtered[selectedModalIndex];
        if (chosen) {
          sendBus({ action: 'CLOSE_TAB', tabId: chosen.id });
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        isCommandModalOpen = false;
        syncUI();
      }
    });
  }

  function focusModalSearch() {
    if (!shadow) return;
    setTimeout(() => {
      const input = shadow.getElementById('tb-modal-search');
      if (input) {
        input.value = modalSearchQuery;
        input.focus();
      }
    }, 30);
  }

  function getFilteredModalTabs() {
    return state.tabs.filter((t) => {
      if (!modalSearchQuery) return true;
      return (
        (t.title || '').toLowerCase().includes(modalSearchQuery) ||
        (t.url || '').toLowerCase().includes(modalSearchQuery)
      );
    });
  }

  // Synchronize DOM, Host Page Margin, and Active Views
  function syncUI() {
    ensureShadowHost();
    const rail = shadow.getElementById('tb-rail');
    const modalBackdrop = shadow.getElementById('tb-modal-backdrop');

    // Update Mode Switcher active pills
    shadow.querySelectorAll('.tb-mode-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === state.activeMode);
    });

    // 1. Handle In-Page Rail / Floating Chat Bubble visibility & Host Page marginLeft
    if (state.activeMode === 'inpage-rail') {
      const bubbleContainer = shadow.getElementById('tb-bubble-container');
      const badge = shadow.getElementById('tb-bubble-badge');
      const flyout = shadow.getElementById('tb-bubble-flyout');

      if (state.railStyle === 'bubble') {
        // Chat Circle / Bubble Mode: ZERO page margin push!
        rail.hidden = true;
        if (document.documentElement.style.marginLeft) {
          document.documentElement.style.marginLeft = '';
        }
        if (bubbleContainer) {
          bubbleContainer.hidden = false;
          bubbleContainer.style.top = `${state.bubbleTop || 50}%`;
        }
        if (badge) badge.textContent = `${state.tabs.length}`;
        if (state.isBubbleFlyoutOpen && flyout) {
          flyout.hidden = false;
          renderFlyoutBoxes();
        } else if (flyout) {
          flyout.hidden = true;
        }
      } else {
        // Pinned Rail Strip Mode: Pushes page margin
        if (bubbleContainer) bubbleContainer.hidden = true;
        rail.hidden = false;
        const isCollapsed = state.railCollapsed && !isHoverPeeking;
        const visualWidth = state.railCollapsed
          ? (isHoverPeeking ? Math.max(240, state.railWidth) : 56)
          : Math.max(90, state.railWidth);

        // Pinned margin only uses 56px when collapsed so Hover-Peek floats over page without layout shift
        const pinnedMargin = state.railCollapsed ? 56 : Math.max(90, state.railWidth);

        rail.style.width = `${visualWidth}px`;
        rail.classList.toggle('is-collapsed-view', isCollapsed);
        rail.classList.toggle('is-peeking', state.railCollapsed && isHoverPeeking);

        document.documentElement.style.transition = isResizingRail ? 'none' : 'margin-left 180ms cubic-bezier(0.2, 0, 0, 1)';
        document.documentElement.style.marginLeft = `${pinnedMargin}px`;

        renderRailBoxes();
      }
    } else {
      rail.hidden = true;
      const bubbleContainer = shadow.getElementById('tb-bubble-container');
      if (bubbleContainer) bubbleContainer.hidden = true;
      if (document.documentElement.style.marginLeft) {
        document.documentElement.style.marginLeft = '';
      }
    }

    // 2. Handle Command Palette Bento Modal visibility
    if (isCommandModalOpen) {
      modalBackdrop.hidden = false;
      renderModalBoxes();
    } else {
      modalBackdrop.hidden = true;
    }
  }

  function renderRailBoxes() {
    const grid = shadow.getElementById('tb-rail-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.proStatus && !state.proStatus.isPro) {
      const card = document.createElement('div');
      card.style.cssText = 'padding: 20px 12px; text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; height: 100%; box-sizing: border-box;';
      card.innerHTML = `
        <div style="font-size: 24px;">⚡</div>
        <div style="font-weight: 700; font-size: 12px; color: #ffffff;">TabBox Pro Required</div>
        <div style="font-size: 10px; color: #94a3b8; line-height: 1.35;">The 56px In-Page Rail is exclusive to TabBox Pro ($10 Lifetime / $4 Year).</div>
        <button id="tb-rail-upgrade-btn" style="width: 100%; padding: 7px 10px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 10.5px; margin-top: 4px;">Unlock Pro ($10)</button>
      `;
      const btn = card.querySelector('#tb-rail-upgrade-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          sendBus({ action: 'OPEN_PAYWALL', requestedMode: 'inpage-rail' });
        });
      }
      grid.appendChild(card);
      return;
    }

    const filtered = state.tabs.filter((t) => {
      if (!railSearchQuery) return true;
      return (
        (t.title || '').toLowerCase().includes(railSearchQuery) ||
        (t.url || '').toLowerCase().includes(railSearchQuery)
      );
    });

    filtered.forEach((tab) => {
      const box = document.createElement('div');
      box.className = `tb-box ${tab.active ? 'active' : ''}`;
      box.title = `${tab.title || 'Tab'}\n${tab.url || ''}`;
      box.draggable = true;

      const fav = document.createElement('img');
      fav.className = 'tb-box-favicon';
      fav.src = tab.favIconUrl && tab.favIconUrl.startsWith('http') ? tab.favIconUrl : (tab.favIconUrl || DEFAULT_FAVICON);
      fav.onerror = () => { fav.src = DEFAULT_FAVICON; };
      box.appendChild(fav);

      const title = document.createElement('div');
      title.className = 'tb-box-title';
      title.textContent = tab.title || 'New Tab';
      box.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'tb-box-actions';

      const splitBtn = document.createElement('button');
      splitBtn.className = 'tb-act-btn';
      splitBtn.title = 'Native Split Tab';
      splitBtn.textContent = '◫';
      splitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendBus({ action: 'SPLIT_TAB', tabId: tab.id });
      });
      actions.appendChild(splitBtn);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tb-act-btn close';
      closeBtn.title = 'Close Tab';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendBus({ action: 'CLOSE_TAB', tabId: tab.id });
      });
      actions.appendChild(closeBtn);

      box.appendChild(actions);

      box.addEventListener('click', () => {
        sendBus({ action: 'SWITCH_TAB', tabId: tab.id });
      });

      box.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          sendBus({ action: 'CLOSE_TAB', tabId: tab.id });
        }
      });

      // Drag and drop reordering
      box.addEventListener('dragstart', () => { draggedTabId = tab.id; });
      box.addEventListener('dragover', (e) => e.preventDefault());
      box.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedTabId !== null && draggedTabId !== tab.id) {
          sendBus({ action: 'REORDER_TAB', tabId: draggedTabId, index: tab.index });
        }
        draggedTabId = null;
      });

      grid.appendChild(box);
    });
  }

  function renderFlyoutBoxes() {
    const grid = shadow.getElementById('tb-flyout-grid');
    const countEl = shadow.getElementById('tb-flyout-count');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.proStatus && !state.proStatus.isPro) {
      if (countEl) countEl.textContent = 'Pro Feature';
      const card = document.createElement('div');
      card.style.cssText = 'padding: 24px 16px; text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; box-sizing: border-box;';
      card.innerHTML = `
        <div style="font-size: 24px;">⚡</div>
        <div style="font-weight: 700; font-size: 13px; color: #ffffff;">Chat Circle is a Pro Feature</div>
        <div style="font-size: 10.5px; color: #94a3b8; line-height: 1.35;">Unlock the floating chat circle and all 4 architecture modes for $10 Lifetime or $4/Year.</div>
        <button id="tb-flyout-upgrade-btn" style="width: 100%; padding: 7px 12px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 11px; margin-top: 6px;">Unlock Pro ($10)</button>
      `;
      const btn = card.querySelector('#tb-flyout-upgrade-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          closeFlyout();
          sendBus({ action: 'OPEN_PAYWALL', requestedMode: 'inpage-rail' });
        });
      }
      grid.appendChild(card);
      return;
    }

    const filtered = state.tabs.filter((t) => {
      if (!flyoutSearchQuery) return true;
      return (
        (t.title || '').toLowerCase().includes(flyoutSearchQuery) ||
        (t.url || '').toLowerCase().includes(flyoutSearchQuery)
      );
    });

    if (countEl) {
      countEl.textContent = `${filtered.length} of ${state.tabs.length} tabs`;
    }

    filtered.forEach((tab) => {
      const box = document.createElement('div');
      box.className = `tb-box ${tab.active ? 'active' : ''}`;
      box.title = `${tab.title || 'Tab'}\n${tab.url || ''}`;

      const fav = document.createElement('img');
      fav.className = 'tb-box-favicon';
      fav.src = tab.favIconUrl && tab.favIconUrl.startsWith('http') ? tab.favIconUrl : (tab.favIconUrl || DEFAULT_FAVICON);
      fav.onerror = () => { fav.src = DEFAULT_FAVICON; };
      box.appendChild(fav);

      const title = document.createElement('div');
      title.className = 'tb-box-title';
      title.textContent = tab.title || 'New Tab';
      box.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'tb-box-actions';

      const splitBtn = document.createElement('button');
      splitBtn.className = 'tb-act-btn';
      splitBtn.title = 'Native Split Tab';
      splitBtn.textContent = '◫';
      splitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFlyout();
        sendBus({ action: 'SPLIT_TAB', tabId: tab.id });
      });
      actions.appendChild(splitBtn);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tb-act-btn close';
      closeBtn.title = 'Close Tab';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendBus({ action: 'CLOSE_TAB', tabId: tab.id });
      });
      actions.appendChild(closeBtn);

      box.appendChild(actions);

      box.addEventListener('click', () => {
        closeFlyout();
        sendBus({ action: 'SWITCH_TAB', tabId: tab.id });
      });

      box.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          sendBus({ action: 'CLOSE_TAB', tabId: tab.id });
        }
      });

      grid.appendChild(box);
    });
  }

  function renderModalBoxes() {
    const grid = shadow.getElementById('tb-modal-grid');
    const countEl = shadow.getElementById('tb-modal-count');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.proStatus && !state.proStatus.isPro) {
      if (countEl) countEl.textContent = 'Pro Feature';
      const card = document.createElement('div');
      card.style.cssText = 'grid-column: 1/-1; padding: 40px 20px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center;';
      card.innerHTML = `
        <div style="font-size: 32px;">⚡</div>
        <div style="font-weight: 800; font-size: 16px; color: #ffffff;">Command Palette (Alt+B) is a Pro Feature</div>
        <div style="font-size: 12px; color: #94a3b8; max-width: 360px; line-height: 1.45;">Unlock instant keyboard tab navigation, Arc-style Bento modal, and all 4 architecture modes for just $10 Lifetime or $4/Year.</div>
        <button id="tb-modal-upgrade-btn" style="padding: 10px 22px; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; margin-top: 6px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">Unlock TabBox Pro ($10 Lifetime)</button>
      `;
      const btn = card.querySelector('#tb-modal-upgrade-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          isCommandModalOpen = false;
          syncUI();
          sendBus({ action: 'OPEN_PAYWALL', requestedMode: 'command-grid' });
        });
      }
      grid.appendChild(card);
      return;
    }

    const filtered = getFilteredModalTabs();
    if (selectedModalIndex >= filtered.length) {
      selectedModalIndex = Math.max(0, filtered.length - 1);
    }

    if (countEl) {
      countEl.textContent = `${filtered.length} of ${state.tabs.length} tabs`;
    }

    filtered.forEach((tab, idx) => {
      const box = document.createElement('div');
      box.className = `tb-modal-box ${tab.active ? 'active' : ''} ${idx === selectedModalIndex ? 'kb-selected' : ''}`;
      box.title = `${tab.title || 'Tab'}\n${tab.url || ''}`;

      const thumb = document.createElement('div');
      thumb.className = 'tb-modal-thumb';
      const shotUrl = state.thumbnails[tab.id];
      const favUrl = tab.favIconUrl && tab.favIconUrl.startsWith('http') ? tab.favIconUrl : (tab.favIconUrl || DEFAULT_FAVICON);

      if (shotUrl) {
        const img = document.createElement('img');
        img.className = 'shot';
        img.src = shotUrl;
        thumb.appendChild(img);
      } else {
        const img = document.createElement('img');
        img.className = 'fav';
        img.src = favUrl;
        img.onerror = () => { img.src = DEFAULT_FAVICON; };
        thumb.appendChild(img);
      }

      const actions = document.createElement('div');
      actions.className = 'tb-box-actions';
      const splitBtn = document.createElement('button');
      splitBtn.className = 'tb-act-btn';
      splitBtn.textContent = '◫';
      splitBtn.title = 'Native Split Tab';
      splitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isCommandModalOpen = false;
        syncUI();
        sendBus({ action: 'SPLIT_TAB', tabId: tab.id });
      });
      actions.appendChild(splitBtn);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tb-act-btn close';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close Tab';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sendBus({ action: 'CLOSE_TAB', tabId: tab.id });
      });
      actions.appendChild(closeBtn);
      thumb.appendChild(actions);

      box.appendChild(thumb);

      const info = document.createElement('div');
      info.className = 'tb-modal-info';
      const fIcon = document.createElement('img');
      fIcon.src = favUrl;
      fIcon.onerror = () => { fIcon.src = DEFAULT_FAVICON; };
      const tSpan = document.createElement('span');
      tSpan.textContent = tab.title || 'New Tab';
      info.appendChild(fIcon);
      info.appendChild(tSpan);
      box.appendChild(info);

      box.addEventListener('click', () => {
        isCommandModalOpen = false;
        syncUI();
        sendBus({ action: 'SWITCH_TAB', tabId: tab.id });
      });

      box.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          sendBus({ action: 'CLOSE_TAB', tabId: tab.id });
        }
      });

      grid.appendChild(box);
    });
  }

  connectBus();
})();
