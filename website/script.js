// TabBox Multi-Mode Interactive Simulator & Landing Page Logic

const sampleTabs = [
  { id: 1, title: 'GitHub — Where the world builds software', url: 'https://github.com', domain: 'github.com', icon: 'https://github.githubassets.com/favicons/favicon.svg', active: true },
  { id: 2, title: 'YouTube — Watch & Share Videos', url: 'https://youtube.com', domain: 'youtube.com', icon: 'https://www.youtube.com/s/desktop/f1725585/img/favicon.ico', active: false },
  { id: 3, title: 'Google Docs — Product Roadmap 2026', url: 'https://docs.google.com', domain: 'docs.google.com', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico', active: false },
  { id: 4, title: 'Figma — Design Systems & UI', url: 'https://figma.com', domain: 'figma.com', icon: 'https://static.figma.com/app/icon/1/favicon.svg', active: false },
  { id: 5, title: 'ChatGPT — AI Assistant & Code Review', url: 'https://chatgpt.com', domain: 'chatgpt.com', icon: 'https://cdn.oaistatic.com/_next/static/media/favicon-32x32.630a2b99.png', active: false },
  { id: 6, title: 'Reddit — The front page of the internet', url: 'https://reddit.com', domain: 'reddit.com', icon: 'https://www.redditstatic.com/shreddit/assets/favicon/192x192.png', active: false },
  { id: 7, title: 'Notion — Connected Workspace', url: 'https://notion.so', domain: 'notion.so', icon: 'https://www.notion.so/images/favicon.ico', active: false },
  { id: 8, title: 'X / Twitter — What is happening right now', url: 'https://x.com', domain: 'x.com', icon: 'https://abs.twimg.com/favicons/twitter.3.ico', active: false }
];

let activeSimMode = 'inpage-rail';
let isRailCollapsed = false;
let isBubbleMode = false;
let isFlyoutOpen = false;
let isDockedSnapped = false;
let sideColumns = 3;

document.addEventListener('DOMContentLoaded', () => {
  initModeSwitcher();
  initMode1RailAndBubble();
  initMode2DockedWindow();
  initMode3CommandModal();
  initMode4SidePanel();
  initFaqAccordion();
});

// ============================================================
// MODE SWITCHER ENGINE
// ============================================================
function initModeSwitcher() {
  const modeTabs = document.querySelectorAll('.sim-mode-tab');
  const views = document.querySelectorAll('.sim-view');
  const indicator = document.getElementById('sim-mode-indicator');
  const addressUrl = document.getElementById('sim-url-text');

  const modeDescriptions = {
    'inpage-rail': { label: 'Mode 1: In-Page Rail & Chat Bubble (PRO)', url: 'https://github.com/developer/tabbox' },
    'docked-window': { label: 'Mode 2: Synchronized Docked Window (PRO)', url: 'https://github.com/developer/tabbox' },
    'command-grid': { label: 'Mode 3: Command Palette Overlay (PRO)', url: 'https://github.com/developer/tabbox' },
    'sidepanel': { label: 'Mode 4: Chrome Native Side Panel (FREE)', url: 'chrome://side-panel/tabbox' }
  };

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetMode = tab.dataset.simMode;
      activeSimMode = targetMode;

      modeTabs.forEach(t => t.classList.toggle('active', t === tab));
      views.forEach(v => v.classList.toggle('active', v.id === `view-${targetMode}`));

      if (modeDescriptions[targetMode]) {
        indicator.textContent = modeDescriptions[targetMode].label;
        addressUrl.textContent = modeDescriptions[targetMode].url;
      }
    });
  });
}

