<?php
/**
 * TabBox Pro License Verification & Payment Gateway Endpoint
 * Komunis Concept (komunisconcept.org.ng)
 * 
 * Powered by Paystack (Direct API & Inline Checkout) + HMAC License Signing
 */

// Enable CORS for Chrome Extension & Landing Page
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

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

// Paystack & Stripe Keys
$paystackSecretKey = $config['paystack_secret_key'] ?? 'sk_test_c535bf8528358809243f6da4f9645e0491c6414c';
$paystackPublicKey = $config['paystack_public_key'] ?? 'pk_test_48f3bbbfaacf84dea97744fc117d9191fcebd239';
$stripeLifetimeUrl = $config['stripe_lifetime_url'] ?? 'https://buy.stripe.com/test_tabbox_lifetime_10';
$stripeAnnualUrl = $config['stripe_annual_url'] ?? 'https://buy.stripe.com/test_tabbox_annual_4';

// Initialize licenses store if not present
if (!file_exists($licensesFile)) {
    $initialLicenses = [
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

// Helpers
function getLicenses($file) {
    if (!file_exists($file)) return [];
    $data = @file_get_contents($file);
    return json_decode($data, true) ?: [];
}

function saveLicenses($file, $licenses) {
    return @file_put_contents($file, json_encode($licenses, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function verifyKeyChecksum($key, $salt) {
    $parts = explode('-', strtoupper(trim($key)));
    if (count($parts) !== 4) return false;
    if ($parts[0] !== 'TBX') return false;
    $tier = $parts[1];
    if (!in_array($tier, ['LIFE', 'YEAR'])) return false;
    $payload = $parts[0] . '-' . $parts[1] . '-' . $parts[2];
    $expectedChecksum = strtoupper(substr(hash_hmac('sha256', $payload, $salt), 0, 4));
    return ($parts[3] === $expectedChecksum);
}

function generateSignedKey($tier, $salt) {
    $tierCode = (strtolower($tier) === 'annual' || strtolower($tier) === 'year') ? 'YEAR' : 'LIFE';
    $hex = strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
    $payload = "TBX-{$tierCode}-{$hex}";
    $checksum = strtoupper(substr(hash_hmac('sha256', $payload, $salt), 0, 4));
    return "{$payload}-{$checksum}";
}

function paystackApiRequest($url, $secretKey, $method = 'GET', $data = null) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer {$secretKey}",
        "Content-Type: application/json"
    ]);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($data) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        }
    }
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $response = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) return null;
    return json_decode($response, true);
}

// Route Requests
$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
if (!$action && isset($input['action'])) {
    $action = $input['action'];
}

