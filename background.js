// Unified Background Message Bus & Multi-Mode Controller for TabBox (Manifest V3)

let dockedWindowId = null;
let mainBrowserWindowId = null;
let savedMainBounds = null;
let isSyncingBounds = false;
let captureTimeout = null;
const connectedPorts = new Set();

const MODES = ['inpage-rail', 'docked-window', 'command-grid', 'sidepanel'];

// ============================================================================
// TABBOX PRO LICENSING & REVERSE TRIAL CONFIGURATION
// ============================================================================
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7-day full reverse trial
const LICENSE_VERIFY_ENDPOINT = 'https://komunisconcept.org.ng/tabbox-auto/license_verify.php';

async function getProStatus() {
  const stored = await chrome.storage.local.get([
    'installTimestamp',
    'isPro',
    'licenseKey',
    'licenseTier',
    'licenseEmail',
    'proExpiry'
  ]);

  const now = Date.now();
  let installTime = stored.installTimestamp;
  if (!installTime) {
    installTime = now;
    await chrome.storage.local.set({ installTimestamp: now });
  }

  // 1. Paid Pro License Check
  if (stored.isPro && stored.licenseKey) {
    if (stored.licenseTier === 'lifetime') {
      return {
        isPro: true,
        inTrial: false,
        tier: 'lifetime',
        daysRemaining: 0,
        licenseKey: stored.licenseKey,
        email: stored.licenseEmail || '',
        label: 'Lifetime Pro'
      };
    } else if (stored.licenseTier === 'annual') {
      const expiry = stored.proExpiry ? new Date(stored.proExpiry).getTime() : 0;
      if (expiry > now) {
        const daysRemaining = Math.max(1, Math.ceil((expiry - now) / 86400000));
        return {
          isPro: true,
          inTrial: false,
          tier: 'annual',
          daysRemaining,
          licenseKey: stored.licenseKey,
          email: stored.licenseEmail || '',
          label: `Annual Pro (${daysRemaining}d left)`
        };
      }
      // If annual expired, fall through to free tier
    }
  }

  // 2. 7-Day Reverse Trial Check
  const elapsed = now - installTime;
  if (elapsed < TRIAL_DURATION_MS) {
    const daysRemaining = Math.max(1, Math.ceil((TRIAL_DURATION_MS - elapsed) / 86400000));
    return {
      isPro: true,
      inTrial: true,
      tier: 'trial',
      daysRemaining,
      licenseKey: null,
      email: null,
      label: `Pro Trial (${daysRemaining}d left)`
    };
  }

  // 3. Free Tier (Trial expired, no active paid license)
  return {
    isPro: false,
    inTrial: false,
    tier: 'free',
    daysRemaining: 0,
    licenseKey: null,
    email: null,
    label: 'Free Tier'
  };
}

async function verifyAndActivateLicense(licenseKey, email) {
  const cleanKey = (licenseKey || '').trim().toUpperCase();
  if (!cleanKey) {
    return { success: false, message: 'Please enter a valid license key.' };
  }

  try {
    const url = `${LICENSE_VERIFY_ENDPOINT}?action=verify`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: cleanKey, email: email || '' })
    });
    const data = await res.json();
    if (res.ok && data.valid) {
      await chrome.storage.local.set({
        isPro: true,
        licenseKey: cleanKey,
        licenseTier: data.tier || 'lifetime',
        licenseEmail: data.email || email || '',
        proExpiry: data.expires_at || null
      });
      const proStatus = await getProStatus();
      broadcastToPorts({ action: 'PRO_STATUS_UPDATED', proStatus });
      chrome.runtime.sendMessage({ action: 'PRO_STATUS_UPDATED', proStatus }).catch(() => {});
      return { success: true, message: data.message, proStatus };
    } else {
      return { success: false, message: data.message || 'Invalid or expired license key.' };
    }
  } catch (err) {
    // Fallback: If offline or remote endpoint can't be reached, allow algorithmic verification
    if (cleanKey.startsWith('TBX-') && cleanKey.split('-').length === 4) {
      const parts = cleanKey.split('-');
      const isYear = parts[1] === 'YEAR';
      const tier = isYear ? 'annual' : 'lifetime';
      const expiresAt = isYear ? new Date(Date.now() + 365 * 86400000).toISOString() : null;
      await chrome.storage.local.set({
        isPro: true,
        licenseKey: cleanKey,
        licenseTier: tier,
        licenseEmail: email || '',
        proExpiry: expiresAt
      });
      const proStatus = await getProStatus();
      broadcastToPorts({ action: 'PRO_STATUS_UPDATED', proStatus });
      chrome.runtime.sendMessage({ action: 'PRO_STATUS_UPDATED', proStatus }).catch(() => {});
      return { success: true, message: 'Offline license validation accepted!', proStatus };
    }
    return { success: false, message: 'Verification error: ' + (err.message || 'Network unreachable') };
  }
}

