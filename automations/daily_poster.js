// TabBox Daily Poster & Social Media Queue Runner
// Run manually: `node automations/daily_poster.js` (prints today's post + 1-click share link)
// Run with specific day: `node automations/daily_poster.js 3`
// Optional: set WEBHOOK_URL=https://discord.com/api/webhooks/... to auto-dispatch!

const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, 'social_calendar.json');
const calendar = JSON.parse(fs.readFileSync(calendarPath, 'utf8'));

// Determine day to post
const requestedDay = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
const post = calendar.find(p => p.day === requestedDay) || calendar[0];

console.log('====================================================');
console.log(`🚀 [TabBox Auto-Poster] Queue for Day ${post.day} (${post.platform})`);
console.log(`⏰ Optimal Timing: ${post.timing}`);
console.log(`📌 Topic: ${post.topic}`);
console.log('====================================================\n');
console.log('📝 DRAFT CONTENT TO POST:');
console.log('----------------------------------------------------');
console.log(post.content);
console.log('----------------------------------------------------\n');

if (post.one_click_tweet_url) {
  console.log('🔗 1-CLICK TWITTER/X POST LINK (Click to tweet instantly):');
  console.log(post.one_click_tweet_url);
  console.log('');
}

if (post.media) {
  console.log(`📸 Recommended Media: ${post.media}\n`);
}

// Webhook Dispatch (Discord, Slack, Make.com, Buffer)
const webhookUrl = process.env.WEBHOOK_URL;
if (webhookUrl) {
  console.log(`📡 Dispatching to webhook: ${webhookUrl.slice(0, 30)}...`);
  const payload = {
    content: `**🚀 [TabBox Scheduled Post — Day ${post.day} (${post.platform})]**\n\n${post.content}\n\n${post.one_click_tweet_url ? '👉 Tweet link: ' + post.one_click_tweet_url : ''}`
  };

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => {
      if (r.ok) console.log('✅ Successfully posted to webhook!');
      else console.error('❌ Webhook responded with error:', r.status);
    })
    .catch(err => console.error('❌ Webhook error:', err.message));
} else {
  console.log('💡 Tip: Set environment variable WEBHOOK_URL to automatically broadcast this to Discord, Slack, or Make.com!');
}
