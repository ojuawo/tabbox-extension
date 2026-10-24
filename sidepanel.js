// TabBox Side Panel Script - Full Feature Suite

let columns = 3; // 2 - 6 per row
let isVisualMode = true;
let visualSize = 'md';
let searchFilter = '';
let currentTabs = [];
let currentGroups = [];
let tabThumbnails = {}; // tabId -> dataUrl
let tabLastActive = {}; // tabId -> timestamp
let draggedTabId = null;
let peekTimer = null;
let contextTab = null;

const SIZE_HEIGHT_MAP = {
  sm: '65px',
  md: '85px',
  lg: '115px'
};

const DEFAULT_FAVICON_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"></circle>
  <line x1="2" y1="12" x2="22" y2="12"></line>
  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
</svg>
`)}`;

// DOM Elements
const tabsGrid = document.getElementById('tabs-grid');
const tabGroupsContainer = document.getElementById('tab-groups-container');
const pinnedGrid = document.getElementById('pinned-grid');
const pinnedSection = document.getElementById('pinned-section');
const tabSearchInput = document.getElementById('tab-search');
const clearSearchBtn = document.getElementById('clear-search');
const newTabBtn = document.getElementById('new-tab-btn');
const tabCountEl = document.getElementById('tab-count');
const emptyStateEl = document.getElementById('empty-state');

// Column controls
const colSlider = document.getElementById('col-slider');
const colDecBtn = document.getElementById('col-dec');
const colIncBtn = document.getElementById('col-inc');
const colDisplay = document.getElementById('col-display');

// Mini visual & size controls
const togglePreviewBtn = document.getElementById('toggle-preview-btn');
const visualSizeControl = document.getElementById('visual-size-control');
const sizePillButtons = document.querySelectorAll('.size-pill');

// Duplicates & Memory Saver
const cleanDupsBtn = document.getElementById('clean-dups-btn');
const dupsCountText = document.getElementById('dups-count-text');
const sleepInactiveBtn = document.getElementById('sleep-inactive-btn');

// Sort & Workspaces
const sortMenuBtn = document.getElementById('sort-menu-btn');
const sortDropdown = document.getElementById('sort-dropdown');
const workspaceBtn = document.getElementById('workspace-btn');
const workspacesModal = document.getElementById('workspaces-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const newWorkspaceName = document.getElementById('new-workspace-name');
const saveCurrentWsBtn = document.getElementById('save-current-ws-btn');
const workspacesList = document.getElementById('workspaces-list');

// Hover Peek Card
const hoverPeekCard = document.getElementById('hover-peek-card');
const peekImg = document.getElementById('peek-img');
const peekAudio = document.getElementById('peek-audio');
const peekSleep = document.getElementById('peek-sleep');
const peekFavicon = document.getElementById('peek-favicon');
const peekTitle = document.getElementById('peek-title');
const peekUrl = document.getElementById('peek-url');

// Context Menu Elements
const contextMenu = document.getElementById('context-menu');
const ctxPinText = document.getElementById('ctx-pin-text');
const ctxMuteText = document.getElementById('ctx-mute-text');

// Pro Licensing & Paywall Elements
let proStatus = { isPro: false, inTrial: false, tier: 'free', daysRemaining: 0, label: 'Free Tier' };
const proStatusStrip = document.getElementById('pro-status-strip');
const proStatusIcon = document.getElementById('pro-status-icon');
const proStatusText = document.getElementById('pro-status-text');
const stripUpgradeBtn = document.getElementById('strip-upgrade-btn');
const tabboxPaywallModal = document.getElementById('tabbox-paywall-modal');
const closePaywallBtn = document.getElementById('close-paywall-btn');
const paywallTitle = document.getElementById('paywall-title');
const paywallSubtitle = document.getElementById('paywall-subtitle');
const btnBuyLifetime = document.getElementById('btn-buy-lifetime');
const btnBuyAnnual = document.getElementById('btn-buy-annual');
const licenseKeyInput = document.getElementById('license-key-input');
const activateLicenseBtn = document.getElementById('activate-license-btn');
const activationFeedback = document.getElementById('activation-feedback');

// Initialize
const isDockedWindowMode = new URLSearchParams(window.location.search).get('mode') === 'docked';
let currentActiveMode = isDockedWindowMode ? 'docked-window' : 'sidepanel';
let isDockedCollapsed = false;

document.addEventListener('DOMContentLoaded', async () => {
  // Load preferences
  const stored = await chrome.storage.local.get([
    'activeMode',
    'tabBoxColumns',
    'tabBoxVisualMode',
    'tabBoxVisualSize'
  ]);
  if (stored) {
    if (stored.activeMode && !isDockedWindowMode) currentActiveMode = stored.activeMode;
    if (stored.tabBoxColumns !== undefined) columns = Math.min(6, Math.max(2, parseInt(stored.tabBoxColumns, 10)));
    if (stored.tabBoxVisualMode !== undefined) isVisualMode = Boolean(stored.tabBoxVisualMode);
    if (stored.tabBoxVisualSize && SIZE_HEIGHT_MAP[stored.tabBoxVisualSize]) visualSize = stored.tabBoxVisualSize;
  }

  // Load initial Pro / Trial Status
  try {
    const status = await chrome.runtime.sendMessage({ action: 'GET_PRO_STATUS' });
    if (status) proStatus = status;
  } catch (e) {}

  // Setup Mode Switcher Pill Bar & Docked Window controls
  setupModeSwitcherAndDockedObserver();

  // Setup Paywall Modal & Upgrade triggers
  setupPaywallEventListeners();
  updateProStatusUI();

  // Load cached screenshots
  await loadStoredThumbnails();

  // Apply UI settings
  applyColumnSettings(columns);
  applyVisualModeSettings();
  applyVisualSizeSettings(visualSize);

  // Setup event listeners
  setupEventListeners();

  // Render tabs & groups
  await refreshTabs();

  // Capture active tab screenshot
  captureActiveTabPreview();

  // Setup Onboarding Tour & check for new install
  setupTourEventListeners();
  const tourPref = await chrome.storage.local.get(['hasSeenOnboarding']);
  if (!tourPref.hasSeenOnboarding) {
    setTimeout(() => startOnboardingTour(false), 600);
  }
});

function setupModeSwitcherAndDockedObserver() {
  const modePills = document.querySelectorAll('.mode-switch-pill');
  const updateModeUI = (mode) => {
    currentActiveMode = mode;
    modePills.forEach(p => p.classList.toggle('active', p.dataset.mode === mode));
  };
  updateModeUI(currentActiveMode);

  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const targetMode = pill.dataset.mode;
      if (targetMode !== 'sidepanel' && !proStatus.isPro) {
        // Intercept click: user cannot switch to gated modes without Pro or active trial
        openPaywallModal(targetMode);
        return;
      }
      updateModeUI(targetMode);
      chrome.runtime.sendMessage({ action: 'SET_MODE', mode: targetMode }).catch(() => {});
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'MODE_CHANGED' && msg.mode) {
      updateModeUI(msg.mode);
    } else if (msg.action === 'SHOW_PAYWALL') {
      openPaywallModal(msg.requestedMode);
    } else if (msg.action === 'PRO_STATUS_UPDATED' && msg.proStatus) {
      proStatus = msg.proStatus;
      updateProStatusUI();
    }
  });

  const dockSnapBtn = document.getElementById('dock-snap-btn');
  if (isDockedWindowMode && dockSnapBtn) {
    dockSnapBtn.hidden = false;
    dockSnapBtn.addEventListener('click', () => {
      isDockedCollapsed = !isDockedCollapsed;
      const targetWidth = isDockedCollapsed ? 120 : 260;
      chrome.runtime.sendMessage({ action: 'RESIZE_DOCKED_WINDOW', width: targetWidth }).catch(() => {});
    });
  }

  // ResizeObserver for dynamic reflow down to 100px
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = entry.contentRect.width;
      if (w < 190 && columns > 2) {
        applyColumnSettings(2);
      } else if (w >= 260 && isDockedWindowMode && columns === 2) {
        applyColumnSettings(3);
      }
    }
  });
  ro.observe(document.body);
}

