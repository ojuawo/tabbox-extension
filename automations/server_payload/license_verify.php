<?php
/**
 * TabBox Pro License Verification & Payment Gateway Endpoint
 * Komunis Concept (komunisconcept.org.ng)
 * 
 * Handles:
 * 1. License key validation (online check against licenses.json + cryptographic HMAC signature fallback)
 * 2. Instant checkout links / sessions for $10 Lifetime and $4/Year Pro
 * 3. Key generation and admin management
 */

// Enable CORS for Chrome Extension & Landing Page
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuration & Master Signing Secret
$configFile = __DIR__ . '/config.json';
$licensesFile = __DIR__ . '/licenses.json';
$logFile = __DIR__ . '/license_log.txt';

$config = file_exists($configFile) ? json_decode(file_get_contents($configFile), true) : [];
$secretToken = $config['secret_token'] ?? '1f1eb5c84cc25b4c4b4b99c13de2f470';
$signingSalt = 'TabBox_Komunis_Pro_SecretSalt_2026';

// Stripe Payment Links (can be configured in config.json or fallback to Komunis Concept direct checkout)
$stripeLifetimeUrl = $config['stripe_lifetime_url'] ?? 'https://buy.stripe.com/test_tabbox_lifetime_10';
$stripeAnnualUrl = $config['stripe_annual_url'] ?? 'https://buy.stripe.com/test_tabbox_annual_4';

// Initialize licenses store if not present
if (!file_exists($licensesFile)) {
    $initialLicenses = [
        // Seed default test / founder licenses
        'TBX-LIFE-FOUNDER-8888' => [
            'tier' => 'lifetime',
            'email' => 'founder@komunisconcept.org.ng',
            'created_at' => '2026-10-20T00:00:00Z',
            'status' => 'active',
            'note' => 'Internal Founder Key'
        ],
        'TBX-LIFE-TEST-1000' => [
            'tier' => 'lifetime',
            'email' => 'test@komunisconcept.org.ng',
            'created_at' => '2026-10-22T00:00:00Z',
            'status' => 'active',
            'note' => 'Test Lifetime License ($10)'
        ],
        'TBX-YEAR-TEST-4000' => [
            'tier' => 'annual',
            'email' => 'annual@komunisconcept.org.ng',
            'created_at' => '2026-10-22T00:00:00Z',
            'expires_at' => '2027-10-22T00:00:00Z',
            'status' => 'active',
            'note' => 'Test Annual License ($4/yr)'
        ]
    ];
    @file_put_contents($licensesFile, json_encode($initialLicenses, JSON_PRETTY_PRINT));
}

// Helper: Read licenses safely
function getLicenses($file) {
    if (!file_exists($file)) return [];
    $data = @file_get_contents($file);
    return json_decode($data, true) ?: [];
}