// Initialize extension defaults & DNR rules
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    'activeMode',
    'railWidth',
    'railCollapsed',
    'dockedRailWidth',
    'installTimestamp'
  ]);
  const activeMode = stored.activeMode || 'sidepanel';
  const updates = {};
  if (!stored.activeMode) {
    updates.activeMode = 'sidepanel';
    updates.railWidth = 240;
    updates.railCollapsed = false;
    updates.dockedRailWidth = 180;
  }
  if (!stored.installTimestamp) {
    updates.installTimestamp = Date.now();
  }
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
  await updateActionBehavior(activeMode);
  await setupSplitViewHeaderRules();
});

chrome.runtime.onStartup.addListener(async () => {
  const stored = await chrome.storage.local.get(['activeMode']);
  await updateActionBehavior(stored.activeMode || 'sidepanel');
  await setupSplitViewHeaderRules();
});

// Strip X-Frame-Options in sub_frames so in-window Split View can render any site
async function setupSplitViewHeaderRules() {
  if (!chrome.declarativeNetRequest) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1001],
      addRules: [{
        id: 1001,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options', operation: 'remove' },
            { header: 'content-security-policy', operation: 'remove' },
            { header: 'frame-options', operation: 'remove' }
          ]
        },
        condition: {
          resourceTypes: ['sub_frame']
        }
      }]
    });
  } catch (e) {
    // Ignore if unavailable
  }
}

async function updateActionBehavior(mode) {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: mode === 'sidepanel'
      });
    } catch (e) {
      console.error('Error updating sidePanel behavior:', e);
    }
  }
}

// Toolbar icon click handler (when not in sidepanel mode)
chrome.action.onClicked.addListener(async (tab) => {
  let { activeMode = 'sidepanel' } = await chrome.storage.local.get(['activeMode']);
  const pro = await getProStatus();

  // If user is trying to use a gated mode without Pro / active trial, revert to sidepanel
  if (!pro.isPro && activeMode !== 'sidepanel') {
    activeMode = 'sidepanel';
    await chrome.storage.local.set({ activeMode: 'sidepanel' });
    await updateActionBehavior('sidepanel');
    if (tab && tab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    const paywallMsg = { action: 'SHOW_PAYWALL', requestedMode: activeMode, proStatus: pro };
    broadcastToPorts(paywallMsg);
    chrome.runtime.sendMessage(paywallMsg).catch(() => {});
    return;
  }

  if (activeMode === 'inpage-rail') {
    await ensureContentScriptAndSend(tab.id, { action: 'TOGGLE_RAIL_COLLAPSE' });
  } else if (activeMode === 'docked-window') {
    await launchOrFocusDockedWindow();
  } else if (activeMode === 'command-grid') {
    const sent = await ensureContentScriptAndSend(tab.id, { action: 'TOGGLE_COMMAND_MODAL' });
    if (!sent) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('grid.html') });
    }
  } else {
    if (tab && tab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
  }
});

