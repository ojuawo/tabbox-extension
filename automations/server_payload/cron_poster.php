<?php
/**
 * TabBox Automated Social Poster & Reddit Radar — Remote Cron Runner
 * Works via CLI (crontab) or HTTP GET (Web Cron / cPanel Cron).
 */

header('Content-Type: application/json; charset=utf-8');

// Load configuration
$configFile = __DIR__ . '/config.json';
$calendarFile = __DIR__ . '/social_calendar.json';
$stateFile = __DIR__ . '/.state.json';
$logFile = __DIR__ . '/cron_log.txt';

$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];
$secretToken = $config['secret_token'] ?? 'tabbox_default_secret_token';
$webhookUrl = $config['webhook_url'] ?? '';

// Security Verification for HTTP Web Cron
$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    $providedToken = $_GET['token'] ?? '';
    if ($providedToken !== $secretToken) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized: Invalid or missing token']);
        exit;
    }
}

// Check if install_cron parameter is requested
$cronStatus = 'web_cron_ready';
$disabledFunctions = explode(',', ini_get('disable_functions'));
$disabledFunctions = array_map('trim', $disabledFunctions);
$canExec = function_exists('shell_exec') && !in_array('shell_exec', $disabledFunctions);

if (isset($_GET['install_cron']) && $canExec) {
    try {
        $cronCommand = "0 */4 * * * /usr/bin/curl -s \"https://komunisconcept.org.ng/tabbox-auto/cron_poster.php?token={$secretToken}\" >/dev/null 2>&1";
        $currentCrons = @shell_exec('crontab -l 2>/dev/null') ?? '';
        if (strpos($currentCrons, 'tabbox-auto') === false) {
            $newCrons = trim($currentCrons) . "\n" . $cronCommand . "\n";
            $tmpFile = tempnam(sys_get_temp_dir(), 'tb_cron');
            file_put_contents($tmpFile, $newCrons);
            @shell_exec("crontab " . escapeshellarg($tmpFile) . " 2>&1");
            @unlink($tmpFile);
            $cronStatus = 'crontab_updated';
        } else {
            $cronStatus = 'already_in_crontab';
        }
    } catch (\Throwable $e) {
        $cronStatus = 'crontab_exec_failed: ' . $e->getMessage();
    }
}
// Load Calendar
if (!file_exists($calendarFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'social_calendar.json not found']);
    exit;
}
$calendar = json_decode(file_get_contents($calendarFile), true);

// Manage State (7-day cycle calculation)
$state = file_exists($stateFile) ? json_decode(file_get_contents($stateFile), true) : [
    'start_date' => date('c'),
    'current_day' => 1,
    'total_runs' => 0
];

$startDate = new DateTime($state['start_date'] ?? date('c'));
$now = new DateTime();
$diffDays = $now->diff($startDate)->days;
$currentDay = ($diffDays % count($calendar)) + 1;

// Find post for current day
$todayPost = null;
foreach ($calendar as $p) {
    if ($p['day'] === $currentDay) {
        $todayPost = $p;
        break;
    }
}
if (!$todayPost) $todayPost = $calendar[0];

// ============================================================================
// REDDIT RADAR SCANNER
// ============================================================================
$subreddits = ['chrome', 'productivity', 'browsers'];
$keywords = ['side panel', 'vertical tab', 'too wide', '320px', 'tab manager', 'tabs memory', 'arc browser'];
$matches = [];

foreach ($subreddits as $sub) {
    $rssUrl = "https://www.reddit.com/r/{$sub}/new/.rss";
    $opts = [
        'http' => [
            'method' => 'GET',
            'header' => "User-Agent: TabBoxRemoteRadar/1.0 (Automated Cron Job)\r\n"
        ]
    ];
    $context = stream_context_create($opts);
    $rssXml = @file_get_contents($rssUrl, false, $context);
    if (!$rssXml) continue;

    $xmlObj = @simplexml_load_string($rssXml);
    if (!$xmlObj || !isset($xmlObj->entry)) continue;

    foreach ($xmlObj->entry as $entry) {
        $title = (string)$entry->title;
        $link = '';
        foreach ($entry->link as $l) {
            if (isset($l['href'])) {
                $link = (string)$l['href'];
                break;
            }
        }
        $lower = strtolower($title);
        foreach ($keywords as $kw) {
            if (strpos($lower, $kw) !== false) {
                $matches[] = [
                    'subreddit' => "r/{$sub}",
                    'title' => $title,
                    'link' => $link
                ];
                break;
            }
        }
    }
}

// ============================================================================
// WEBHOOK NOTIFICATION (Discord, Slack, Make.com, Buffer)
// ============================================================================
$webhookDispatched = false;
if (!empty($webhookUrl)) {
    $leadText = "";
    if (count($matches) > 0) {
        $leadText .= "\n\n**🎯 Fresh Reddit Leads (" . count($matches) . "):**\n";
        foreach (array_slice($matches, 0, 3) as $m) {
            $leadText .= "• [{$m['subreddit']}] {$m['title']}\n  <{${m['link']}}>\n";
        }
    }

    $msg = "**🚀 [TabBox Auto-Poster — Day {$currentDay} ({$todayPost['platform']})]**\n\n";
    $msg .= $todayPost['content'] . "\n\n";
    if (!empty($todayPost['one_click_tweet_url'])) {
        $msg .= "👉 **1-Click Tweet:** <" . $todayPost['one_click_tweet_url'] . ">\n";
    }
    $msg .= $leadText;

    $payload = json_encode(['content' => $msg]);
    $ch = curl_init($webhookUrl);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Content-Length: ' . strlen($payload)
    ]);
    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $webhookDispatched = ($httpCode >= 200 && $httpCode < 300);
}

// Update State & Log
$state['last_run'] = date('c');
$state['current_day'] = $currentDay;
$state['total_runs'] = ($state['total_runs'] ?? 0) + 1;
file_put_contents($stateFile, json_encode($state, JSON_PRETTY_PRINT));

$logEntry = "[" . date('Y-m-d H:i:s') . "] Day {$currentDay} ({$todayPost['platform']}) | Reddit Matches: " . count($matches) . " | Webhook: " . ($webhookDispatched ? 'Sent' : 'None') . "\n";
file_put_contents($logFile, $logEntry, FILE_APPEND);

// Response
echo json_encode([
    'status' => 'success',
    'timestamp' => date('c'),
    'cron_setup' => $cronStatus,
    'day' => $currentDay,
    'platform' => $todayPost['platform'],
    'topic' => $todayPost['topic'],
    'reddit_matches_found' => count($matches),
    'webhook_dispatched' => $webhookDispatched,
    'post_preview' => substr($todayPost['content'], 0, 120) . '...'
], JSON_PRETTY_PRINT);
