// Standalone Full-Viewport Bento Grid Controller (grid.js)

const DEFAULT_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
)}`;

let state = {
  tabs: [],
  thumbnails: {},
  activeMode: 'command-grid'
};
let searchQuery = '';
let draggedTabId = null;

const searchInput = document.getElementById('grid-search');
const tabCounter = document.getElementById('tab-counter');
const pinnedWrap = document.getElementById('pinned-wrap');
const pinnedBento = document.getElementById('pinned-bento');
const mainBento = document.getElementById('main-bento');

const port = chrome.runtime.connect({ name: 'tabbox-bus' });

port.onMessage.addListener((msg) => {
  if (msg.action === 'INIT_STATE' || msg.action === 'TABS_UPDATED') {
    state = { ...state, ...msg };
    renderBento();
  } else if (msg.action === 'MODE_CHANGED') {
    state.activeMode = msg.mode;
    updateModeButtons();
  } else if (msg.action === 'THUMBNAIL_UPDATED' && msg.tabId && msg.dataUrl) {
    state.thumbnails[msg.tabId] = msg.dataUrl;
    renderBento();
  }
});

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase().trim();
  renderBento();
});

document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode !== 'sidepanel' && state.proStatus && !state.proStatus.isPro) {
      port.postMessage({ action: 'OPEN_PAYWALL', requestedMode: mode });
      return;
    }
    port.postMessage({ action: 'SET_MODE', mode });
  });
});

function updateModeButtons() {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === state.activeMode);
  });
}

function renderBento() {
  updateModeButtons();

  const filtered = state.tabs.filter((t) => {
    if (!searchQuery) return true;
    return (
      (t.title || '').toLowerCase().includes(searchQuery) ||
      (t.url || '').toLowerCase().includes(searchQuery)
    );
  });

  tabCounter.textContent = `${filtered.length} tabs`;

  const pinned = filtered.filter(t => t.pinned);
  const normal = filtered.filter(t => !t.pinned);

  if (pinned.length > 0) {
    pinnedWrap.hidden = false;
    pinnedBento.innerHTML = '';
    pinned.forEach(t => pinnedBento.appendChild(createCard(t)));
  } else {
    pinnedWrap.hidden = true;
    pinnedBento.innerHTML = '';
  }

  mainBento.innerHTML = '';
  normal.forEach(t => mainBento.appendChild(createCard(t)));
}

function createCard(tab) {
  const card = document.createElement('div');
  card.className = `bento-card ${tab.active ? 'active' : ''}`;
  card.draggable = true;
  card.title = `${tab.title || 'Tab'}\n${tab.url || ''}`;

  const thumb = document.createElement('div');
  thumb.className = 'bento-thumb';
  const shot = state.thumbnails[tab.id];
  const favUrl = tab.favIconUrl && tab.favIconUrl.startsWith('http') ? tab.favIconUrl : (tab.favIconUrl || DEFAULT_FAVICON);

  if (shot) {
    const img = document.createElement('img');
    img.className = 'shot';
    img.src = shot;
    thumb.appendChild(img);
  } else {
    const wireframe = document.createElement('div');
    wireframe.className = 'bento-wireframe';
    const line1 = document.createElement('div');
    line1.className = 'wf-line wf-header';
    const line2 = document.createElement('div');
    line2.className = 'wf-line wf-body';
    wireframe.appendChild(line1);
    wireframe.appendChild(line2);
    thumb.appendChild(wireframe);
  }

  const actions = document.createElement('div');
  actions.className = 'bento-actions';

  const splitBtn = document.createElement('button');
  splitBtn.className = 'act-btn';
  splitBtn.textContent = '◫';
  splitBtn.title = 'Native Split Tab';
  splitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    port.postMessage({ action: 'SPLIT_TAB', tabId: tab.id });
  });
  actions.appendChild(splitBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'act-btn close';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close Tab';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    port.postMessage({ action: 'CLOSE_TAB', tabId: tab.id });
  });
  actions.appendChild(closeBtn);

  thumb.appendChild(actions);
  card.appendChild(thumb);

  const info = document.createElement('div');
  info.className = 'bento-info';
  const tSpan = document.createElement('span');
  tSpan.textContent = tab.title || 'New Tab';
  info.appendChild(tSpan);
  card.appendChild(info);

  card.addEventListener('click', () => {
    port.postMessage({ action: 'SWITCH_TAB', tabId: tab.id });
  });

  card.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      port.postMessage({ action: 'CLOSE_TAB', tabId: tab.id });
    }
  });

  card.addEventListener('dragstart', () => { draggedTabId = tab.id; });
  card.addEventListener('dragover', (e) => e.preventDefault());
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    if (draggedTabId !== null && draggedTabId !== tab.id) {
      port.postMessage({ action: 'REORDER_TAB', tabId: draggedTabId, index: tab.index });
    }
    draggedTabId = null;
  });

  return card;
}
