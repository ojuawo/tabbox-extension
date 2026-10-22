#!/usr/bin/env python3
"""
TabBox FTP Deployer & Cron Setup Tool (Python Version)
Connects to an FTP server, uploads the automated posting engine, and generates the 4-hour cron job.
Uses 100% Python standard library (ftplib, urllib, json, os, sys).
"""

import os
import sys
import json
import ftplib
import secrets
import urllib.request
import urllib.error

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
PAYLOAD_DIR = os.path.join(SCRIPT_DIR, 'server_payload')
CALENDAR_FILE = os.path.join(SCRIPT_DIR, 'social_calendar.json')
CONFIG_FILE = os.path.join(PROJECT_DIR, 'ftp_config.json')

def load_or_prompt_config():
    config = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
            print("📁 Loaded saved configuration from: ftp_config.json")
        except Exception:
            pass

    if config.get('host') and config.get('user') and config.get('password') and config.get('domain'):
        if not config.get('secret_token'):
            config['secret_token'] = secrets.token_hex(16)
        return config

    print("\n" + "=" * 64)
    print("   🚀 TABBOX FTP DEPLOYER & CRON SETUP WIZARD (Python)")
    print("=" * 64)
    print("Connects to your FTP server, uploads the automated social poster,")
    print("and configures the 4-hour cron job.\n")

    host = config.get('host') or input("1. FTP Host / Server (e.g. ftp.yourdomain.com): ").strip()
    port_str = config.get('port') or input("2. FTP Port [21]: ").strip() or "21"
    user = config.get('user') or input("3. FTP Username: ").strip()
    password = config.get('password') or input("4. FTP Password: ").strip()
    remote_dir = config.get('remoteDir') or input("5. Remote Target Directory [public_html/tabbox-auto]: ").strip() or "public_html/tabbox-auto"
    domain = config.get('domain') or input("6. Public Website URL (e.g. https://yourdomain.com): ").strip()
    webhook = config.get('webhook_url') or input("7. Discord/Slack Webhook URL (optional): ").strip()

    save = input("8. Save to local ftp_config.json? (y/n) [y]: ").strip().lower() or 'y'

    final_config = {
        "host": host,
        "port": int(port_str),
        "user": user,
        "password": password,
        "remoteDir": remote_dir.strip('/'),
        "domain": domain.rstrip('/'),
        "webhook_url": webhook,
        "secret_token": config.get('secret_token') or secrets.token_hex(16)
    }

    if save == 'y':
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(final_config, f, indent=2)
        print("✅ Configuration saved to ftp_config.json (ignored by git).")

    return final_config

def upload_files(config):
    print(f"\n⏳ [1/4] Connecting to FTP: {config['host']}:{config['port']} as '{config['user']}'...")
    ftp = ftplib.FTP()
    try:
        ftp.connect(config['host'], config['port'], timeout=30)
        ftp.login(config['user'], config['password'])
        print(f"✅ [2/4] Logged in successfully. Navigating to remote folder: {config['remoteDir']}")

        # Ensure directory
        parts = config['remoteDir'].split('/')
        for part in parts:
            if not part:
                continue
            try:
                ftp.cwd(part)
            except ftplib.error_perm:
                ftp.mkd(part)
                ftp.cwd(part)

        print("📤 [3/4] Uploading automation payload...")

        # 1. Upload social_calendar.json
        with open(CALENDAR_FILE, 'rb') as f:
            ftp.storbinary('STOR social_calendar.json', f)
        print("    ✓ Uploaded social_calendar.json")

        # 2. Upload cron_poster.php
        php_file = os.path.join(PAYLOAD_DIR, 'cron_poster.php')
        with open(php_file, 'rb') as f:
            ftp.storbinary('STOR cron_poster.php', f)
        print("    ✓ Uploaded cron_poster.php")

        # 3. Upload run_cron.sh
        sh_file = os.path.join(PAYLOAD_DIR, 'run_cron.sh')
        with open(sh_file, 'rb') as f:
            ftp.storbinary('STOR run_cron.sh', f)
        print("    ✓ Uploaded run_cron.sh")

        # 4. Upload license_verify.php
        lic_file = os.path.join(PAYLOAD_DIR, 'license_verify.php')
        if os.path.exists(lic_file):
            with open(lic_file, 'rb') as f:
                ftp.storbinary('STOR license_verify.php', f)
            print("    ✓ Uploaded license_verify.php (Licensing & Payment Gateway)")

        # 5. Upload remote config.json
        remote_cfg = {
            "secret_token": config['secret_token'],
            "webhook_url": config['webhook_url']
        }
        cfg_bytes = json.dumps(remote_cfg, indent=2).encode('utf-8')
        import io
        ftp.storbinary('STOR config.json', io.BytesIO(cfg_bytes))
        print("    ✓ Uploaded config.json (with secure token & webhook)")

        ftp.quit()
        print("✅ [4/4] All files deployed to remote server successfully!")

    except Exception as e:
        ftp.close()
        raise RuntimeError(f"FTP error: {e}")

