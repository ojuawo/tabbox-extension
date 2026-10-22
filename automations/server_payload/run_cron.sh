#!/bin/bash
# TabBox Server Cron Execution Script

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Try running with PHP if available
if command -v php >/dev/null 2>&1; then
    php cron_poster.php
# Or fallback to Node.js if available
elif command -v node >/dev/null 2>&1; then
    node scheduler.js
else
    echo "Neither PHP nor Node.js found on PATH." >&2
    exit 1
fi
