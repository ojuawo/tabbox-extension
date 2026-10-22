// TabBox Reddit Radar — Automatic Keyword Scanner for Active Discussions
// Scans r/chrome, r/productivity, and r/browsers for organic reply opportunities without needing an API key.

const SUBREDDITS = ['chrome', 'productivity', 'browsers'];
const KEYWORDS = [
  'side panel',
  'vertical tab',
  'too wide',
  '320px',
  'tab manager',
  'tabs memory',
  'tab hoard',
  'arc browser',
  'workona',
  'one tab'
];

async function fetchSubredditRss(sub) {
  const url = `https://www.reddit.com/r/${sub}/new/.rss`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TabBoxRadar/1.0 by developer (Automated opportunity scanner)'
      }
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssEntries(xml, sub);
  } catch (err) {
    console.error(`Failed to scan r/${sub}:`, err.message);
    return [];
  }
}

function parseRssEntries(xml, sub) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link href="([^"]+)"/);
    const authorMatch = block.match(/<author>[\s\S]*?<name>([^<]+)<\/name>/);
    const updatedMatch = block.match(/<updated>([^<]+)<\/updated>/);

    const title = titleMatch ? decodeHtml(titleMatch[1]) : '';
    const link = linkMatch ? linkMatch[1] : '';
    const author = authorMatch ? authorMatch[1] : '';
    const updated = updatedMatch ? updatedMatch[1] : '';

    if (title && link) {
      entries.push({ subreddit: `r/${sub}`, title, link, author, updated });
    }
  }
  return entries;
}

function decodeHtml(html) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function runRadar() {
  console.log('🔍 [TabBox Radar] Scanning Reddit for discussions...');
  console.log(`📡 Monitoring: ${SUBREDDITS.map(s => 'r/' + s).join(', ')}`);
  console.log(`🎯 Keywords: ${KEYWORDS.slice(0, 5).join(', ')}, etc.\n`);

  let totalMatches = 0;

  for (const sub of SUBREDDITS) {
    const posts = await fetchSubredditRss(sub);
    const matched = posts.filter(post => {
      const lower = post.title.toLowerCase();
      return KEYWORDS.some(kw => lower.includes(kw));
    });

    if (matched.length > 0) {
      console.log(`\n==============================`);
      console.log(`📢 MATCHES IN r/${sub} (${matched.length})`);
      console.log(`==============================`);
      matched.forEach((m, idx) => {
        totalMatches++;
        console.log(`\n#${idx + 1}: ${m.title}`);
        console.log(`🔗 Link: ${m.link}`);
        console.log(`👤 Author: ${m.author} | Updated: ${m.updated}`);
        console.log(`💡 Suggested Pitch: "If you're frustrated by Chrome's 320px width floor, check out TabBox (https://tabbox.dev) — it snaps down to 56px or runs as a floating chat bubble with zero layout shift."`);
      });
    }
  }

  if (totalMatches === 0) {
    console.log('✅ Scan complete: No urgent keyword matches in the latest 75 posts across subreddits.');
    console.log('💡 Tip: Run this radar daily or connect it to your Discord/Telegram webhook to get notified automatically!');
  } else {
    console.log(`\n🎯 Total actionable conversation opportunities found: ${totalMatches}`);
  }
}

runRadar();