// Keyboard Shortcut Commands (Alt+B and Alt+M)
chrome.commands.onCommand.addListener(async (command) => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pro = await getProStatus();

  if (command === 'toggle-command-modal') {
    if (!pro.isPro) {
      if (activeTab && activeTab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: activeTab.windowId }).catch(() => {});
      }
      const paywallMsg = { action: 'SHOW_PAYWALL', requestedMode: 'command-grid', proStatus: pro };
      broadcastToPorts(paywallMsg);
      chrome.runtime.sendMessage(paywallMsg).catch(() => {});
      return;
    }
    if (activeTab && activeTab.id) {
      const ok = await ensureContentScriptAndSend(activeTab.id, { action: 'TOGGLE_COMMAND_MODAL' });
      if (!ok) {
        await chrome.tabs.create({ url: chrome.runtime.getURL('grid.html') });
      }
    }
  } else if (command === 'cycle-mode') {
    if (!pro.isPro) {
      if (activeTab && activeTab.windowId && chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: activeTab.windowId }).catch(() => {});
      }
      const paywallMsg = { action: 'SHOW_PAYWALL', requestedMode: 'cycle', proStatus: pro };
      broadcastToPorts(paywallMsg);
      chrome.runtime.sendMessage(paywallMsg).catch(() => {});
      return;
    }
    const { activeMode = 'sidepanel' } = await chrome.storage.local.get(['activeMode']);
    const nextIndex = (MODES.indexOf(activeMode) + 1) % MODES.length;
    await switchArchitectureMode(MODES[nextIndex], activeTab ? activeTab.windowId : undefined);
  }
});

// Helper to inject content-rail.js into already-open tabs if needed
async function ensureContentScriptAndSend(tabId, message) {
  if (!tabId) return false;
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-rail.js']
      });
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch (err) {
      return false;
    }
  }
}

// Switch between the 4 Architecture Modes with clean teardown & Pro gating
async function switchArchitectureMode(newMode, originWindowId) {
  const pro = await getProStatus();

  // Mode Gating: Modes 1, 2, and 3 require TabBox Pro
  if (newMode !== 'sidepanel' && !pro.isPro) {
    console.warn(`[TabBox License] Access to mode "${newMode}" blocked: requires TabBox Pro.`);
    if (originWindowId && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: originWindowId }).catch(() => {});
    }
    const paywallMsg = { action: 'SHOW_PAYWALL', requestedMode: newMode, proStatus: pro };
    broadcastToPorts(paywallMsg);
    chrome.runtime.sendMessage(paywallMsg).catch(() => {});
    return false;
  }

  const { activeMode: oldMode } = await chrome.storage.local.get(['activeMode']);
  await chrome.storage.local.set({ activeMode: newMode });
  await updateActionBehavior(newMode);

  // 1. Teardown Docked Companion Window if leaving 'docked-window'
  if (oldMode === 'docked-window' && newMode !== 'docked-window') {
    await teardownDockedWindow();
  }

  // 2. Broadcast mode update to all tabs & extension pages
  const allTabs = await chrome.tabs.query({});
  for (const t of allTabs) {
    if (t.id && t.url && t.url.startsWith('http')) {
      if (newMode === 'inpage-rail' || newMode === 'command-grid') {
        ensureContentScriptAndSend(t.id, { action: 'MODE_CHANGED', mode: newMode });
      } else {
        chrome.tabs.sendMessage(t.id, { action: 'MODE_CHANGED', mode: newMode }).catch(() => {});
      }
    }
  }

  broadcastToPorts({ action: 'MODE_CHANGED', mode: newMode });
  chrome.runtime.sendMessage({ action: 'MODE_CHANGED', mode: newMode }).catch(() => {});

  // 3. Initialize target mode
  if (newMode === 'docked-window') {
    await launchOrFocusDockedWindow(originWindowId);
  } else if (newMode === 'command-grid') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id && activeTab.url && activeTab.url.startsWith('http')) {
      await ensureContentScriptAndSend(activeTab.id, { action: 'TOGGLE_COMMAND_MODAL', forceOpen: true });
    } else {
      await chrome.tabs.create({ url: chrome.runtime.getURL('grid.html') });
    }
  } else if (newMode === 'sidepanel') {
    if (originWindowId && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: originWindowId }).catch(() => {});
    }
  }
}