function updateProStatusUI() {
  if (!proStatusStrip) return;
  const modePills = document.querySelectorAll('.mode-switch-pill');

  if (proStatus.isPro) {
    if (proStatus.inTrial) {
      proStatusStrip.hidden = false;
      proStatusStrip.classList.remove('is-pro');
      proStatusIcon.textContent = '⚡';
      proStatusText.textContent = `Pro Trial: ${proStatus.daysRemaining}d left`;
      stripUpgradeBtn.hidden = false;
      stripUpgradeBtn.textContent = 'Get Lifetime ($10)';
    } else {
      proStatusStrip.hidden = false;
      proStatusStrip.classList.add('is-pro');
      proStatusIcon.textContent = '⭐';
      proStatusText.textContent = proStatus.tier === 'lifetime' ? 'TabBox Pro (Lifetime)' : `TabBox Pro (${proStatus.daysRemaining}d left)`;
      stripUpgradeBtn.hidden = true;
    }

    modePills.forEach(pill => {
      pill.classList.remove('is-locked');
      const badge = pill.querySelector('.badge-pro');
      if (badge) badge.textContent = 'PRO';
    });
  } else {
    // Free Tier (Trial expired)
    proStatusStrip.hidden = false;
    proStatusStrip.classList.remove('is-pro');
    proStatusIcon.textContent = '🔒';
    proStatusText.textContent = 'Free Tier: Unlock Rail, Dock & Modal';
    stripUpgradeBtn.hidden = false;
    stripUpgradeBtn.textContent = 'Go Pro ($10)';

    modePills.forEach(pill => {
      if (pill.dataset.mode !== 'sidepanel') {
        pill.classList.add('is-locked');
        const badge = pill.querySelector('.badge-pro');
        if (badge) badge.textContent = '🔒';
      }
    });
  }
}

function openPaywallModal(triggerReason) {
  if (!tabboxPaywallModal) return;
  tabboxPaywallModal.hidden = false;
  if (activationFeedback) {
    activationFeedback.hidden = true;
    activationFeedback.className = 'activation-feedback';
    activationFeedback.textContent = '';
  }

  if (triggerReason === 'inpage-rail') {
    paywallTitle.textContent = 'Unlock In-Page Rail & Chat Circle';
    paywallSubtitle.textContent = 'Bypass Chrome’s 320px floor with the 56px margin-squishing rail and floating chat bubble.';
  } else if (triggerReason === 'docked-window') {
    paywallTitle.textContent = 'Unlock Docked Companion Window';
    paywallSubtitle.textContent = 'Snap a frameless, synchronized companion window to the browser edge with 100px-480px width.';
  } else if (triggerReason === 'command-grid') {
    paywallTitle.textContent = 'Unlock Arc Bento Command Modal (Alt+B)';
    paywallSubtitle.textContent = 'Fuzzy search, keyboard-navigated tab jump, and multi-column visual bento overlay.';
  } else if (triggerReason === 'workspaces') {
    paywallTitle.textContent = 'Unlock Unlimited Workspaces';
    paywallSubtitle.textContent = 'Free tier allows 1 saved workspace. Upgrade to Pro to save and restore unlimited workspaces!';
  } else {
    paywallTitle.textContent = 'Unlock All 4 Architecture Modes';
    paywallSubtitle.textContent = 'Choose $10 for lifetime access or $4/year micro-subscription. 7-day reverse trial included.';
  }
}

function closePaywallModal() {
  if (tabboxPaywallModal) tabboxPaywallModal.hidden = true;
}