// ============================================================
// MODE 1: IN-PAGE RAIL & FLOATING CHAT BUBBLE
// ============================================================
function initMode1RailAndBubble() {
  const railTabList = document.getElementById('sim-rail-tab-list');
  const collapseBtn = document.getElementById('sim-rail-collapse');
  const bubbleToggleBtn = document.getElementById('sim-rail-bubble-toggle');
  const rail = document.getElementById('sim-rail');
  const bubble = document.getElementById('sim-chat-bubble');
  const flyout = document.getElementById('sim-bubble-flyout');
  const flyoutClose = document.getElementById('sim-flyout-close');
  const flyoutTabList = document.getElementById('sim-flyout-tab-list');
  const railSearch = document.getElementById('sim-rail-search');

  function renderRailTabs(filter = '') {
    railTabList.innerHTML = '';
    const filtered = sampleTabs.filter(t => !filter || t.title.toLowerCase().includes(filter));
    filtered.forEach(tab => {
      const box = document.createElement('div');
      box.className = `sim-box ${tab.active ? 'active' : ''}`;
      box.title = tab.title;
      box.innerHTML = `
        <img src="${tab.icon}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/></svg>'" />
        <span class="sim-tab-title">${tab.title}</span>
      `;
      box.addEventListener('click', () => {
        sampleTabs.forEach(t => t.active = (t.id === tab.id));
        renderRailTabs(filter);
        renderFlyoutTabs();
      });
      railTabList.appendChild(box);
    });
  }

  function renderFlyoutTabs() {
    flyoutTabList.innerHTML = '';
    sampleTabs.forEach(tab => {
      const box = document.createElement('div');
      box.className = `sim-box ${tab.active ? 'active' : ''}`;
      box.innerHTML = `
        <img src="${tab.icon}" />
        <span class="sim-tab-title">${tab.title}</span>
      `;
      box.addEventListener('click', () => {
        sampleTabs.forEach(t => t.active = (t.id === tab.id));
        renderRailTabs();
        renderFlyoutTabs();
        flyout.style.display = 'none';
        isFlyoutOpen = false;
      });
      flyoutTabList.appendChild(box);
    });
  }

  renderRailTabs();
  renderFlyoutTabs();

  // 56px Collapse Toggle
  collapseBtn.addEventListener('click', () => {
    isRailCollapsed = !isRailCollapsed;
    rail.classList.toggle('collapsed', isRailCollapsed);
    collapseBtn.textContent = isRailCollapsed ? '◫' : '☰';
  });

  // Toggle between Pinned Rail Strip and Floating Chat Bubble
  bubbleToggleBtn.addEventListener('click', () => {
    isBubbleMode = !isBubbleMode;
    if (isBubbleMode) {
      rail.style.display = 'none';
      bubble.style.display = 'flex';
      bubbleToggleBtn.title = 'Switch to Pinned Rail Strip';
    } else {
      rail.style.display = 'flex';
      bubble.style.display = 'none';
      flyout.style.display = 'none';
      isFlyoutOpen = false;
      bubbleToggleBtn.title = 'Switch to Floating Chat Bubble';
    }
  });

  // Chat Bubble hover & click interactions
  let hoverTimer = null;
  bubble.addEventListener('mouseenter', () => {
    hoverTimer = setTimeout(() => {
      flyout.style.display = 'flex';
      isFlyoutOpen = true;
    }, 150);
  });
  bubble.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
  });

  bubble.addEventListener('click', () => {
    isFlyoutOpen = !isFlyoutOpen;
    flyout.style.display = isFlyoutOpen ? 'flex' : 'none';
  });

  flyoutClose.addEventListener('click', (e) => {
    e.stopPropagation();
    flyout.style.display = 'none';
    isFlyoutOpen = false;
  });

  railSearch.addEventListener('input', (e) => {
    renderRailTabs(e.target.value.toLowerCase().trim());
  });
}

// ============================================================
// MODE 2: DOCKED COMPANION WINDOW
// ============================================================
function initMode2DockedWindow() {
  const dockTabList = document.getElementById('sim-dock-tab-list');
  const resizeBtn = document.getElementById('sim-dock-resize-btn');
  const dockWindow = document.querySelector('.sim-dock-window');

  function renderDockTabs() {
    dockTabList.innerHTML = '';
    sampleTabs.forEach(tab => {
      const box = document.createElement('div');
      box.className = `sim-box ${tab.active ? 'active' : ''}`;
      box.innerHTML = `
        <img src="${tab.icon}" />
        <span class="sim-tab-title">${tab.title}</span>
      `;
      box.addEventListener('click', () => {
        sampleTabs.forEach(t => t.active = (t.id === tab.id));
        renderDockTabs();
      });
      dockTabList.appendChild(box);
    });
  }

  renderDockTabs();

  resizeBtn.addEventListener('click', () => {
    isDockedSnapped = !isDockedSnapped;
    dockWindow.style.width = isDockedSnapped ? '120px' : '180px';
    resizeBtn.textContent = isDockedSnapped ? 'Expand' : '⇄ Snap';
  });
}

