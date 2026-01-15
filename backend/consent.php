<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
    exit;
}

$consentId = trim((string) ($input['consent_id'] ?? ''));
$analytics = !empty($input['analytics']) ? 1 : 0;
$marketing = !empty($input['marketing']) ? 1 : 0;
$consentGiven = ($analytics === 1 || $marketing === 1) ? 'yes' : 'no';
$language = substr(trim((string) ($input['language'] ?? '')), 0, 8);
$theme = substr(trim((string) ($input['theme'] ?? '')), 0, 16);
$viewportWidth = isset($input['viewport_width']) ? (int) $input['viewport_width'] : null;
$viewportHeight = isset($input['viewport_height']) ? (int) $input['viewport_height'] : null;
$devicePixelRatio = isset($input['device_pixel_ratio']) ? (float) $input['device_pixel_ratio'] : null;
$screenWidth = isset($input['screen_width']) ? (int) $input['screen_width'] : null;
$screenHeight = isset($input['screen_height']) ? (int) $input['screen_height'] : null;
$navigatorLanguage = substr(trim((string) ($input['navigator_language'] ?? '')), 0, 16);
$inAppBrowser = array_key_exists('in_app_browser', $input) ? (!empty($input['in_app_browser']) ? 1 : 0) : null;
$uaData = null;
if (array_key_exists('ua_data', $input)) {
    if (is_array($input['ua_data'])) {
        $uaData = json_encode($input['ua_data'], JSON_UNESCAPED_UNICODE);
    } else {
        $uaData = trim((string) $input['ua_data']);
    }
    if ($uaData === '') {
        $uaData = null;
    }
}
$pageUrl = trim((string) ($input['page_url'] ?? ''));

if ($viewportWidth !== null && $viewportWidth <= 0) {
    $viewportWidth = null;
}
if ($viewportHeight !== null && $viewportHeight <= 0) {
    $viewportHeight = null;
}
if ($devicePixelRatio !== null && $devicePixelRatio <= 0) {
    $devicePixelRatio = null;
}
if ($screenWidth !== null && $screenWidth <= 0) {
    $screenWidth = null;
}
if ($screenHeight !== null && $screenHeight <= 0) {
    $screenHeight = null;
}

if ($consentId === '' || $pageUrl === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Missing required fields']);
    exit;
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 255);

try {
    $pdo = get_db();
    $stmt = $pdo->prepare(
        'INSERT INTO consent_logs (
            consent_id,
            consent_given,
            analytics,
            marketing,
            language,
            theme,
            viewport_width,
            viewport_height,
            device_pixel_ratio,
            screen_width,
            screen_height,
            navigator_language,
            ua_data,
            in_app_browser,
            created_at,
            ip_address,
            user_agent,
            page_url
        ) VALUES (
            :consent_id,
            :consent_given,
            :analytics,
            :marketing,
            :language,
            :theme,
            :viewport_width,
            :viewport_height,
            :device_pixel_ratio,
            :screen_width,
            :screen_height,
            :navigator_language,
            :ua_data,
            :in_app_browser,
            :created_at,
            :ip_address,
            :user_agent,
            :page_url
        )'
    );
    $stmt->execute([
        ':consent_id' => $consentId,
        ':consent_given' => $consentGiven,
        ':analytics' => $analytics,
        ':marketing' => $marketing,
        ':language' => $language !== '' ? $language : null,
        ':theme' => $theme !== '' ? $theme : null,
        ':viewport_width' => $viewportWidth,
        ':viewport_height' => $viewportHeight,
        ':device_pixel_ratio' => $devicePixelRatio,
        ':screen_width' => $screenWidth,
        ':screen_height' => $screenHeight,
        ':navigator_language' => $navigatorLanguage !== '' ? $navigatorLanguage : null,
        ':ua_data' => $uaData,
        ':in_app_browser' => $inAppBrowser,
        ':created_at' => date('Y-m-d H:i:s'),
        ':ip_address' => $ip,
        ':user_agent' => $userAgent,
        ':page_url' => $pageUrl,
    ]);
    echo json_encode(['ok' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error']);
}