function setupPaywallEventListeners() {
  if (stripUpgradeBtn) {
    stripUpgradeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPaywallModal();
    });
  }

  if (closePaywallBtn) {
    closePaywallBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePaywallModal();
    });
  }

  if (tabboxPaywallModal) {
    tabboxPaywallModal.addEventListener('click', (e) => {
      if (e.target === tabboxPaywallModal) closePaywallModal();
    });
  }

  // Lifetime Checkout ($10)
  if (btnBuyLifetime) {
    btnBuyLifetime.addEventListener('click', () => {
      const checkoutUrl = 'https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=checkout&tier=lifetime&redirect=true';
      chrome.tabs.create({ url: checkoutUrl });
    });
  }

  // Annual Checkout ($4/yr)
  if (btnBuyAnnual) {
    btnBuyAnnual.addEventListener('click', () => {
      const checkoutUrl = 'https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=checkout&tier=annual&redirect=true';
      chrome.tabs.create({ url: checkoutUrl });
    });
  }

  // License Key Activation
  if (activateLicenseBtn && licenseKeyInput) {
    activateLicenseBtn.addEventListener('click', async () => {
      const key = licenseKeyInput.value.trim();
      if (!key) {
        activationFeedback.hidden = false;
        activationFeedback.className = 'activation-feedback error';
        activationFeedback.textContent = 'Please enter your license key.';
        return;
      }

      activateLicenseBtn.disabled = true;
      activateLicenseBtn.textContent = 'Verifying...';
      activationFeedback.hidden = true;

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'VERIFY_LICENSE',
          licenseKey: key
        });

        activateLicenseBtn.disabled = false;
        activateLicenseBtn.textContent = 'Activate';

        if (response && response.success) {
          activationFeedback.hidden = false;
          activationFeedback.className = 'activation-feedback success';
          activationFeedback.textContent = `✓ ${response.message || 'License verified! Pro unlocked.'}`;
          if (response.proStatus) {
            proStatus = response.proStatus;
            updateProStatusUI();
          }
          setTimeout(() => {
            closePaywallModal();
          }, 1500);
        } else {
          activationFeedback.hidden = false;
          activationFeedback.className = 'activation-feedback error';
          activationFeedback.textContent = `✕ ${response?.message || 'Invalid license key.'}`;
        }
      } catch (err) {
        activateLicenseBtn.disabled = false;
        activateLicenseBtn.textContent = 'Activate';
        activationFeedback.hidden = false;
        activationFeedback.className = 'activation-feedback error';
        activationFeedback.textContent = `✕ Connection error: ${err.message}`;
      }
    });

    licenseKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        activateLicenseBtn.click();
      }
    });
  }
}

// ============================================================
// INTERACTIVE ONBOARDING TOUR FOR NEW INSTALLS
// ============================================================
const tourHelpBtn = document.getElementById('tour-help-btn');
const onboardingTourOverlay = document.getElementById('onboarding-tour-overlay');
const tourStepPill = document.getElementById('tour-step-pill');
const tourCloseBtn = document.getElementById('tour-close-btn');
const tourSkipBtn = document.getElementById('tour-skip-btn');
const tourPrevBtn = document.getElementById('tour-prev-btn');
const tourNextBtn = document.getElementById('tour-next-btn');
const tourIcon = document.getElementById('tour-icon');
const tourTitle = document.getElementById('tour-title');
const tourDesc = document.getElementById('tour-desc');
const tourDots = document.querySelectorAll('.tour-dot');

const TOUR_STEPS = [
  {
    targetSelector: '#mode-switcher-bar',
    icon: '🚀',
    title: '4 Architecture Modes',
    desc: 'Switch between 4 modes: In-page rail (Mode 1), Docked companion window (Mode 2), Arc command modal (Mode 3), and Side panel (Mode 4). All modes are active during your 7-day free trial!'
  },
  {
    targetSelector: '.columns-group',
    icon: '🔲',
    title: 'Bento Column Slider (2 to 6)',
    desc: 'Use the slider or −/+ buttons to fit 2, 3, 4, 5, or 6 tab boxes per row. TabBox automatically reflows to fit any screen or sidebar width.'
  },
  {
    targetSelector: '.preview-group',
    icon: '🖼️',
    title: 'Live Visual Previews & Sizes',
    desc: 'See live screenshots of what’s inside your tabs! Toggle between visual snapshots and compact icon tiles, and pick S, M, or L card heights.'
  },
  {
    targetSelector: '#sleep-inactive-btn',
    icon: '⚡',
    title: 'Tab Snoozer & Shortcut (Alt+B)',
    desc: 'Click "Sleep Inactive" anytime to hibernate background tabs and free RAM. Press Alt+B anywhere to search, jump, and switch tabs without touching the mouse!'
  }
];

let currentTourStep = 0;

function setupTourEventListeners() {
  if (tourHelpBtn) {
    tourHelpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startOnboardingTour(true);
    });
  }

  if (tourCloseBtn) {
    tourCloseBtn.addEventListener('click', () => finishTour());
  }

  if (tourSkipBtn) {
    tourSkipBtn.addEventListener('click', () => finishTour());
  }

  if (tourNextBtn) {
    tourNextBtn.addEventListener('click', () => nextTourStep());
  }

  if (tourPrevBtn) {
    tourPrevBtn.addEventListener('click', () => prevTourStep());
  }

  if (onboardingTourOverlay) {
    onboardingTourOverlay.addEventListener('click', (e) => {
      if (e.target === onboardingTourOverlay) finishTour();
    });
  }
}

function startOnboardingTour(isManual = false) {
  if (!onboardingTourOverlay) return;
  currentTourStep = 0;
  onboardingTourOverlay.hidden = false;
  renderTourStep();
}

function renderTourStep() {
  // Remove previous highlights
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));

  const step = TOUR_STEPS[currentTourStep];
  if (!step) return;

  const targetEl = document.querySelector(step.targetSelector);
  if (targetEl) {
    targetEl.classList.add('tour-highlight');
    try {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}
  }

  if (tourStepPill) tourStepPill.textContent = `Tip ${currentTourStep + 1} of ${TOUR_STEPS.length}`;
  if (tourIcon) tourIcon.textContent = step.icon;
  if (tourTitle) tourTitle.textContent = step.title;
  if (tourDesc) tourDesc.textContent = step.desc;

  if (tourDots) {
    tourDots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentTourStep);
    });
  }

  if (currentTourStep === 0) {
    if (tourPrevBtn) tourPrevBtn.hidden = true;
    if (tourSkipBtn) tourSkipBtn.hidden = false;
    if (tourNextBtn) tourNextBtn.textContent = 'Next';
  } else if (currentTourStep === TOUR_STEPS.length - 1) {
    if (tourPrevBtn) tourPrevBtn.hidden = false;
    if (tourSkipBtn) tourSkipBtn.hidden = true;
    if (tourNextBtn) tourNextBtn.textContent = 'Get Started 🎉';
  } else {
    if (tourPrevBtn) tourPrevBtn.hidden = false;
    if (tourSkipBtn) tourSkipBtn.hidden = false;
    if (tourNextBtn) tourNextBtn.textContent = 'Next';
  }
}

function nextTourStep() {
  if (currentTourStep < TOUR_STEPS.length - 1) {
    currentTourStep++;
    renderTourStep();
  } else {
    finishTour();
  }
}

function prevTourStep() {
  if (currentTourStep > 0) {
    currentTourStep--;
    renderTourStep();
  }
}

function finishTour() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  if (onboardingTourOverlay) onboardingTourOverlay.hidden = true;
  chrome.storage.local.set({ hasSeenOnboarding: true }).catch(() => {});
}

