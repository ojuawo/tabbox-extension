#!/usr/bin/env node

/**
 * TabBox FTP Uploader & Cron Job Automation Setup Tool
 * Connects to a remote FTP server, deploys the automated posting engine,
 * verifies execution, and configures the 4-hour cron job.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const ftp = require('basic-ftp');

// Paths
const LOCAL_PAYLOAD_DIR = path.join(__dirname, 'server_payload');
const CALENDAR_FILE = path.join(__dirname, 'social_calendar.json');
const CONFIG_FILE = path.join(__dirname, '..', 'ftp_config.json');

// Parse CLI flags
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value !== undefined ? value : true;
    }
  });

  // Aliases
  if (args.pass && !args.password) args.password = args.pass;
  if (args.dir && !args.remoteDir) args.remoteDir = args.dir;
  if (!args.port) args.port = 21;

  return args;
}

// Prompt Helper
function ask(rl, query, defaultValue = '') {
  return new Promise(resolve => {
    const prompt = defaultValue ? `${query} [${defaultValue}]: ` : `${query}: `;
    rl.question(prompt, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// Password Prompt Helper (masked input)
function askPassword(rl, query) {
  return new Promise(resolve => {
    process.stdout.write(`${query}: `);
    const stdin = process.stdin;
    const oldRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();

    let password = '';
    const onData = chunk => {
      const str = chunk.toString('utf8');
      for (const char of str) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          if (stdin.isTTY) stdin.setRawMode(oldRaw);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          return;
        } else if (char === '\u0003') {
          process.exit();
        } else if (char === '\u0008' || char === '\x7f') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += char;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

async function gatherConfig() {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    console.log(`
================================================================
   🚀 TABBOX FTP DEPLOYER & CRON SETUP TOOL
================================================================
Usage:
  node automations/ftp_cron_setup.js [options]
  npm run setup-ftp

Options:
  --host=<host>        FTP server hostname (e.g. ftp.yourdomain.com)
  --port=<port>        FTP port (default: 21)
  --user=<username>    FTP username
  --pass=<password>    FTP password
  --dir=<remoteDir>    Target directory on server (default: public_html/tabbox-auto)
  --domain=<url>       Public website URL (e.g. https://yourdomain.com)
  --webhook=<url>      Discord/Slack/Make webhook for post alerts
  --help, -h           Show this help message

Interactive Wizard:
  Run without arguments to launch the step-by-step interactive prompt.

Configuration File:
  You can also copy 'ftp_config.example.json' to 'ftp_config.json' and fill it out.
`);
    process.exit(0);
  }

  let savedConfig = {};

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log(`📁 Loaded saved configuration from: ftp_config.json`);
    } catch (e) {}
  }

  // Merge CLI args over saved config
  const merged = { ...savedConfig, ...cliArgs };

  // If all critical credentials provided via CLI or file, skip prompts
  if (merged.host && merged.user && merged.password && merged.domain) {
    if (!merged.secret_token) {
      merged.secret_token = crypto.randomBytes(16).toString('hex');
    }
    return merged;
  }

  console.log('\n================================================================');
  console.log('   🚀 TABBOX FTP DEPLOYER & CRON SETUP WIZARD');
  console.log('================================================================');
  console.log('This tool connects to your FTP server, uploads the automated');
  console.log('social poster & Reddit radar, and configures the 4-hour cron job.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const host = merged.host || (await ask(rl, '1. FTP Host / Server (e.g. ftp.yourdomain.com or IP)'));
  const port = parseInt(merged.port || (await ask(rl, '2. FTP Port', '21')), 10);
  const user = merged.user || (await ask(rl, '3. FTP Username'));
  const password = merged.password || (await askPassword(rl, '4. FTP Password'));
  const remoteDir = merged.remoteDir || (await ask(rl, '5. Remote Target Directory', 'public_html/tabbox-auto'));
  const domain = merged.domain || (await ask(rl, '6. Public Website URL (e.g. https://yourdomain.com)'));
  const webhook = merged.webhook !== undefined ? merged.webhook : (await ask(rl, '7. Discord/Slack Webhook URL (optional, for alerts)', ''));
  const secretToken = merged.secret_token || crypto.randomBytes(16).toString('hex');

  const shouldSave = await ask(rl, '8. Save credentials to local ftp_config.json for future 1-click runs? (y/n)', 'y');

  rl.close();

  const finalConfig = {
    host,
    port,
    user,
    password,
    remoteDir,
    domain: domain.replace(/\/+$/, ''),
    webhook_url: webhook,
    secret_token: secretToken
  };

  if (shouldSave.toLowerCase() === 'y') {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(finalConfig, null, 2), 'utf8');
    console.log('✅ Configuration saved to ftp_config.json (safely excluded via .gitignore).');
  }

  return finalConfig;
}

async function uploadPayload(config) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  console.log(`\n⏳ [1/4] Connecting to FTP: ${config.host}:${config.port} as '${config.user}'...`);

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.port === 990 || config.secure === true
    });

    console.log(`✅ [2/4] Connected successfully! Navigating to remote folder: ${config.remoteDir}`);
    await client.ensureDir(config.remoteDir);

    console.log(`📤 [3/4] Uploading automation engine files...`);

    // 1. Upload social_calendar.json
    await client.uploadFrom(CALENDAR_FILE, 'social_calendar.json');
    console.log(`    ✓ Uploaded social_calendar.json`);

    // 2. Upload cron_poster.php
    const phpRunner = path.join(LOCAL_PAYLOAD_DIR, 'cron_poster.php');
    await client.uploadFrom(phpRunner, 'cron_poster.php');
    console.log(`    ✓ Uploaded cron_poster.php`);

    // 3. Upload run_cron.sh
    const shRunner = path.join(LOCAL_PAYLOAD_DIR, 'run_cron.sh');
    await client.uploadFrom(shRunner, 'run_cron.sh');
    console.log(`    ✓ Uploaded run_cron.sh`);

    // 4. Upload license_verify.php
    const licenseRunner = path.join(LOCAL_PAYLOAD_DIR, 'license_verify.php');
    if (fs.existsSync(licenseRunner)) {
      await client.uploadFrom(licenseRunner, 'license_verify.php');
      console.log(`    ✓ Uploaded license_verify.php (Licensing & Payment Gateway)`);
    }

    // 4. Create and upload remote config.json
    const remoteConfig = {
      secret_token: config.secret_token,
      webhook_url: config.webhook_url,
      updated_at: new Date().toISOString()
    };
    const tempConfigPath = path.join(__dirname, '.temp_remote_config.json');
    fs.writeFileSync(tempConfigPath, JSON.stringify(remoteConfig, null, 2), 'utf8');
    await client.uploadFrom(tempConfigPath, 'config.json');
    fs.unlinkSync(tempConfigPath);
    console.log(`    ✓ Uploaded config.json (with secure token & webhook)`);

    // Close client
    client.close();
    console.log(`✅ [4/4] All files deployed to remote server successfully!`);

  } catch (err) {
    client.close();
    throw new Error(`FTP Deployment failed: ${err.message}`);
  }
}

async function testRemoteCronEndpoint(config) {
  // Construct clean public web URL
  const normalizedPath = config.remoteDir.replace(/^(\/)?(public_html|www|httpdocs)(\/)?/i, '');
  const webPath = normalizedPath ? `/${normalizedPath}/cron_poster.php` : '/cron_poster.php';
  const testUrl = `${config.domain}${webPath}?token=${encodeURIComponent(config.secret_token)}`;

  console.log('\n================================================================');
  console.log('🧪 VERIFYING REMOTE EXECUTION (TEST PING)');
  console.log('================================================================');
  console.log(`📡 Pinging: ${testUrl}\n`);

  try {
    const res = await fetch(testUrl, {
      headers: {
        'User-Agent': 'TabBoxSetupValidator/1.0'
      }
    });

    const status = res.status;
    const text = await res.text();

    if (status === 200) {
      console.log('🎉 SUCCESS! Remote script responded with HTTP 200 OK.');
      try {
        const json = JSON.parse(text);
        console.log('📊 Execution Status:');
        console.log(`   • Day: ${json.day} (${json.platform})`);
        console.log(`   • Topic: ${json.topic}`);
        console.log(`   • Reddit Leads Found: ${json.reddit_matches_found}`);
        console.log(`   • Webhook Alert: ${json.webhook_dispatched ? 'Sent' : 'None / Not configured'}`);
      } catch (e) {
        console.log('Output preview:', text.slice(0, 150));
      }
    } else {
      console.log(`⚠️ Warning: Remote server returned status ${status}.`);
      console.log('Response preview:', text.slice(0, 200));
    }
  } catch (e) {
    console.log(`⚠️ Note: Could not complete direct HTTP test ping (${e.message}).`);
    console.log(`Ensure your domain (${config.domain}) points to this FTP folder.`);
  }

  return testUrl;
}

function displayCronInstructions(config, webCronUrl) {
  const normalizedPath = config.remoteDir.replace(/^(\/)?(public_html|www|httpdocs)(\/)?/i, '');
  const webPath = normalizedPath ? `${normalizedPath}/cron_poster.php` : 'cron_poster.php';

  console.log('\n================================================================');
  console.log('⏰ CRON JOB SETUP: 3 WAYS TO RUN EVERY 4 HOURS');
  console.log('================================================================\n');

  console.log('OPTION A: Free Web Cron (Recommended — Works on ANY web host)');
  console.log('----------------------------------------------------------------');
  console.log('Use a free service like cron-job.org or EasyCron to ping this URL');
  console.log('every 4 hours:');
  console.log(`👉 URL: ${webCronUrl}\n`);

  console.log('OPTION B: cPanel / Hostinger / Shared Hosting Cron Job');
  console.log('----------------------------------------------------------------');
  console.log('In your hosting control panel, go to "Cron Jobs", set interval to:');
  console.log('   Minute: 0   Hour: */4   Day: *   Month: *   Weekday: *');
  console.log('And paste this command:');
  console.log(`👉 /usr/bin/curl -s "${webCronUrl}" >/dev/null 2>&1\n`);

  console.log('OPTION C: Direct Server Crontab (SSH / VPS)');
  console.log('----------------------------------------------------------------');
  console.log('Run `crontab -e` on your server and append:');
  console.log(`👉 0 */4 * * * /usr/bin/php ~/${config.remoteDir}/cron_poster.php >/dev/null 2>&1\n`);

  console.log('================================================================');
  console.log('🚀 TabBox automated posting engine is live on your server!');
  console.log('================================================================\n');
}

async function main() {
  try {
    const config = await gatherConfig();
    await uploadPayload(config);
    const webCronUrl = await testRemoteCronEndpoint(config);
    displayCronInstructions(config, webCronUrl);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
