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

// Stripe & Paystack Payment Links (can be configured in config.json or fallback to Komunis Concept direct checkout)
$stripeLifetimeUrl = $config['stripe_lifetime_url'] ?? 'https://buy.stripe.com/test_tabbox_lifetime_10';
$stripeAnnualUrl = $config['stripe_annual_url'] ?? 'https://buy.stripe.com/test_tabbox_annual_4';
$paystackLifetimeUrl = $config['paystack_lifetime_url'] ?? 'https://paystack.com/pay/tabbox-pro-lifetime';
$paystackAnnualUrl = $config['paystack_annual_url'] ?? 'https://paystack.com/pay/tabbox-pro-annual';
$paystackSecretKey = $config['paystack_secret_key'] ?? '';

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

        // Target URL by payment method (Paystack, Stripe, or Hosted Portal)
        $method = strtolower($_GET['method'] ?? $input['method'] ?? 'paystack');
        if ($method === 'stripe') {
            $targetUrl = ($tier === 'annual' || $tier === 'year') ? $stripeAnnualUrl : $stripeLifetimeUrl;
        } else {
            $targetUrl = ($tier === 'annual' || $tier === 'year') ? $paystackAnnualUrl : $paystackLifetimeUrl;
        }

        // If direct redirect requested
        if (isset($_GET['redirect']) && $_GET['redirect'] === 'true' && isset($_GET['method'])) {
            header("Location: {$targetUrl}");
            exit;
        }

        // If hosted checkout page requested or generic redirect
        if (isset($_GET['redirect']) && $_GET['redirect'] === 'true') {
            header('Content-Type: text/html; charset=utf-8');
            $tierName = ($tier === 'annual' || $tier === 'year') ? 'Micro-Annual ($4/yr)' : 'Lifetime Deal ($10)';
            $tierPrice = ($tier === 'annual' || $tier === 'year') ? '$4.00' : '$10.00';
            $tierNgn = ($tier === 'annual' || $tier === 'year') ? '₦6,000' : '₦15,000';
            ?>
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>TabBox Pro Checkout — Komunis Concept</title>
              <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                body { background: #0f1115; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
                .checkout-card { background: #181a20; border: 1px solid #282c35; border-radius: 16px; max-width: 460px; width: 100%; padding: 28px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
                .badge { display: inline-block; padding: 4px 10px; background: rgba(99, 102, 241, 0.15); color: #818cf8; border-radius: 20px; font-size: 11px; font-weight: 700; margin-bottom: 12px; }
                h2 { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
                p.sub { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
                .order-summary { background: #21242d; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
                .order-title { font-weight: 700; font-size: 14px; }
                .order-price { font-size: 18px; font-weight: 800; color: #818cf8; }
                .payment-options { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
                .pay-btn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px 18px; border-radius: 8px; font-size: 14px; font-weight: 700; text-decoration: none; transition: all 0.15s ease; border: none; cursor: pointer; text-align: center; }
                .btn-paystack { background: linear-gradient(135deg, #09a5db, #0284c7); color: #fff; }
                .btn-paystack:hover { opacity: 0.95; transform: translateY(-1px); }
                .btn-stripe { background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; }
                .btn-stripe:hover { opacity: 0.95; transform: translateY(-1px); }
                .bank-box { background: #13151b; border: 1px dashed #333842; border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.6; color: #cbd5e1; }
                .bank-title { font-weight: 700; color: #f8fafc; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
                .footer-note { font-size: 11px; color: #64748b; text-align: center; margin-top: 18px; line-height: 1.4; }
              </style>
            </head>
            <body>
              <div class="checkout-card">
                <div class="badge">⚡ SECURE CHECKOUT</div>
                <h2>Upgrade to TabBox Pro</h2>
                <p class="sub">Choose your preferred payment method below to unlock all 4 architecture modes and unlimited workspaces.</p>

                <div class="order-summary">
                  <div class="order-title">TabBox Pro <?php echo htmlspecialchars($tierName); ?></div>
                  <div class="order-price"><?php echo htmlspecialchars($tierPrice); ?> <small style="font-size:11px; color:#94a3b8;">(<?php echo htmlspecialchars($tierNgn); ?>)</small></div>
                </div>

                <div class="payment-options">
                  <a href="<?php echo htmlspecialchars($paystackLifetimeUrl); ?>" target="_blank" class="pay-btn btn-paystack">
                    💳 Pay via Paystack (Cards, Apple Pay, Transfer)
                  </a>
                  <a href="<?php echo htmlspecialchars($stripeLifetimeUrl); ?>" target="_blank" class="pay-btn btn-stripe">
                    🌍 Pay via Stripe / International Card
                  </a>
                </div>

                <div class="bank-box">
                  <div class="bank-title">🏛️ Direct Bank Transfer (Nigeria / NGN)</div>
                  <div>Bank: <b>Wema Bank / Kuda / GTBank</b> (Komunis Concept)</div>
                  <div>Account Name: <b>Komunis Concept</b></div>
                  <div>Amount: <b><?php echo htmlspecialchars($tierNgn); ?></b> (or $10 / $4)</div>
                  <div style="margin-top:6px; color:#94a3b8;">After transfer, send receipt to <b>support@komunisconcept.org.ng</b> or WhatsApp for instant key activation.</div>
                </div>

                <div class="footer-note">
                  🔒 256-Bit SSL Encrypted • Instant Key Delivery • Komunis Concept (komunisconcept.org.ng)
                </div>
              </div>
            </body>
            </html>
            <?php
            exit;
        }

        echo json_encode([
            'success' => true,
            'tier' => $tier,
            'price' => ($tier === 'annual' || $tier === 'year') ? '$4.00 / year' : '$10.00 one-time',
            'checkout_url' => $targetUrl,
            'paystack_url' => ($tier === 'annual' || $tier === 'year') ? $paystackAnnualUrl : $paystackLifetimeUrl,
            'stripe_url' => ($tier === 'annual' || $tier === 'year') ? $stripeAnnualUrl : $stripeLifetimeUrl,
            'allocated_key' => $newKey,
            'message' => 'Checkout session ready.'
        ]);
        exit;
    }

    // ========================================================================
    // 3. PAYSTACK WEBHOOK HANDLER
    // ========================================================================
    case 'paystack_webhook': {
        $rawPayload = file_get_contents('php://input');
        $signature = $_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '';

        if (!empty($paystackSecretKey) && hash_hmac('sha512', $rawPayload, $paystackSecretKey) !== $signature) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid webhook signature']);
            exit;
        }

        $event = json_decode($rawPayload, true);
        if (($event['event'] ?? '') === 'charge.success') {
            $data = $event['data'] ?? [];
            $customerEmail = $data['customer']['email'] ?? 'customer@tabbox.pro';
            $amount = ($data['amount'] ?? 0) / 100;
            $tier = ($amount <= 10 || $amount <= 7000) ? 'annual' : 'lifetime';

            $newKey = generateSignedKey($tier, $signingSalt);
            $licenses = getLicenses($licensesFile);
            $licenses[$newKey] = [
                'tier' => $tier,
                'email' => $customerEmail,
                'created_at' => date('c'),
                'expires_at' => ($tier === 'annual') ? date('c', strtotime('+1 year')) : null,
                'status' => 'active',
                'note' => "Paystack Reference: " . ($data['reference'] ?? 'unknown')
            ];
            saveLicenses($licensesFile, $licenses);

            @file_put_contents($logFile, date('c') . " - Paystack charge.success: {$newKey} issued to {$customerEmail}\n", FILE_APPEND);
        }

        echo json_encode(['status' => 'received']);
        exit;
    }

    // ========================================================================
    // 4. ADMIN KEY GENERATOR (Protected by secret token)
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