// Load cached thumbnails from session storage
async function loadStoredThumbnails() {
  try {
    const sessionData = await chrome.storage.session.get(null);
    for (const [key, value] of Object.entries(sessionData)) {
      if (key.startsWith('thumb_')) {
        const tabId = parseInt(key.replace('thumb_', ''), 10);
        if (tabId) tabThumbnails[tabId] = value;
      }
    }
  } catch (e) {
    console.warn('Session storage read skipped:', e);
  }
}

// Capture current active tab preview
async function captureActiveTabPreview() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: currentWindow.id });
    if (!activeTab || !activeTab.id || !activeTab.url || !activeTab.url.startsWith('http')) return;

    tabLastActive[activeTab.id] = Date.now();

    const dataUrl = await chrome.tabs.captureVisibleTab(currentWindow.id, {
      format: 'jpeg',
      quality: 45
    });

    if (dataUrl) {
      tabThumbnails[activeTab.id] = dataUrl;
      chrome.storage.session.set({ [`thumb_${activeTab.id}`]: dataUrl }).catch(() => { });
      updateSingleTabThumbnail(activeTab.id, dataUrl);
    }
  } catch (e) {
    // Ignore restricted URLs
  }
}

// Setup event listeners
function setupEventListeners() {
  // Column Controls (2 to 6 per row)
  colSlider.addEventListener('input', (e) => setColumns(parseInt(e.target.value, 10)));
  colDecBtn.addEventListener('click', () => setColumns(columns - 1));
  colIncBtn.addEventListener('click', () => setColumns(columns + 1));

  // Toggle Mini Visual
  togglePreviewBtn.addEventListener('click', () => {
    isVisualMode = !isVisualMode;
    chrome.storage.local.set({ tabBoxVisualMode: isVisualMode });
    applyVisualModeSettings();
  });

  // Size pills (S, M, L)
  sizePillButtons.forEach(btn => {
    btn.addEventListener('click', () => setVisualSize(btn.dataset.vsize));
  });

  // Search
  tabSearchInput.addEventListener('input', (e) => {
    searchFilter = e.target.value.toLowerCase().trim();
    clearSearchBtn.hidden = searchFilter.length === 0;
    renderTabs();
  });

  clearSearchBtn.addEventListener('click', () => {
    tabSearchInput.value = '';
    searchFilter = '';
    clearSearchBtn.hidden = true;
    tabSearchInput.focus();
    renderTabs();
  });

  // New Tab
  newTabBtn.addEventListener('click', () => chrome.tabs.create({}));

  // Split Window (Side-by-side 50/50 screen)
  const splitWindowBtn = document.getElementById('split-window-btn');
  if (splitWindowBtn) {
    splitWindowBtn.addEventListener('click', async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTab = currentTabs.find(t => t.id !== activeTab?.id);
      await openInDualPaneTab(targetTab || activeTab);
    });
  }

  // Clean Duplicates Button
  cleanDupsBtn.addEventListener('click', () => closeDuplicateTabs());

  // Memory Saver: Sleep Inactive Tabs
  sleepInactiveBtn.addEventListener('click', () => sleepInactiveTabs());

  // Sort Menu
  sortMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortDropdown.hidden = !sortDropdown.hidden;
  });

  sortDropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sortType = item.dataset.sort;
      sortDropdown.hidden = true;
      await sortTabs(sortType);
    });
  });

  // Workspaces Modal
  workspaceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openWorkspacesModal();
  });
  closeModalBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    workspacesModal.hidden = true;
  });
  workspacesModal.addEventListener('click', (e) => {
    if (e.target === workspacesModal) workspacesModal.hidden = true;
  });
  saveCurrentWsBtn.addEventListener('click', () => saveCurrentWorkspace());

  // Global dismiss for menus and peek card
  document.addEventListener('click', () => {
    hideContextMenu();
    sortDropdown.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
      sortDropdown.hidden = true;
      workspacesModal.hidden = true;
      hidePeekCard();
    }
  });

  // Window resize handler for narrow side panel
  window.addEventListener('resize', () => {
    hideContextMenu();
    sortDropdown.hidden = true;
    hidePeekCard();
    if (window.innerWidth < 190 && columns > 2) {
      setColumns(2);
    }
  });

  // Chrome Tabs API events
  chrome.tabs.onCreated.addListener(() => refreshTabs());
  chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabThumbnails[tabId];
    delete tabLastActive[tabId];
    refreshTabs();
  });
  chrome.tabs.onMoved.addListener(() => refreshTabs());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.favIconUrl || changeInfo.audible !== undefined || changeInfo.mutedInfo || changeInfo.discarded !== undefined) {
      refreshTabs();
      captureActiveTabPreview();
    }
  });
  chrome.tabs.onActivated.addListener((activeInfo) => {
    tabLastActive[activeInfo.tabId] = Date.now();
    refreshTabs();
    setTimeout(captureActiveTabPreview, 200);
  });
  chrome.tabs.onAttached.addListener(() => refreshTabs());
  chrome.tabs.onDetached.addListener(() => refreshTabs());

  // Chrome Tab Groups events
  if (chrome.tabGroups) {
    chrome.tabGroups.onCreated.addListener(() => refreshTabs());
    chrome.tabGroups.onUpdated.addListener(() => refreshTabs());
    chrome.tabGroups.onRemoved.addListener(() => refreshTabs());
    chrome.tabGroups.onMoved.addListener(() => refreshTabs());
  }

  // Thumbnail broadcast from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'THUMBNAIL_UPDATED' && msg.tabId && msg.dataUrl) {
      tabThumbnails[msg.tabId] = msg.dataUrl;
      updateSingleTabThumbnail(msg.tabId, msg.dataUrl);
    }
  });

  // Context Menu Setup
  setupContextMenu();
}

function setColumns(newVal) {
  columns = Math.min(6, Math.max(2, newVal));
  chrome.storage.local.set({ tabBoxColumns: columns });
  applyColumnSettings(columns);
}

function applyColumnSettings(val) {
  document.documentElement.style.setProperty('--columns', val);
  colSlider.value = val;
  colDisplay.textContent = val;
}

function setVisualSize(newSize) {
  if (!SIZE_HEIGHT_MAP[newSize]) return;
  visualSize = newSize;
  chrome.storage.local.set({ tabBoxVisualSize: visualSize });
  applyVisualSizeSettings(visualSize);
}