// ============================================================================
// ARCHITECTURE 2: Synchronized Docked Companion Window Manager
// ============================================================================
async function launchOrFocusDockedWindow(preferredWindowId) {
  try {
    if (dockedWindowId !== null) {
      try {
        const existing = await chrome.windows.get(dockedWindowId);
        if (existing) {
          await chrome.windows.update(dockedWindowId, { focused: true });
          return;
        }
      } catch (e) {
        dockedWindowId = null;
      }
    }

    // Find target normal browser window
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    let mainWin = windows.find(w => w.id === preferredWindowId) || windows.find(w => w.focused) || windows[0];
    if (!mainWin) return;

    mainBrowserWindowId = mainWin.id;
    savedMainBounds = {
      left: mainWin.left || 0,
      top: mainWin.top || 0,
      width: mainWin.width || 1280,
      height: mainWin.height || 900,
      state: mainWin.state
    };

    const { dockedRailWidth = 180 } = await chrome.storage.local.get(['dockedRailWidth']);
    const railWidth = Math.max(100, Math.min(420, dockedRailWidth));

    isSyncingBounds = true;

    // Unmaximize first on Windows so bounds take effect
    if (mainWin.state === 'maximized' || mainWin.state === 'fullscreen') {
      await chrome.windows.update(mainWin.id, { state: 'normal' });
    }

    const screenLeft = mainWin.left && mainWin.left > 0 ? 0 : (mainWin.left || 0);
    const screenTop = mainWin.top || 0;
    const totalWidth = Math.max(800, (mainWin.width || 1400));
    const mainHeight = Math.max(500, (mainWin.height || 900));

    // Shift main window right by railWidth
    await chrome.windows.update(mainWin.id, {
      left: screenLeft + railWidth,
      top: screenTop,
      width: Math.max(500, totalWidth - railWidth),
      height: mainHeight
    });

    // Spawn frameless docked popup window on left edge
    const popupWin = await chrome.windows.create({
      url: chrome.runtime.getURL('sidepanel.html?mode=docked'),
      type: 'popup',
      left: screenLeft,
      top: screenTop,
      width: railWidth,
      height: mainHeight,
      focused: true
    });

    dockedWindowId = popupWin.id;
    setTimeout(() => { isSyncingBounds = false; }, 350);
  } catch (err) {
    isSyncingBounds = false;
    console.error('Failed to launch docked window:', err);
  }
}

async function resizeDockedCompanionWindow(newRailWidth) {
  if (!dockedWindowId || !mainBrowserWindowId) return;
  try {
    isSyncingBounds = true;
    const railW = Math.max(100, Math.min(480, Math.round(newRailWidth)));
    await chrome.storage.local.set({ dockedRailWidth: railW });

    const dockedWin = await chrome.windows.get(dockedWindowId);
    const mainWin = await chrome.windows.get(mainBrowserWindowId);
    const baseLeft = dockedWin.left || 0;
    const totalRightEdge = (mainWin.left || 0) + (mainWin.width || 1200);

    await chrome.windows.update(dockedWindowId, {
      left: baseLeft,
      width: railW,
      top: mainWin.top,
      height: mainWin.height
    });

    await chrome.windows.update(mainBrowserWindowId, {
      left: baseLeft + railW,
      width: Math.max(500, totalRightEdge - (baseLeft + railW)),
      top: mainWin.top,
      height: mainWin.height
    });

    setTimeout(() => { isSyncingBounds = false; }, 250);
  } catch (e) {
    isSyncingBounds = false;
  }
}

async function teardownDockedWindow() {
  try {
    isSyncingBounds = true;
    if (dockedWindowId !== null) {
      const idToClose = dockedWindowId;
      dockedWindowId = null;
      await chrome.windows.remove(idToClose).catch(() => {});
    }
    if (mainBrowserWindowId !== null && savedMainBounds) {
      await chrome.windows.update(mainBrowserWindowId, {
        left: savedMainBounds.left,
        top: savedMainBounds.top,
        width: savedMainBounds.width,
        height: savedMainBounds.height
      }).catch(() => {});
    }
    setTimeout(() => { isSyncingBounds = false; }, 250);
  } catch (e) {
    isSyncingBounds = false;
  }
}

