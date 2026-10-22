// TabBox Dual-Pane Split View Controller (splitview.js)
const params = new URLSearchParams(window.location.search);
let leftUrl = params.get('left') || 'https://en.wikipedia.org';
let rightUrl = params.get('right') || 'https://news.ycombinator.com';

const frameLeft = document.getElementById('frame-left');
const frameRight = document.getElementById('frame-right');
const inputLeft = document.getElementById('url-left');
const inputRight = document.getElementById('url-right');

const paneLeft = document.getElementById('pane-left');
const container = document.getElementById('pane-container');
const divider = document.getElementById('drag-divider');
const shield = document.getElementById('drag-shield');

function loadUrls() {
  if (inputLeft) inputLeft.value = leftUrl;
  if (inputRight) inputRight.value = rightUrl;
  if (frameLeft) frameLeft.src = leftUrl;
  if (frameRight) frameRight.src = rightUrl;
}
loadUrls();

if (inputLeft) {
  inputLeft.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let u = inputLeft.value.trim();
      if (!u.startsWith('http')) u = 'https://' + u;
      leftUrl = u;
      if (frameLeft) frameLeft.src = u;
    }
  });
}

if (inputRight) {
  inputRight.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let u = inputRight.value.trim();
      if (!u.startsWith('http')) u = 'https://' + u;
      rightUrl = u;
      if (frameRight) frameRight.src = u;
    }
  });
}

// Draggable Divider
let isDragging = false;

if (divider) {
  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    divider.classList.add('is-dragging');
    if (shield) shield.classList.add('active');
  });
}

window.addEventListener('mousemove', (e) => {
  if (!isDragging || !container || !paneLeft) return;
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  let percent = (x / rect.width) * 100;
  percent = Math.max(15, Math.min(85, percent));
  paneLeft.style.width = percent + '%';
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    if (divider) divider.classList.remove('is-dragging');
    if (shield) shield.classList.remove('active');
  }
});

// Ratio Presets
document.querySelectorAll('.ratio-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const r = btn.dataset.ratio;
    if (paneLeft) paneLeft.style.width = r + '%';
  });
});

// Swap Panes
const swapBtn = document.getElementById('swap-btn');
if (swapBtn) {
  swapBtn.addEventListener('click', () => {
    const temp = leftUrl;
    leftUrl = rightUrl;
    rightUrl = temp;
    loadUrls();
  });
}

// Tile Windows
const tileBtn = document.getElementById('tile-windows-btn');
if (tileBtn) {
  tileBtn.addEventListener('click', async () => {
    if (chrome && chrome.windows) {
      const availWidth = window.screen.availWidth || 1920;
      const availHeight = window.screen.availHeight || 1080;
      const halfWidth = Math.floor(availWidth / 2);
      await chrome.windows.create({ url: leftUrl, left: 0, top: 0, width: halfWidth, height: availHeight });
      await chrome.windows.create({ url: rightUrl, left: halfWidth, top: 0, width: halfWidth, height: availHeight });
    }
  });
}