function applyVisualSizeSettings(size) {
  document.documentElement.style.setProperty('--preview-height', SIZE_HEIGHT_MAP[size]);
  sizePillButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vsize === size);
  });
}

function applyVisualModeSettings() {
  if (isVisualMode) {
    document.body.classList.add('visual-mode');
    togglePreviewBtn.classList.add('active');
    visualSizeControl.style.display = 'flex';
  } else {
    document.body.classList.remove('visual-mode');
    togglePreviewBtn.classList.remove('active');
    visualSizeControl.style.display = 'none';
  }
}

// Fetch all tabs and tab groups in target browser window
async function getTargetWindowId() {
  const currentWindow = await chrome.windows.getCurrent();
  if (currentWindow.type === 'normal') return currentWindow.id;
  const normalWins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focusedNormal = normalWins.find(w => w.focused) || normalWins[0];
  return focusedNormal ? focusedNormal.id : currentWindow.id;
}

async function refreshTabs() {
  try {
    const targetWindowId = await getTargetWindowId();
    const tabs = await chrome.tabs.query({ windowId: targetWindowId });
    currentTabs = tabs;

    if (chrome.tabGroups) {
      try {
        currentGroups = await chrome.tabGroups.query({ windowId: targetWindowId });
      } catch (e) {
        currentGroups = [];
      }
    }

    renderTabs();
  } catch (err) {
    console.error('Failed to query tabs/groups:', err);
  }
}

// Update an individual tab's screenshot in DOM
function updateSingleTabThumbnail(tabId, dataUrl) {
  const box = document.querySelector(`.tab-box[data-tab-id="${tabId}"]`);
  if (!box) return;

  const previewArea = box.querySelector('.tab-visual-preview');
  if (previewArea) {
    const existingImg = previewArea.querySelector('.tab-screenshot');
    if (existingImg) {
      existingImg.src = dataUrl;
    } else {
      const mockup = previewArea.querySelector('.preview-mockup');
      if (mockup) mockup.remove();
      const img = document.createElement('img');
      img.className = 'tab-screenshot';
      img.src = dataUrl;
      previewArea.insertBefore(img, previewArea.firstChild);
    }
  }
}

// Find duplicate tabs
function getDuplicateTabsMap() {
  const urlCount = {};
  const duplicateTabIds = new Set();
  let totalDuplicatesCount = 0;

  currentTabs.forEach(tab => {
    if (!tab.url || tab.url.startsWith('chrome://')) return;
    const cleanUrl = tab.url.split('#')[0];
    urlCount[cleanUrl] = (urlCount[cleanUrl] || 0) + 1;
  });

  currentTabs.forEach(tab => {
    if (!tab.url || tab.url.startsWith('chrome://')) return;
    const cleanUrl = tab.url.split('#')[0];
    if (urlCount[cleanUrl] > 1) {
      duplicateTabIds.add(tab.id);
    }
  });

  // Calculate redundant duplicate count
  Object.values(urlCount).forEach(count => {
    if (count > 1) totalDuplicatesCount += (count - 1);
  });

  return { duplicateTabIds, totalDuplicatesCount };
}

// 1-Click Close Duplicate Tabs
async function closeDuplicateTabs() {
  const seenUrls = new Set();
  const tabsToClose = [];

  for (const tab of currentTabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.pinned) continue;
    const cleanUrl = tab.url.split('#')[0];
    if (seenUrls.has(cleanUrl)) {
      tabsToClose.push(tab.id);
    } else {
      seenUrls.add(cleanUrl);
    }
  }

  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose);
    await refreshTabs();
  }
}

// 1-Click Sleep Inactive Tabs (Save RAM)
async function sleepInactiveTabs() {
  let snoozedCount = 0;
  for (const tab of currentTabs) {
    if (!tab.active && !tab.discarded && !tab.pinned && !tab.audible) {
      try {
        await chrome.tabs.discard(tab.id);
        snoozedCount++;
      } catch (e) {
        // Some internal or streaming tabs may be exempt
      }
    }
  }

  const originalText = sleepInactiveBtn.querySelector('span').textContent;
  sleepInactiveBtn.querySelector('span').textContent = `Snoozed ${snoozedCount}!`;
  setTimeout(() => {
    sleepInactiveBtn.querySelector('span').textContent = originalText;
  }, 2000);

  await refreshTabs();
}

// Smart Auto-Sorting
async function sortTabs(sortType) {
  const unpinnedTabs = currentTabs.filter(t => !t.pinned);
  let sortedTabs = [...unpinnedTabs];

  if (sortType === 'domain') {
    sortedTabs.sort((a, b) => {
      const domA = getDomainFromUrl(a.url || '');
      const domB = getDomainFromUrl(b.url || '');
      return domA.localeCompare(domB);
    });
  } else if (sortType === 'title') {
    sortedTabs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sortType === 'recent') {
    sortedTabs.sort((a, b) => (tabLastActive[b.id] || 0) - (tabLastActive[a.id] || 0));
  }

  // Move tabs sequentially
  const pinnedOffset = currentTabs.filter(t => t.pinned).length;
  for (let i = 0; i < sortedTabs.length; i++) {
    try {
      await chrome.tabs.move(sortedTabs[i].id, { index: pinnedOffset + i });
    } catch (e) { }
  }

  await refreshTabs();
}