// Synchronize Docked Companion Window and Main Window when moved or resized
if (chrome.windows && chrome.windows.onBoundsChanged) {
  chrome.windows.onBoundsChanged.addListener(async (win) => {
    if (isSyncingBounds || !dockedWindowId || !mainBrowserWindowId) return;
    try {
      if (win.id === mainBrowserWindowId && win.state === 'normal') {
        isSyncingBounds = true;
        const dockedWin = await chrome.windows.get(dockedWindowId);
        const railW = dockedWin.width || 180;
        await chrome.windows.update(dockedWindowId, {
          left: Math.max(0, (win.left || 0) - railW),
          top: win.top,
          height: win.height
        });
        setTimeout(() => { isSyncingBounds = false; }, 150);
      } else if (win.id === dockedWindowId && win.state === 'normal') {
        isSyncingBounds = true;
        const railW = win.width || 180;
        await chrome.storage.local.set({ dockedRailWidth: railW });
        const mainWin = await chrome.windows.get(mainBrowserWindowId);
        const rightEdge = (mainWin.left || 0) + (mainWin.width || 1200);
        const newMainLeft = (win.left || 0) + railW;
        await chrome.windows.update(mainBrowserWindowId, {
          left: newMainLeft,
          top: win.top,
          width: Math.max(400, rightEdge - newMainLeft),
          height: win.height
        });
        setTimeout(() => { isSyncingBounds = false; }, 150);
      }
    } catch (e) {
      isSyncingBounds = false;
    }
  });
}

chrome.windows.onRemoved.addListener((winId) => {
  if (winId === dockedWindowId) {
    dockedWindowId = null;
  }
});

// ============================================================================
// NATIVE CHROME SPLIT TAB & TAB ACTIONS ENGINE
// ============================================================================
async function performNativeSplitTab(targetTabId, windowId) {
  try {
    const queryOpts = windowId ? { active: true, windowId } : { active: true, currentWindow: true };
    let [activeTab] = await chrome.tabs.query(queryOpts);
    if (!activeTab) {
      const allActive = await chrome.tabs.query({ active: true });
      activeTab = allActive.find(t => !t.url?.includes('sidepanel.html')) || allActive[0];
    }
    if (!activeTab) return;

    const winTabs = await chrome.tabs.query({ windowId: activeTab.windowId });
    let secondTab = winTabs.find(t => t.id === targetTabId && t.id !== activeTab.id);
    if (!secondTab) {
      secondTab = winTabs.find(t => t.id !== activeTab.id && !t.url?.includes('sidepanel.html'));
    }
    if (!secondTab) return;

    // 1. Try Chrome's Native Split View API if exposed in this Chromium build
    if (typeof chrome.tabs.createSplitView === 'function') {
      await chrome.tabs.createSplitView([activeTab.id, secondTab.id]);
      return;
    }
    if (typeof chrome.tabs.split === 'function') {
      await chrome.tabs.split([activeTab.id, secondTab.id]);
      return;
    }

    // 2. Move secondTab immediately next to activeTab in the same window
    const targetIndex = activeTab.index + 1;
    await chrome.tabs.move(secondTab.id, { index: targetIndex });

    // 3. Natively multi-highlight both tabs in Chrome's tab strip (pairs them for native Split View)
    const updatedActive = await chrome.tabs.get(activeTab.id);
    const updatedSecond = await chrome.tabs.get(secondTab.id);
    await chrome.tabs.highlight({
      windowId: activeTab.windowId,
      tabs: [updatedActive.index, updatedSecond.index]
    });

    // 4. Also open in-window dual-pane split tab if native browser split view did not take over
    let leftUrl = updatedActive.url || 'https://google.com';
    let rightUrl = updatedSecond.url || 'https://google.com';
    if (leftUrl.startsWith('chrome://')) leftUrl = 'https://en.wikipedia.org';
    if (rightUrl.startsWith('chrome://')) rightUrl = 'https://news.ycombinator.com';

    const splitPageUrl = chrome.runtime.getURL(
      `splitview.html?left=${encodeURIComponent(leftUrl)}&right=${encodeURIComponent(rightUrl)}`
    );
    await chrome.tabs.create({
      windowId: activeTab.windowId,
      url: splitPageUrl,
      index: updatedSecond.index + 1
    });
  } catch (err) {
    console.error('Error performing native split tab:', err);
  }
}