// Helper: Save licenses safely with file lock
function saveLicenses($file, $licenses) {
    return @file_put_contents($file, json_encode($licenses, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

// Helper: Cryptographic signature validation for offline/algorithmic keys
// Format: TBX-[LIFE|YEAR]-[8 HEX CHARS]-[4 HEX CHECKSUM]
function verifyKeyChecksum($key, $salt) {
    $parts = explode('-', strtoupper(trim($key)));
    if (count($parts) !== 4) return false;
    if ($parts[0] !== 'TBX') return false;
    $tier = $parts[1]; // 'LIFE' or 'YEAR'
    if (!in_array($tier, ['LIFE', 'YEAR'])) return false;
    $payload = $parts[0] . '-' . $parts[1] . '-' . $parts[2];
    $expectedChecksum = strtoupper(substr(hash_hmac('sha256', $payload, $salt), 0, 4));
    return ($parts[3] === $expectedChecksum);
}

// Helper: Generate a valid signed key
function generateSignedKey($tier, $salt) {
    $tierCode = (strtolower($tier) === 'annual' || strtolower($tier) === 'year') ? 'YEAR' : 'LIFE';
    $hex = strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
    $payload = "TBX-{$tierCode}-{$hex}";
    $checksum = strtoupper(substr(hash_hmac('sha256', $payload, $salt), 0, 4));
    return "{$payload}-{$checksum}";
}

// Read Action and Parameters (from GET, POST JSON, or Form Data)
$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
if (!$action && isset($input['action'])) {
    $action = $input['action'];
}

// Route Requests
switch ($action) {

    // ========================================================================
    // 1. VERIFY LICENSE KEY
    // ========================================================================
    case 'verify': {
        $rawKey = $input['license_key'] ?? $_GET['license_key'] ?? '';
        $email = strtolower(trim($input['email'] ?? $_GET['email'] ?? ''));
        $licenseKey = strtoupper(trim($rawKey));

        if (empty($licenseKey)) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'valid' => false,
                'message' => 'Please enter a valid license key.'
            ]);
            exit;
        }

        $licenses = getLicenses($licensesFile);

        // Check 1: Direct match in database
        if (isset($licenses[$licenseKey])) {
            $record = $licenses[$licenseKey];
            if (($record['status'] ?? 'active') !== 'active') {
                echo json_encode([
                    'success' => true,
                    'valid' => false,
                    'status' => 'revoked',
                    'message' => 'This license key has been revoked or suspended.'
                ]);
                exit;
            }

            // Check expiration for annual licenses
            if ($record['tier'] === 'annual' && !empty($record['expires_at'])) {
                $expiresTime = strtotime($record['expires_at']);
                if ($expiresTime < time()) {
                    echo json_encode([
                        'success' => true,
                        'valid' => false,
                        'status' => 'expired',
                        'message' => 'This annual license expired on ' . date('Y-m-d', $expiresTime) . '. Please renew for $4/year.'
                    ]);
                    exit;
                }
            }

            // Successful Database Verification
            echo json_encode([
                'success' => true,
                'valid' => true,
                'tier' => $record['tier'],
                'license_key' => $licenseKey,
                'email' => $record['email'] ?? $email,
                'expires_at' => $record['expires_at'] ?? null,
                'created_at' => $record['created_at'] ?? null,
                'message' => 'License verified successfully! Thank you for supporting TabBox.'
            ]);
            exit;
        }

        // Check 2: Cryptographic algorithmic signature check (Allows instant keys generated during checkout)
        if (verifyKeyChecksum($licenseKey, $signingSalt)) {
            $isYear = (strpos($licenseKey, 'TBX-YEAR-') === 0);
            $tier = $isYear ? 'annual' : 'lifetime';
            $expiresAt = $isYear ? date('c', strtotime('+1 year')) : null;

            // Automatically register in database for persistent tracking
            $licenses[$licenseKey] = [
                'tier' => $tier,
                'email' => $email ?: 'user@verified.tabbox',
                'created_at' => date('c'),
                'expires_at' => $expiresAt,
                'status' => 'active',
                'note' => 'Auto-registered via HMAC signature validation'
            ];
            saveLicenses($licensesFile, $licenses);

            echo json_encode([
                'success' => true,
                'valid' => true,
                'tier' => $tier,
                'license_key' => $licenseKey,
                'email' => $email,
                'expires_at' => $expiresAt,
                'message' => 'Cryptographic license signature verified successfully! Pro features unlocked.'
            ]);
            exit;
        }

        // Fallback: If not valid
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'valid' => false,
            'message' => 'Invalid license key. Please check your key or purchase a license.'
        ]);
        exit;
    }

    // ========================================================================
    // 2. CHECKOUT ROUTING ($10 Lifetime or $4/Year)
    // ========================================================================
    case 'checkout': {
        $tier = strtolower($_GET['tier'] ?? $input['tier'] ?? 'lifetime');
        $email = trim($_GET['email'] ?? $input['email'] ?? '');

        // Generate immediate fulfillment key in case direct checkout or webhook is used
        $newKey = generateSignedKey($tier, $signingSalt);

        // Store pre-allocated license
        $licenses = getLicenses($licensesFile);
        $licenses[$newKey] = [
            'tier' => ($tier === 'annual' || $tier === 'year') ? 'annual' : 'lifetime',
            'email' => $email ?: 'customer@komunisconcept.org.ng',
            'created_at' => date('c'),
            'expires_at' => ($tier === 'annual' || $tier === 'year') ? date('c', strtotime('+1 year')) : null,
            'status' => 'active',
            'note' => "Generated via Checkout Intent ({$tier})"
        ];
        saveLicenses($licensesFile, $licenses);

        // Target URL
        $targetUrl = ($tier === 'annual' || $tier === 'year') ? $stripeAnnualUrl : $stripeLifetimeUrl;

        // If redirect requested
        if (isset($_GET['redirect']) && $_GET['redirect'] === 'true') {
            header("Location: {$targetUrl}");
            exit;
        }

        echo json_encode([
            'success' => true,
            'tier' => $tier,
            'price' => ($tier === 'annual' || $tier === 'year') ? '$4.00 / year' : '$10.00 one-time',
            'checkout_url' => $targetUrl,
            'allocated_key' => $newKey,
            'message' => 'Checkout session ready.'
        ]);
        exit;
    }

    // ========================================================================
    // 3. ADMIN KEY GENERATOR (Protected by secret token)
    // ========================================================================
    case 'generate': {
        $token = $_GET['token'] ?? $input['token'] ?? '';
        if ($token !== $secretToken) {
            http_response_code(403);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }

        $tier = strtolower($input['tier'] ?? $_GET['tier'] ?? 'lifetime');
        $email = trim($input['email'] ?? $_GET['email'] ?? 'admin@komunisconcept.org.ng');
        $count = max(1, min(20, intval($input['count'] ?? $_GET['count'] ?? 1)));

        $generatedKeys = [];
        $licenses = getLicenses($licensesFile);

        for ($i = 0; $i < $count; $i++) {
            $key = generateSignedKey($tier, $signingSalt);
            $tierName = ($tier === 'annual' || $tier === 'year') ? 'annual' : 'lifetime';
            $expiresAt = ($tierName === 'annual') ? date('c', strtotime('+1 year')) : null;

            $licenses[$key] = [
                'tier' => $tierName,
                'email' => $email,
                'created_at' => date('c'),
                'expires_at' => $expiresAt,
                'status' => 'active',
                'note' => 'Generated via Admin API'
            ];
            $generatedKeys[] = [
                'key' => $key,
                'tier' => $tierName,
                'expires_at' => $expiresAt
            ];
        }

        saveLicenses($licensesFile, $licenses);

        echo json_encode([
            'success' => true,
            'count' => count($generatedKeys),
            'keys' => $generatedKeys
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // ========================================================================
    // 4. STATUS & PRICING METADATA
    // ========================================================================
    case 'pricing':
    case 'status':
    default: {
        echo json_encode([
            'service' => 'TabBox Pro Licensing Engine',
            'provider' => 'Komunis Concept (komunisconcept.org.ng)',
            'version' => '1.0.0',
            'status' => 'online',
            'pricing' => [
                'free' => [
                    'name' => 'Free Forever',
                    'price' => '$0',
                    'modes' => ['sidepanel'],
                    'features' => ['Chrome Native Side Panel', '2-6 Bento columns', 'Search', 'Tab Snooze', 'Website Grouping']
                ],
                'pro_annual' => [
                    'name' => 'Pro Micro-Annual',
                    'price' => '$4.00 / year',
                    'period' => 'yearly',
                    'checkout_url' => "https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=checkout&tier=annual&redirect=true",
                    'features' => ['All 4 Architecture Modes', '56px In-Page Rail & Chat Bubble', 'Docked Companion Window', 'Arc Command Modal (Alt+B)', 'Unlimited Workspaces']
                ],
                'pro_lifetime' => [
                    'name' => 'Pro Lifetime Deal',
                    'price' => '$10.00 one-time',
                    'period' => 'lifetime',
                    'checkout_url' => "https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=checkout&tier=lifetime&redirect=true",
                    'features' => ['All 4 Architecture Modes', '56px In-Page Rail & Chat Bubble', 'Docked Companion Window', 'Arc Command Modal (Alt+B)', 'Unlimited Workspaces', 'Lifetime Updates']
                ]
            ],
            'trial_policy' => '7-day full feature reverse trial included upon initial install.'
        ], JSON_PRETTY_PRINT);
        exit;
    }
}