// Render tabs, tab groups, and pinned section
function renderTabs() {
  const { duplicateTabIds, totalDuplicatesCount } = getDuplicateTabsMap();

  // Update duplicate cleaner button
  if (totalDuplicatesCount > 0) {
    cleanDupsBtn.hidden = false;
    dupsCountText.textContent = `${totalDuplicatesCount} dups`;
  } else {
    cleanDupsBtn.hidden = true;
  }

  // Filter tabs by search
  const filteredTabs = currentTabs.filter(tab => {
    if (!searchFilter) return true;
    const title = (tab.title || '').toLowerCase();
    const url = (tab.url || '').toLowerCase();
    return title.includes(searchFilter) || url.includes(searchFilter);
  });

  const pinnedTabs = filteredTabs.filter(t => t.pinned);
  const normalTabs = filteredTabs.filter(t => !t.pinned);

  // Tab count
  if (searchFilter) {
    tabCountEl.textContent = `${filteredTabs.length} of ${currentTabs.length} tabs`;
  } else {
    tabCountEl.textContent = `${currentTabs.length} ${currentTabs.length === 1 ? 'tab' : 'tabs'}`;
  }

  emptyStateEl.hidden = filteredTabs.length > 0;

  // Render Pinned Section
  if (pinnedTabs.length > 0) {
    pinnedSection.hidden = false;
    pinnedGrid.innerHTML = '';
    pinnedTabs.forEach(tab => pinnedGrid.appendChild(createTabBoxElement(tab, duplicateTabIds)));
  } else {
    pinnedSection.hidden = true;
    pinnedGrid.innerHTML = '';
  }

  // Group tabs by groupId
  const groupMap = {};
  currentGroups.forEach(g => { groupMap[g.id] = g; });

  const groupedTabs = {};
  const ungroupedTabs = [];

  normalTabs.forEach(tab => {
    if (tab.groupId && tab.groupId !== -1 && groupMap[tab.groupId]) {
      if (!groupedTabs[tab.groupId]) groupedTabs[tab.groupId] = [];
      groupedTabs[tab.groupId].push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  });

  // Render Tab Groups
  tabGroupsContainer.innerHTML = '';
  Object.keys(groupedTabs).forEach(groupIdStr => {
    const groupId = parseInt(groupIdStr, 10);
    const group = groupMap[groupId];
    const tabsInGroup = groupedTabs[groupId];

    const groupEl = document.createElement('div');
    groupEl.className = `tab-group-container ${group.collapsed ? 'collapsed' : ''}`;

    const header = document.createElement('div');
    header.className = 'tab-group-header';

    const left = document.createElement('div');
    left.className = 'tab-group-left';

    const pill = document.createElement('div');
    pill.className = `tab-group-pill group-color-${group.color || 'grey'}`;
    pill.textContent = group.title || 'Group';
    left.appendChild(pill);

    const count = document.createElement('span');
    count.className = 'tab-group-count';
    count.textContent = `${tabsInGroup.length} tabs`;
    left.appendChild(count);

    header.appendChild(left);

    const chevron = document.createElement('div');
    chevron.className = 'tab-group-chevron';
    chevron.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    header.appendChild(chevron);

    // Toggle group collapse
    header.addEventListener('click', async () => {
      try {
        await chrome.tabGroups.update(groupId, { collapsed: !group.collapsed });
        await refreshTabs();
      } catch (e) { }
    });

    groupEl.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'boxes-grid tab-group-grid';
    tabsInGroup.forEach(tab => grid.appendChild(createTabBoxElement(tab, duplicateTabIds)));
    groupEl.appendChild(grid);

    tabGroupsContainer.appendChild(groupEl);
  });

  // Render Ungrouped Tabs
  tabsGrid.innerHTML = '';
  ungroupedTabs.forEach(tab => tabsGrid.appendChild(createTabBoxElement(tab, duplicateTabIds)));
}

// Clean Domain extractor
function getDomainFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./, '');
  } catch (e) {
    return 'page';
  }
}

// Create a single Tab Box element
function createTabBoxElement(tab, duplicateTabIds) {
  const box = document.createElement('div');
  box.className = `tab-box ${tab.active ? 'active' : ''} ${tab.discarded ? 'is-discarded' : ''}`;
  box.dataset.tabId = tab.id;
  box.title = `${tab.title || 'New Tab'}\n${tab.url || ''}`;
  box.draggable = true;

  const faviconUrl = tab.favIconUrl && tab.favIconUrl.startsWith('http')
    ? tab.favIconUrl
    : (tab.favIconUrl || DEFAULT_FAVICON_SVG);

  // Duplicate Tab Badge
  if (duplicateTabIds && duplicateTabIds.has(tab.id)) {
    const dupBadge = document.createElement('div');
    dupBadge.className = 'tab-duplicate-badge';
    dupBadge.textContent = '2x';
    dupBadge.title = 'Duplicate tab detected';
    box.appendChild(dupBadge);
  }

  // 1. MINI VISUAL PREVIEW AREA
  const previewArea = document.createElement('div');
  previewArea.className = 'tab-visual-preview';

  const cachedThumbnail = tabThumbnails[tab.id];
  if (cachedThumbnail) {
    const screenshot = document.createElement('img');
    screenshot.className = 'tab-screenshot';
    screenshot.src = cachedThumbnail;
    screenshot.alt = '';
    previewArea.appendChild(screenshot);
  } else {
    const mockup = document.createElement('div');
    mockup.className = 'preview-mockup';

    const mockupBar = document.createElement('div');
    mockupBar.className = 'preview-mockup-bar';
    mockupBar.textContent = getDomainFromUrl(tab.url || '');
    mockup.appendChild(mockupBar);

    const mockupBody = document.createElement('div');
    mockupBody.className = 'preview-mockup-body';
    const mockupIcon = document.createElement('img');
    mockupIcon.className = 'preview-mockup-icon';
    mockupIcon.src = faviconUrl;
    mockupIcon.onerror = () => { mockupIcon.src = DEFAULT_FAVICON_SVG; };
    mockupBody.appendChild(mockupIcon);
    mockup.appendChild(mockupBody);

    previewArea.appendChild(mockup);
  }

  // Favicon badge on preview
  const faviconBadge = document.createElement('div');
  faviconBadge.className = 'tab-favicon-badge';
  const badgeImg = document.createElement('img');
  badgeImg.src = faviconUrl;
  badgeImg.onerror = () => { badgeImg.src = DEFAULT_FAVICON_SVG; };
  faviconBadge.appendChild(badgeImg);
  previewArea.appendChild(faviconBadge);

  box.appendChild(previewArea);

  // 2. STANDALONE FAVICON (Compact Tile Mode)
  const standaloneFavicon = document.createElement('img');
  standaloneFavicon.className = 'tab-favicon-standalone';
  standaloneFavicon.src = faviconUrl;
  standaloneFavicon.onerror = () => { standaloneFavicon.src = DEFAULT_FAVICON_SVG; };
  box.appendChild(standaloneFavicon);

  // 3. TITLE & INFO
  const infoStrip = document.createElement('div');
  infoStrip.className = 'tab-info';
  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || 'New Tab';
  infoStrip.appendChild(title);
  box.appendChild(infoStrip);

  // 4. AUDIO INDICATOR
  if (tab.audible || (tab.mutedInfo && tab.mutedInfo.muted)) {
    const audioIcon = document.createElement('div');
    audioIcon.className = `tab-audio-indicator ${tab.mutedInfo?.muted ? 'is-muted' : ''}`;
    audioIcon.title = tab.mutedInfo?.muted ? 'Tab is muted' : 'Playing audio';
    audioIcon.innerHTML = tab.mutedInfo?.muted ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      </svg>
    ` : `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
    `;
    box.appendChild(audioIcon);
  }

  // 5. SPLIT BUTTON (â—«) & CLOSE BUTTON (x)
  const splitBtn = document.createElement('button');
  splitBtn.className = 'tab-split-btn';
  splitBtn.title = 'Split tab side-by-side (50/50 screen)';
  splitBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"></rect>
      <line x1="12" y1="3" x2="12" y2="21"></line>
    </svg>
  `;
  splitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePeekCard();
    openInDualPaneTab(tab);
  });
  box.appendChild(splitBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close-btn';
  closeBtn.title = 'Close tab';
  closeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePeekCard();
    chrome.tabs.remove(tab.id);
  });
  box.appendChild(closeBtn);

  // Click to activate
  box.addEventListener('click', () => {
    hidePeekCard();
    chrome.tabs.update(tab.id, { active: true });
  });

  // Middle-click to close
  box.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      hidePeekCard();
      chrome.tabs.remove(tab.id);
    }
  });

  // Right-click Context Menu
  box.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    hidePeekCard();
    showContextMenu(e, tab);
  });

  // Hover-to-Enlarge Peek (Magnifier Card)
  box.addEventListener('mouseenter', () => {
    peekTimer = setTimeout(() => showPeekCard(tab, box), 280);
  });

  box.addEventListener('mouseleave', () => {
    clearTimeout(peekTimer);
    hidePeekCard();
  });

  // Drag and drop reordering
  setupDragAndDrop(box, tab);

  return box;
}