// ============================================================================
// REAL-TIME STATE & MESSAGING BUS
// ============================================================================
async function getFullTabState(preferredWindowId) {
  let targetWinId = preferredWindowId || mainBrowserWindowId;
  if (!targetWinId) {
    const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const focusedNormal = normalWindows.find(w => w.focused) || normalWindows[0];
    if (focusedNormal) targetWinId = focusedNormal.id;
  }

  const tabs = targetWinId
    ? await chrome.tabs.query({ windowId: targetWinId })
    : await chrome.tabs.query({ currentWindow: true });

  let groups = [];
  if (chrome.tabGroups && targetWinId) {
    try {
      groups = await chrome.tabGroups.query({ windowId: targetWinId });
    } catch (e) {}
  }

  let thumbnails = {};
  try {
    const sessionData = await chrome.storage.session.get(null);
    for (const [k, v] of Object.entries(sessionData)) {
      if (k.startsWith('thumb_')) {
        thumbnails[parseInt(k.replace('thumb_', ''), 10)] = v;
      }
    }
  } catch (e) {}

  const stored = await chrome.storage.local.get([
    'activeMode',
    'railWidth',
    'railCollapsed',
    'railStyle',
    'bubbleTop',
    'dockedRailWidth',
    'tabBoxColumns',
    'tabBoxVisualMode',
    'tabBoxVisualSize'
  ]);

  const proStatus = await getProStatus();
  const wsData = await chrome.storage.local.get(['tabBoxWorkspaces']);
  const workspacesCount = wsData.tabBoxWorkspaces?.length || 0;

  return {
    tabs,
    groups,
    thumbnails,
    activeMode: stored.activeMode || 'sidepanel',
    railWidth: stored.railWidth || 240,
    railCollapsed: Boolean(stored.railCollapsed),
    railStyle: stored.railStyle || 'strip',
    bubbleTop: stored.bubbleTop !== undefined ? stored.bubbleTop : 50,
    dockedRailWidth: stored.dockedRailWidth || 180,
    columns: stored.tabBoxColumns || 3,
    isVisualMode: stored.tabBoxVisualMode !== undefined ? Boolean(stored.tabBoxVisualMode) : true,
    visualSize: stored.tabBoxVisualSize || 'md',
    proStatus,
    workspacesCount
  };
}

async function broadcastTabState() {
  const state = await getFullTabState();
  const payload = { action: 'TABS_UPDATED', ...state };
  broadcastToPorts(payload);
  chrome.runtime.sendMessage(payload).catch(() => {});
}

function broadcastToPorts(msg) {
  for (const port of connectedPorts) {
    try {
      port.postMessage(msg);
    } catch (e) {
      connectedPorts.delete(port);
    }
  }
}

// Long-lived port connections for content-rail.js and grid.html
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'tabbox-bus') {
    connectedPorts.add(port);
    getFullTabState().then((state) => {
      try {
        port.postMessage({ action: 'INIT_STATE', ...state });
      } catch (e) {}
    });

    port.onMessage.addListener(async (msg) => {
      await handleBusMessage(msg, port.sender);
    });

    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
    });
  }
});

// One-off message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'GET_STATE') {
    getFullTabState(sender?.tab?.windowId).then(sendResponse);
    return true;
  }
  handleBusMessage(msg, sender).then((res) => sendResponse(res || { ok: true }));
  return true;
});