// ============================================================
// MODE 3: COMMAND PALETTE BENTO MODAL (Alt+B)
// ============================================================
function initMode3CommandModal() {
  const openModalBtn = document.getElementById('sim-open-modal-btn');
  const modalOverlay = document.getElementById('sim-modal-overlay');
  const modalClose = document.getElementById('sim-modal-close');
  const modalSearch = document.getElementById('sim-modal-search');
  const modalTabList = document.getElementById('sim-modal-tab-list');

  function renderModalTabs(filter = '') {
    modalTabList.innerHTML = '';
    const filtered = sampleTabs.filter(t => !filter || t.title.toLowerCase().includes(filter));
    filtered.forEach((tab, idx) => {
      const card = document.createElement('div');
      card.className = `sim-modal-card-tab ${idx === 0 ? 'selected' : ''}`;
      card.innerHTML = `
        <img src="${tab.icon}" />
        <span>${tab.title}</span>
      `;
      card.addEventListener('click', () => {
        sampleTabs.forEach(t => t.active = (t.id === tab.id));
        modalOverlay.style.display = 'none';
      });
      modalTabList.appendChild(card);
    });
  }

  renderModalTabs();

  openModalBtn.addEventListener('click', () => {
    modalOverlay.style.display = 'flex';
    modalSearch.value = '';
    renderModalTabs();
    setTimeout(() => modalSearch.focus(), 50);
  });

  modalClose.addEventListener('click', () => {
    modalOverlay.style.display = 'none';
  });

  modalSearch.addEventListener('input', (e) => {
    renderModalTabs(e.target.value.toLowerCase().trim());
  });

  // Global key listener on document for Alt+B
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      const currentView = document.getElementById('view-command-grid');
      if (currentView && currentView.classList.contains('active')) {
        const isShown = modalOverlay.style.display === 'flex';
        modalOverlay.style.display = isShown ? 'none' : 'flex';
        if (!isShown) {
          modalSearch.value = '';
          renderModalTabs();
          setTimeout(() => modalSearch.focus(), 50);
        }
      }
    } else if (e.key === 'Escape' && modalOverlay.style.display === 'flex') {
      modalOverlay.style.display = 'none';
    }
  });
}

// ============================================================
// MODE 4: CHROME NATIVE SIDE PANEL (FREE)
// ============================================================
function initMode4SidePanel() {
  const colSlider = document.getElementById('sim-side-cols');
  const colBadge = document.getElementById('sim-side-col-badge');
  const sideTabList = document.getElementById('sim-panel-tab-list');
  const sleepBtn = document.getElementById('sim-side-sleep');

  function renderSidePanelGrid() {
    sideTabList.innerHTML = '';
    sideTabList.style.gridTemplateColumns = `repeat(${sideColumns}, 1fr)`;

    sampleTabs.forEach(tab => {
      const box = document.createElement('div');
      box.className = `sim-panel-box ${tab.active ? 'active' : ''}`;
      box.title = tab.title;
      box.innerHTML = `
        <img src="${tab.icon}" />
        <span>${tab.title}</span>
      `;
      box.addEventListener('click', () => {
        sampleTabs.forEach(t => t.active = (t.id === tab.id));
        renderSidePanelGrid();
      });
      sideTabList.appendChild(box);
    });
  }

  renderSidePanelGrid();

  colSlider.addEventListener('input', (e) => {
    sideColumns = parseInt(e.target.value, 10);
    colBadge.textContent = sideColumns;
    renderSidePanelGrid();
  });

  sleepBtn.addEventListener('click', () => {
    const orig = sleepBtn.textContent;
    sleepBtn.textContent = '💤 7 Tabs Asleep!';
    setTimeout(() => { sleepBtn.textContent = orig; }, 2000);
  });
}

// ============================================================
// FAQ ACCORDION
// ============================================================
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      faqItems.forEach(i => i.classList.remove('open'));
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });
}
