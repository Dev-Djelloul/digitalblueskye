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
$language = substr(trim((string) ($input['language'] ?? '')), 0, 8);
$theme = substr(trim((string) ($input['theme'] ?? '')), 0, 16);
$pageUrl = trim((string) ($input['page_url'] ?? ''));

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
        'INSERT INTO consent_logs (consent_id, analytics, marketing, language, theme, created_at, ip_address, user_agent, page_url)
         VALUES (:consent_id, :analytics, :marketing, :language, :theme, :created_at, :ip_address, :user_agent, :page_url)'
    );
    $stmt->execute([
        ':consent_id' => $consentId,
        ':analytics' => $analytics,
        ':marketing' => $marketing,
        ':language' => $language !== '' ? $language : null,
        ':theme' => $theme !== '' ? $theme : null,
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