switch ($action) {

    // ========================================================================
    // 1. VERIFY LICENSE KEY
    // ========================================================================
    case 'verify': {
        header('Content-Type: application/json; charset=utf-8');
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

        // Check 2: Cryptographic algorithmic signature check
        if (verifyKeyChecksum($licenseKey, $signingSalt)) {
            $isYear = (strpos($licenseKey, 'TBX-YEAR-') === 0);
            $tier = $isYear ? 'annual' : 'lifetime';
            $expiresAt = $isYear ? date('c', strtotime('+1 year')) : null;

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

        http_response_code(400);
        echo json_encode([
            'success' => false,
            'valid' => false,
            'message' => 'Invalid license key. Please check your key or purchase a license.'
        ]);
        exit;
    }

    // ========================================================================
    // 2. PAYSTACK INITIALIZE TRANSACTION
    // ========================================================================
    case 'paystack_init': {
        header('Content-Type: application/json; charset=utf-8');
        $tier = strtolower($_GET['tier'] ?? $input['tier'] ?? 'lifetime');
        $email = trim($_GET['email'] ?? $input['email'] ?? '');
        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $email = 'customer_' . time() . '@komunisconcept.org.ng';
        }

        // Amounts in Kobo: ₦15,000 for Lifetime ($10), ₦6,000 for Annual ($4)
        $amountKobo = ($tier === 'annual' || $tier === 'year') ? 600000 : 1500000;
        $domain = 'https://komunisconcept.org.ng/tabbox-auto';
        $callbackUrl = "{$domain}/license_verify.php?action=paystack_verify";

        $initData = [
            'email' => $email,
            'amount' => $amountKobo,
            'currency' => 'NGN',
            'callback_url' => $callbackUrl,
            'metadata' => [
                'tier' => ($tier === 'annual' || $tier === 'year') ? 'annual' : 'lifetime',
                'product' => 'TabBox Pro'
            ]
        ];

        $res = paystackApiRequest('https://api.paystack.co/transaction/initialize', $paystackSecretKey, 'POST', $initData);

        if ($res && isset($res['status']) && $res['status'] && !empty($res['data']['authorization_url'])) {
            if (isset($_GET['redirect']) && $_GET['redirect'] === 'true') {
                header("Location: " . $res['data']['authorization_url']);
                exit;
            }
            echo json_encode([
                'success' => true,
                'authorization_url' => $res['data']['authorization_url'],
                'reference' => $res['data']['reference']
            ]);
            exit;
        }

        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => $res['message'] ?? 'Could not initialize Paystack transaction.'
        ]);
        exit;
    }

    // ========================================================================
    // 3. PAYSTACK VERIFY TRANSACTION & FULFILL LICENSE
    // ========================================================================
    case 'paystack_verify': {
        $reference = trim($_GET['reference'] ?? $input['reference'] ?? '');
        if (empty($reference)) {
            http_response_code(400);
            echo "Missing transaction reference.";
            exit;
        }

        $res = paystackApiRequest("https://api.paystack.co/transaction/verify/" . urlencode($reference), $paystackSecretKey);

        if (!$res || !isset($res['status']) || !$res['status'] || ($res['data']['status'] ?? '') !== 'success') {
            http_response_code(400);
            echo "Transaction verification failed or unpaid. Reference: " . htmlspecialchars($reference);
            exit;
        }

        $data = $res['data'];
        $customerEmail = strtolower(trim($data['customer']['email'] ?? 'customer@tabbox.pro'));
        $amountKobo = $data['amount'] ?? 0;
        $tier = ($amountKobo <= 650000 || ($data['metadata']['tier'] ?? '') === 'annual') ? 'annual' : 'lifetime';

        // Check if key already issued for this reference (idempotent)
        $licenses = getLicenses($licensesFile);
        $foundKey = null;
        foreach ($licenses as $k => $v) {
            if (($v['reference'] ?? '') === $reference) {
                $foundKey = $k;
                break;
            }
        }

        if (!$foundKey) {
            $foundKey = generateSignedKey($tier, $signingSalt);
            $licenses[$foundKey] = [
                'tier' => $tier,
                'email' => $customerEmail,
                'created_at' => date('c'),
                'expires_at' => ($tier === 'annual') ? date('c', strtotime('+1 year')) : null,
                'status' => 'active',
                'reference' => $reference,
                'amount_paid' => $amountKobo / 100,
                'channel' => $data['channel'] ?? 'paystack'
            ];
            saveLicenses($licensesFile, $licenses);
            @file_put_contents($logFile, date('c') . " - Paystack Verified {$reference}: {$foundKey} issued to {$customerEmail}\n", FILE_APPEND);
        }

        if (isset($_GET['format']) && $_GET['format'] === 'json') {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => true,
                'valid' => true,
                'license_key' => $foundKey,
                'tier' => $tier,
                'email' => $customerEmail,
                'message' => 'Payment verified! TabBox Pro license issued.'
            ]);
            exit;
        }

        header('Content-Type: text/html; charset=utf-8');
        ?>
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>TabBox Pro Activated — Komunis Concept</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: #0f1115; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
            .success-card { background: #181a20; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; max-width: 480px; width: 100%; padding: 32px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.7); }
            .check-badge { width: 56px; height: 56px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 16px auto; border: 1px solid rgba(16, 185, 129, 0.3); }
            h2 { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
            p.sub { font-size: 13px; color: #94a3b8; margin-bottom: 24px; line-height: 1.4; }
            .key-box { background: #21242d; border: 1.5px solid #6366f1; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
            .key-label { font-size: 10.5px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
            .key-code { font-family: monospace; font-size: 20px; font-weight: 800; color: #818cf8; letter-spacing: 1px; user-select: all; }
            .copy-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.15s ease; margin-bottom: 12px; }
            .copy-btn:hover { background: #4f46e5; }
            .meta-details { font-size: 11.5px; color: #64748b; line-height: 1.6; border-top: 1px solid #282c35; padding-top: 16px; margin-top: 16px; text-align: left; }
          </style>
        </head>
        <body>
          <div class="success-card">
            <div class="check-badge">✓</div>
            <h2>Payment Successful!</h2>
            <p class="sub">Thank you for supporting TabBox! Your <b>TabBox Pro <?php echo ucfirst($tier); ?></b> license has been activated.</p>
            
            <div class="key-box">
              <div class="key-label">Your TabBox Pro License Key</div>
              <div class="key-code" id="key-text"><?php echo htmlspecialchars($foundKey); ?></div>
            </div>

            <button class="copy-btn" id="copy-btn" onclick="copyKey()">📋 Copy License Key</button>

            <div class="meta-details">
              <div>Customer: <b><?php echo htmlspecialchars($customerEmail); ?></b></div>
              <div>Reference: <code><?php echo htmlspecialchars($reference); ?></code></div>
              <div>Plan: <b><?php echo ucfirst($tier); ?> (All 4 Modes Unlocked)</b></div>
              <div style="margin-top:6px; color:#94a3b8;"><b>How to activate:</b> Open the TabBox side panel in Chrome, click "Upgrade", paste your key into the activation box, and click "Activate".</div>
            </div>
          </div>
          <script>
            function copyKey() {
              const text = document.getElementById('key-text').innerText;
              navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('copy-btn');
                btn.innerText = '✓ Copied to Clipboard!';
                btn.style.background = '#10b981';
                setTimeout(() => {
                  btn.innerText = '📋 Copy License Key';
                  btn.style.background = '';
                }, 2500);
              });
            }
          </script>
        </body>
        </html>
        <?php
        exit;
    }

    // ========================================================================
    // 4. CHECKOUT PORTAL & ROUTING
    // ========================================================================
    case 'checkout': {
        $tier = strtolower($_GET['tier'] ?? $input['tier'] ?? 'lifetime');
        $email = trim($_GET['email'] ?? $input['email'] ?? '');
        $tierName = ($tier === 'annual' || $tier === 'year') ? 'Micro-Annual ($4/yr)' : 'Lifetime Deal ($10)';
        $tierPrice = ($tier === 'annual' || $tier === 'year') ? '$4.00' : '$10.00';
        $tierNgn = ($tier === 'annual' || $tier === 'year') ? '₦6,000' : '₦15,000';
        $amountKobo = ($tier === 'annual' || $tier === 'year') ? 600000 : 1500000;

        // If direct Paystack redirect requested
        if (isset($_GET['redirect']) && $_GET['redirect'] === 'true' && isset($_GET['direct'])) {
            header("Location: https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=paystack_init&tier={$tier}&redirect=true");
            exit;
        }

        // Render Hosted Checkout Portal
        header('Content-Type: text/html; charset=utf-8');
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
            .checkout-card { background: #181a20; border: 1px solid #282c35; border-radius: 16px; max-width: 480px; width: 100%; padding: 30px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            .badge { display: inline-block; padding: 4px 10px; background: rgba(99, 102, 241, 0.15); color: #818cf8; border-radius: 20px; font-size: 11px; font-weight: 700; margin-bottom: 12px; }
            h2 { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
            p.sub { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
            .order-summary { background: #21242d; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #2f333f; }
            .order-title { font-weight: 700; font-size: 14px; }
            .order-price { font-size: 18px; font-weight: 800; color: #818cf8; }
            .input-group { margin-bottom: 18px; }
            .input-label { display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 6px; }
            .email-input { width: 100%; padding: 11px 14px; background: #21242d; border: 1px solid #333842; border-radius: 8px; color: #fff; font-size: 14px; outline: none; }
            .email-input:focus { border-color: #6366f1; }
            .payment-options { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
            .pay-btn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 13px 18px; border-radius: 8px; font-size: 14px; font-weight: 700; text-decoration: none; border: none; cursor: pointer; text-align: center; transition: all 0.15s ease; }
            .btn-paystack { background: linear-gradient(135deg, #09a5db, #0284c7); color: #fff; width: 100%; }
            .btn-paystack:hover { opacity: 0.95; transform: translateY(-1px); }
            .btn-stripe { background: #262933; color: #cbd5e1; border: 1px solid #3a3f4d; }
            .btn-stripe:hover { background: #2f3442; color: #fff; }
            .bank-box { background: #13151b; border: 1px dashed #333842; border-radius: 10px; padding: 14px; font-size: 12px; line-height: 1.6; color: #cbd5e1; margin-top: 10px; }
            .bank-title { font-weight: 700; color: #f8fafc; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
            .footer-note { font-size: 11px; color: #64748b; text-align: center; margin-top: 18px; line-height: 1.4; }
          </style>
          <script src="https://js.paystack.co/v1/inline.js"></script>
        </head>
        <body>
          <div class="checkout-card">
            <div class="badge">⚡ SECURE CHECKOUT</div>
            <h2>Upgrade to TabBox Pro</h2>
            <p class="sub">Choose your payment option to unlock all 4 architecture modes and unlimited workspaces.</p>

            <div class="order-summary">
              <div class="order-title">TabBox Pro <?php echo htmlspecialchars($tierName); ?></div>
              <div class="order-price"><?php echo htmlspecialchars($tierPrice); ?> <small style="font-size:11.5px; color:#94a3b8;">(<?php echo htmlspecialchars($tierNgn); ?>)</small></div>
            </div>

            <div class="input-group">
              <label class="input-label" for="cust-email">Your Email Address (for license delivery):</label>
              <input type="email" id="cust-email" class="email-input" placeholder="e.g. you@example.com" value="<?php echo htmlspecialchars($email); ?>" />
            </div>

            <div class="payment-options">
              <button class="pay-btn btn-paystack" id="paystack-popup-btn" onclick="payWithPaystack()">
                💳 Pay with Paystack (Cards, Apple Pay, Transfer)
              </button>
              <a href="<?php echo htmlspecialchars($stripeLifetimeUrl); ?>" target="_blank" class="pay-btn btn-stripe">
                🌍 International Stripe / Card
              </a>
            </div>

            <div class="bank-box">
              <div class="bank-title">🏛️ Direct Bank Transfer (Nigeria / NGN)</div>
              <div>Account Name: <b>Komunis Concept</b></div>
              <div>Amount: <b><?php echo htmlspecialchars($tierNgn); ?></b> (or $10)</div>
              <div style="margin-top:6px; color:#94a3b8;">After transfer, send proof to <b>support@komunisconcept.org.ng</b> for instant manual activation.</div>
            </div>

            <div class="footer-note">
              🔒 Powered by Paystack (256-Bit SSL) • Instant License Key Delivery • Komunis Concept
            </div>
          </div>

          <script>
            function payWithPaystack() {
              const email = document.getElementById('cust-email').value.trim();
              if (!email || !email.includes('@')) {
                alert('Please enter a valid email address.');
                document.getElementById('cust-email').focus();
                return;
              }

              const handler = PaystackPop.setup({
                key: '<?php echo $paystackPublicKey; ?>',
                email: email,
                amount: <?php echo $amountKobo; ?>,
                currency: 'NGN',
                metadata: {
                  tier: '<?php echo $tier; ?>',
                  product: 'TabBox Pro'
                },
                callback: function(response) {
                  window.location.href = 'license_verify.php?action=paystack_verify&reference=' + encodeURIComponent(response.reference);
                },
                onClose: function() {
                  console.log('Payment modal closed');
                }
              });
              handler.openIframe();
            }
          </script>
        </body>
        </html>
        <?php
        exit;
    }

    // ========================================================================
    // 5. PAYSTACK WEBHOOK
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
            $customerEmail = strtolower(trim($data['customer']['email'] ?? 'customer@tabbox.pro'));
            $amountKobo = $data['amount'] ?? 0;
            $tier = ($amountKobo <= 650000) ? 'annual' : 'lifetime';

            $newKey = generateSignedKey($tier, $signingSalt);
            $licenses = getLicenses($licensesFile);
            $licenses[$newKey] = [
                'tier' => $tier,
                'email' => $customerEmail,
                'created_at' => date('c'),
                'expires_at' => ($tier === 'annual') ? date('c', strtotime('+1 year')) : null,
                'status' => 'active',
                'reference' => $data['reference'] ?? 'webhook',
                'amount_paid' => $amountKobo / 100,
                'channel' => 'paystack_webhook'
            ];
            saveLicenses($licensesFile, $licenses);
            @file_put_contents($logFile, date('c') . " - Paystack Webhook: {$newKey} issued to {$customerEmail}\n", FILE_APPEND);
        }

        echo json_encode(['status' => 'received']);
        exit;
    }

    // ========================================================================
    // 6. ADMIN KEY GENERATOR
    // ========================================================================
    case 'generate': {
        header('Content-Type: application/json; charset=utf-8');
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
    // 7. STATUS & METADATA
    // ========================================================================
    case 'pricing':
    case 'status':
    default: {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'service' => 'TabBox Pro Licensing Engine',
            'provider' => 'Komunis Concept (komunisconcept.org.ng)',
            'version' => '2.0.0',
            'status' => 'online',
            'payment_gateways' => ['paystack', 'stripe', 'bank_transfer'],
            'pricing' => [
                'free' => [
                    'name' => 'Free Forever',
                    'price' => '$0',
                    'features' => ['Chrome Native Side Panel', '2-6 Bento columns', 'Search', 'Tab Snooze']
                ],
                'pro_annual' => [
                    'name' => 'Pro Micro-Annual',
                    'price' => '$4.00 / year (₦6,000)',
                    'checkout_url' => "https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=checkout&tier=annual&redirect=true"
                ],
                'pro_lifetime' => [
                    'name' => 'Pro Lifetime Deal',
                    'price' => '$10.00 one-time (₦15,000)',
                    'checkout_url' => "https://komunisconcept.org.ng/tabbox-auto/license_verify.php?action=checkout&tier=lifetime&redirect=true"
                ]
            ],
            'trial_policy' => '7-day full reverse trial included upon initial install.'
        ], JSON_PRETTY_PRINT);
        exit;
    }
}