async function handleBusMessage(msg, sender) {
  const winId = sender?.tab?.windowId || mainBrowserWindowId;
  switch (msg.action) {
    case 'GET_PRO_STATUS':
      return await getProStatus();
    case 'VERIFY_LICENSE':
      return await verifyAndActivateLicense(msg.licenseKey, msg.email);
    case 'OPEN_PAYWALL': {
      const pro = await getProStatus();
      const paywallMsg = { action: 'SHOW_PAYWALL', requestedMode: msg.requestedMode || 'pro-feature', proStatus: pro };
      broadcastToPorts(paywallMsg);
      chrome.runtime.sendMessage(paywallMsg).catch(() => {});
      return { ok: true };
    }
    case 'CHECK_WORKSPACE_LIMIT': {
      const pro = await getProStatus();
      const wsData = await chrome.storage.local.get(['tabBoxWorkspaces']);
      const count = wsData.tabBoxWorkspaces?.length || 0;
      if (!pro.isPro && count >= 1) {
        return { allowed: false, isPro: false, count, maxAllowed: 1 };
      }
      return { allowed: true, isPro: pro.isPro, count };
    }
    case 'SET_MODE':
      await switchArchitectureMode(msg.mode, winId);
      break;
    case 'SWITCH_TAB':
      if (msg.tabId) {
        const tab = await chrome.tabs.get(msg.tabId);
        await chrome.tabs.update(msg.tabId, { active: true });
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        }
      }
      break;
    case 'CLOSE_TAB':
      if (msg.tabId) {
        await chrome.tabs.remove(msg.tabId);
      }
      break;
    case 'CREATE_TAB':
      await chrome.tabs.create({
        windowId: winId || undefined,
        url: msg.url || undefined
      });
      break;
    case 'REORDER_TAB':
      if (msg.tabId !== undefined && msg.index !== undefined) {
        await chrome.tabs.move(msg.tabId, { index: msg.index });
      }
      break;
    case 'SPLIT_TAB':
      await performNativeSplitTab(msg.tabId, winId);
      break;
    case 'PIN_TAB':
      if (msg.tabId) {
        const t = await chrome.tabs.get(msg.tabId);
        await chrome.tabs.update(msg.tabId, { pinned: !t.pinned });
      }
      break;
    case 'MUTE_TAB':
      if (msg.tabId) {
        const t = await chrome.tabs.get(msg.tabId);
        await chrome.tabs.update(msg.tabId, { muted: !t.mutedInfo?.muted });
      }
      break;
    case 'SLEEP_TAB':
      if (msg.tabId) {
        await chrome.tabs.discard(msg.tabId).catch(() => {});
      }
      break;
    case 'SAVE_RAIL_PREFS': {
      const updates = {};
      if (msg.railWidth !== undefined) updates.railWidth = msg.railWidth;
      if (msg.railCollapsed !== undefined) updates.railCollapsed = msg.railCollapsed;
      if (msg.railStyle !== undefined) updates.railStyle = msg.railStyle;
      if (msg.bubbleTop !== undefined) updates.bubbleTop = msg.bubbleTop;
      await chrome.storage.local.set(updates);
      broadcastTabState();
      break;
    }
    case 'RESIZE_DOCKED_WINDOW':
      await resizeDockedCompanionWindow(msg.width);
      break;
    case 'OPEN_GRID_VIEW':
      await chrome.tabs.create({ url: chrome.runtime.getURL('grid.html') });
      break;
  }
}

// ============================================================================
// THUMBNAIL CAPTURE & TAB EVENT LISTENERS
// ============================================================================
async function scheduleCapture(windowId) {
  if (captureTimeout) clearTimeout(captureTimeout);
  captureTimeout = setTimeout(async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId });
      if (!activeTab || !activeTab.id || !activeTab.url || !activeTab.url.startsWith('http')) return;

      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: 'jpeg',
        quality: 45
      });

      if (dataUrl) {
        await chrome.storage.session.set({ [`thumb_${activeTab.id}`]: dataUrl });
        const payload = {
          action: 'THUMBNAIL_UPDATED',
          tabId: activeTab.id,
          dataUrl
        };
        broadcastToPorts(payload);
        chrome.runtime.sendMessage(payload).catch(() => {});
      }
    } catch (e) {}
  }, 250);
}

chrome.tabs.onCreated.addListener(() => broadcastTabState());
chrome.tabs.onMoved.addListener(() => broadcastTabState());
chrome.tabs.onAttached.addListener(() => broadcastTabState());
chrome.tabs.onDetached.addListener(() => broadcastTabState());

chrome.tabs.onActivated.addListener((activeInfo) => {
  broadcastTabState();
  scheduleCapture(activeInfo.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' ||
    changeInfo.title ||
    changeInfo.favIconUrl ||
    changeInfo.audible !== undefined ||
    changeInfo.mutedInfo ||
    changeInfo.pinned !== undefined ||
    changeInfo.discarded !== undefined
  ) {
    broadcastTabState();
    if (changeInfo.status === 'complete' && tab.active) {
      scheduleCapture(tab.windowId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`thumb_${tabId}`).catch(() => {});
  broadcastTabState();
});

if (chrome.tabGroups) {
  chrome.tabGroups.onCreated.addListener(() => broadcastTabState());
  chrome.tabGroups.onUpdated.addListener(() => broadcastTabState());
  chrome.tabGroups.onRemoved.addListener(() => broadcastTabState());
  chrome.tabGroups.onMoved.addListener(() => broadcastTabState());
}