// Hover Peek Card Logic
function showPeekCard(tab, targetBox) {
  const rect = targetBox.getBoundingClientRect();
  const cardWidth = 240;
  const cardHeight = 200;

  // Set Content
  const thumbnail = tabThumbnails[tab.id];
  peekImg.src = thumbnail || (tab.favIconUrl || DEFAULT_FAVICON_SVG);
  peekImg.style.objectFit = thumbnail ? 'cover' : 'contain';
  peekFavicon.src = tab.favIconUrl || DEFAULT_FAVICON_SVG;
  peekFavicon.onerror = () => { peekFavicon.src = DEFAULT_FAVICON_SVG; };
  peekTitle.textContent = tab.title || 'New Tab';
  peekUrl.textContent = tab.url || '';

  peekAudio.hidden = !tab.audible;
  peekSleep.hidden = !tab.discarded;

  // Smart Positioning
  let top = rect.top + (rect.height / 2) - (cardHeight / 2);
  let left = rect.right + 10;

  // If overflows right side of viewport, position to the left
  if (left + cardWidth > window.innerWidth) {
    left = Math.max(10, rect.left - cardWidth - 10);
  }

  // If overflows top/bottom
  top = Math.max(10, Math.min(top, window.innerHeight - cardHeight - 10));

  hoverPeekCard.style.top = `${top}px`;
  hoverPeekCard.style.left = `${left}px`;
  hoverPeekCard.hidden = false;
}

function hidePeekCard() {
  if (hoverPeekCard) hoverPeekCard.hidden = true;
}

// Drag & drop handlers
function setupDragAndDrop(element, tab) {
  element.addEventListener('dragstart', (e) => {
    draggedTabId = tab.id;
    element.classList.add('dragging');
    hidePeekCard();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.id.toString());
  });

  element.addEventListener('dragend', () => {
    element.classList.remove('dragging');
    document.querySelectorAll('.tab-box').forEach(el => el.classList.remove('drag-over'));
    draggedTabId = null;
  });

  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTabId && draggedTabId !== tab.id) {
      element.classList.add('drag-over');
    }
  });

  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-over');
  });

  element.addEventListener('drop', async (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');
    const sourceTabId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!sourceTabId || sourceTabId === tab.id) return;

    try {
      await chrome.tabs.move(sourceTabId, { index: tab.index });
      await refreshTabs();
    } catch (err) {
      console.error('Failed to move tab:', err);
    }
  });
}

// Workspaces Session Snapshot Manager
async function openWorkspacesModal() {
  workspacesModal.hidden = false;
  newWorkspaceName.value = '';
  await renderWorkspacesList();
}

async function renderWorkspacesList() {
  const data = await chrome.storage.local.get(['tabBoxWorkspaces']);
  const workspaces = data.tabBoxWorkspaces || [];

  workspacesList.innerHTML = '';
  if (workspaces.length === 0) {
    workspacesList.innerHTML = '<div class="ws-empty">No saved workspaces yet.</div>';
    return;
  }

  workspaces.forEach((ws, index) => {
    const item = document.createElement('div');
    item.className = 'ws-item';

    const info = document.createElement('div');
    info.className = 'ws-info';
    const name = document.createElement('div');
    name.className = 'ws-name';
    name.textContent = ws.name;
    const meta = document.createElement('div');
    meta.className = 'ws-meta';
    meta.textContent = `${ws.tabs.length} tabs â€¢ ${new Date(ws.createdAt).toLocaleDateString()}`;
    info.appendChild(name);
    info.appendChild(meta);
    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'ws-actions';

    const openBtn = document.createElement('button');
    openBtn.className = 'ws-open-btn';
    openBtn.textContent = 'Restore';
    openBtn.addEventListener('click', async () => {
      workspacesModal.hidden = true;
      for (const t of ws.tabs) {
        await chrome.tabs.create({ url: t.url, pinned: t.pinned || false });
      }
    });
    actions.appendChild(openBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'ws-del-btn';
    delBtn.textContent = 'âœ•';
    delBtn.title = 'Delete workspace';
    delBtn.addEventListener('click', async () => {
      workspaces.splice(index, 1);
      await chrome.storage.local.set({ tabBoxWorkspaces: workspaces });
      renderWorkspacesList();
    });
    actions.appendChild(delBtn);

    item.appendChild(actions);
    workspacesList.appendChild(item);
  });

  if (!proStatus.isPro && workspaces.length >= 1) {
    const limitNote = document.createElement('div');
    limitNote.style.cssText = 'padding: 6px; font-size: 9.5px; color: #818cf8; text-align: center; cursor: pointer; border: 1px dashed rgba(99, 102, 241, 0.4); border-radius: 6px; margin-top: 6px;';
    limitNote.textContent = '🔒 Free tier: 1/1 workspace used. Unlock unlimited with Pro ($10 Lifetime)';
    limitNote.addEventListener('click', () => {
      workspacesModal.hidden = true;
      openPaywallModal('workspaces');
    });
    workspacesList.appendChild(limitNote);
  }
}

async function saveCurrentWorkspace() {
  const name = newWorkspaceName.value.trim() || `Workspace ${new Date().toLocaleDateString()}`;
  const validTabs = currentTabs
    .filter(t => t.url && !t.url.startsWith('chrome://'))
    .map(t => ({ title: t.title, url: t.url, pinned: t.pinned }));

  if (validTabs.length === 0) return;

  const data = await chrome.storage.local.get(['tabBoxWorkspaces']);
  const workspaces = data.tabBoxWorkspaces || [];

  // Gating: Free tier allows 1 workspace; Pro tier allows unlimited
  if (!proStatus.isPro && workspaces.length >= 1) {
    workspacesModal.hidden = true;
    openPaywallModal('workspaces');
    return;
  }
  workspaces.unshift({
    id: Date.now(),
    name: name,
    createdAt: Date.now(),
    tabs: validTabs
  });

  await chrome.storage.local.set({ tabBoxWorkspaces: workspaces });
  newWorkspaceName.value = '';
  await renderWorkspacesList();
}

// Right-Click Context Menu Logic
function setupContextMenu() {
  contextMenu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const tab = contextTab;
      hideContextMenu();

      if (!tab) return;

      try {
        switch (action) {
          case 'split':
            await openNativeSplitTab(tab);
            break;
          case 'split-view':
            await openInDualPaneTab(tab);
            break;
          case 'pin':
            await chrome.tabs.update(tab.id, { pinned: !tab.pinned });
            break;
          case 'mute':
            await chrome.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted });
            break;
          case 'duplicate':
            await chrome.tabs.duplicate(tab.id);
            break;
          case 'sleep':
            await chrome.tabs.discard(tab.id);
            break;
          case 'new-window':
            await chrome.windows.create({ tabId: tab.id, focused: true });
            break;
          case 'close-others': {
            const others = currentTabs.filter(t => t.id !== tab.id).map(t => t.id);
            if (others.length > 0) await chrome.tabs.remove(others);
            break;
          }
          case 'close':
            await chrome.tabs.remove(tab.id);
            break;
        }
      } catch (err) {
        console.error(`Error performing context action '${action}':`, err);
      }
    });
  });
}