def verify_and_print_instructions(config):
    norm_dir = config['remoteDir']
    for prefix in ['public_html/', 'www/', 'httpdocs/']:
        if norm_dir.startswith(prefix):
            norm_dir = norm_dir[len(prefix):]
            break

    web_path = f"/{norm_dir}/cron_poster.php" if norm_dir else "/cron_poster.php"
    cron_url = f"{config['domain']}{web_path}?token={config['secret_token']}"

    print("\n" + "=" * 64)
    print("🧪 VERIFYING REMOTE EXECUTION (TEST PING)")
    print("=" * 64)
    print(f"📡 Pinging: {cron_url}\n")

    try:
        req = urllib.request.Request(cron_url, headers={'User-Agent': 'TabBoxSetupValidator/1.0'})
        with urllib.request.urlopen(req, timeout=15) as res:
            data = res.read().decode('utf-8')
            print("🎉 SUCCESS! Remote script responded HTTP 200 OK.")
            try:
                parsed = json.loads(data)
                print(f"   • Day: {parsed.get('day')} ({parsed.get('platform')})")
                print(f"   • Topic: {parsed.get('topic')}")
                print(f"   • Reddit Leads Found: {parsed.get('reddit_matches_found')}")
                print(f"   • Webhook: {'Sent' if parsed.get('webhook_dispatched') else 'None'}")
            except Exception:
                print("Output:", data[:150])
    except Exception as err:
        print(f"⚠️ Note: HTTP test ping gave: {err}")
        print("Ensure your domain points to this FTP directory.")

    print("\n" + "=" * 64)
    print("⏰ 3 WAYS TO RUN THIS CRON JOB EVERY 4 HOURS")
    print("=" * 64 + "\n")

    print("OPTION A: Free Web Cron (Recommended — Works on ANY web host)")
    print("----------------------------------------------------------------")
    print("Set up a free job at cron-job.org or EasyCron to ping:")
    print(f"👉 URL: {cron_url}\n")

    print("OPTION B: cPanel / Shared Hosting Cron Tab")
    print("----------------------------------------------------------------")
    print("Set schedule: 0 */4 * * *")
    print(f"👉 Command: /usr/bin/curl -s \"{cron_url}\" >/dev/null 2>&1\n")

    print("OPTION C: Direct Server Crontab (SSH / VPS)")
    print("----------------------------------------------------------------")
    print(f"👉 0 */4 * * * /usr/bin/php ~/{config['remoteDir']}/cron_poster.php >/dev/null 2>&1\n")

    print("=" * 64)
    print("🚀 TabBox automated posting engine is live on your server!")
    print("=" * 64 + "\n")

def main():
    try:
        config = load_or_prompt_config()
        upload_files(config)
        verify_and_print_instructions(config)
    except Exception as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
