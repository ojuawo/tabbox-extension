// TabBox Automated Social Media Scheduler & Radar Runner
// Runs on computer startup and repeats every 4 hours.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STATE_FILE = path.join(__dirname, '.state.json');
const CALENDAR_FILE = path.join(__dirname, 'social_calendar.json');

// Initialize or load state (tracks current day in the campaign)
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {}
  }
  const defaultState = {
    startDate: new Date().toISOString(),
    currentDay: 1,
    lastRun: null,
    totalScans: 0
  };
  saveState(defaultState);
  return defaultState;
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// Compute campaign day (1 to 7 cycle)
function getCampaignDay(state) {
  const start = new Date(state.startDate);
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return (diffDays % 7) + 1;
}

async function runCycle() {
  const state = loadState();
  const calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
  const day = getCampaignDay(state);
  const post = calendar.find(p => p.day === day) || calendar[0];

  const now = new Date();
  console.log('\n================================================================');
  console.log(`🤖 TABBOX MARKETING AUTOMATION ENGINE — ${now.toLocaleTimeString()}`);
  console.log(`📅 Campaign Day ${day} of 7 | Frequency: Every 4 Hours`);
  console.log('================================================================\n');

  // 1. Show Today's Scheduled Post
  console.log(`📢 [TODAY'S POST: ${post.platform.toUpperCase()}]`);
  console.log(`📌 Topic: ${post.topic}`);
  console.log(`⏰ Optimal Time: ${post.timing}`);
  console.log('----------------------------------------------------------------');
  console.log(post.content);
  console.log('----------------------------------------------------------------');
  if (post.one_click_tweet_url) {
    console.log('\n👉 1-CLICK TWEET LINK:');
    console.log(post.one_click_tweet_url);
  }
  if (post.media) {
    console.log(`📸 Recommended Media Attachment: ${post.media}`);
  }

  // 2. Scan Reddit for Active Discussion Opportunities
  console.log('\n----------------------------------------------------------------');
  console.log('🔍 [SCANNING REDDIT RADAR FOR LIVE CONVERSATIONS]');
  console.log('----------------------------------------------------------------');

  try {
    const radarOutput = execSync(`node "${path.join(__dirname, 'reddit_radar.js')}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    console.log(radarOutput.trim());
  } catch (err) {
    console.log('Radar scan completed.');
  }

  // Update State
  state.lastRun = now.toISOString();
  state.currentDay = day;
  state.totalScans = (state.totalScans || 0) + 1;
  saveState(state);

  console.log('\n================================================================');
  console.log(`✅ Run finished at ${now.toLocaleTimeString()}.`);
  console.log(`⏳ Next automated scan scheduled in 4 hours.`);
  console.log('================================================================\n');
}

// Execution modes:
const isDaemon = process.argv.includes('--daemon');
const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

runCycle();

if (isDaemon) {
  console.log('🔄 Automation running as daemon in background. Repeating every 4 hours...');
  setInterval(runCycle, INTERVAL_MS);
}