function showContextMenu(e, tab) {
  contextTab = tab;
  ctxPinText.textContent = tab.pinned ? 'Unpin Tab' : 'Pin Tab';
  ctxMuteText.textContent = tab.mutedInfo?.muted ? 'Unmute Tab' : 'Mute Tab';

  contextMenu.hidden = false;
  const menuWidth = 205;
  const menuHeight = 280;

  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) x = Math.max(5, window.innerWidth - menuWidth - 8);
  if (y + menuHeight > window.innerHeight) y = Math.max(5, window.innerHeight - menuHeight - 8);

  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

function hideContextMenu() {
  if (contextMenu) contextMenu.hidden = true;
  contextTab = null;
}

// Split Tab Side-by-Side: robust 50/50 dual windows on screen
async function splitTabSideBySide(targetTab) {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const activeTabs = await chrome.tabs.query({ active: true, windowId: currentWindow.id });
    const currentActiveTab = activeTabs[0];

    // Determine target tab to move
    let tabToMove = targetTab;
    if (!tabToMove) {
      tabToMove = currentTabs.find(t => t.id !== currentActiveTab?.id) || currentActiveTab;
    }

    // Get screen metrics safely
    let availWidth = window.screen.availWidth || 1920;
    let availHeight = window.screen.availHeight || 1080;
    let availLeft = window.screen.availLeft !== undefined ? window.screen.availLeft : 0;
    let availTop = window.screen.availTop !== undefined ? window.screen.availTop : 0;

    const halfWidth = Math.floor(availWidth / 2);

    // CRITICAL ON WINDOWS: Un-maximize first, otherwise Chrome ignores width/height
    if (currentWindow.state === 'maximized' || currentWindow.state === 'fullscreen') {
      await chrome.windows.update(currentWindow.id, { state: 'normal' });
    }

    // Move current window to LEFT half
    await chrome.windows.update(currentWindow.id, {
      left: availLeft,
      top: availTop,
      width: halfWidth,
      height: availHeight,
      state: 'normal'
    });

    if (currentTabs.length <= 1) {
      // If only 1 tab exists, create new window with new tab on right half
      await chrome.windows.create({
        url: 'chrome://newtab',
        left: availLeft + halfWidth,
        top: availTop,
        width: halfWidth,
        height: availHeight,
        focused: true
      });
    } else {
      // If moving the current active tab, switch left window to another tab first
      if (tabToMove.id === currentActiveTab?.id) {
        const otherTab = currentTabs.find(t => t.id !== tabToMove.id);
        if (otherTab) {
          await chrome.tabs.update(otherTab.id, { active: true });
        }
      }

      // Create RIGHT window with the target tab
      await chrome.windows.create({
        tabId: tabToMove.id,
        left: availLeft + halfWidth,
        top: availTop,
        width: halfWidth,
        height: availHeight,
        focused: true
      });
    }
  } catch (err) {
    console.error('Failed to split tab side-by-side:', err);
  }
}

// In-Tab Dual Pane Split View
async function openInDualPaneTab(targetTab) {
  try {
    const targetWinId = await getTargetWindowId();
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: targetWinId });

    let leftUrl = activeTab?.url || 'https://google.com';
    let rightUrl = targetTab?.url || 'https://google.com';

    if (leftUrl.startsWith('chrome://')) leftUrl = 'https://en.wikipedia.org';
    if (rightUrl.startsWith('chrome://')) rightUrl = 'https://news.ycombinator.com';

    const splitPageUrl = chrome.runtime.getURL(`splitview.html?left=${encodeURIComponent(leftUrl)}&right=${encodeURIComponent(rightUrl)}`);
    await chrome.tabs.create({ windowId: targetWinId, url: splitPageUrl });
  } catch (err) {
    console.error('Failed to open dual pane split tab:', err);
  }
}

// Native Chrome Split Tab (same window)
async function openNativeSplitTab(targetTab) {
  try {
    const targetWinId = await getTargetWindowId();
    chrome.runtime.sendMessage({
      action: 'SPLIT_TAB',
      tabId: targetTab ? targetTab.id : undefined,
      windowId: targetWinId
    }).catch(() => {});
  } catch (err) {
    console.error('Native split tab error:', err);
  }
}
