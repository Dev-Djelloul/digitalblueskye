<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function get_client_ip(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return $ip;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $article = trim((string) ($_GET['article'] ?? ''));
    if ($article === '') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Missing article']);
        exit;
    }

    try {
        $pdo = get_db();
        $stmt = $pdo->prepare(
            "SELECT author_name, message, created_at
             FROM article_comments
             WHERE article_slug = :article AND status = 'approved'
             ORDER BY created_at DESC, id DESC
             LIMIT 100"
        );
        $stmt->execute([':article' => $article]);
        $comments = $stmt->fetchAll();
        echo json_encode(['ok' => true, 'comments' => $comments]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Server error']);
    }
    exit;
}

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

// Honeypot field (bot trap).
if (!empty($input['website'])) {
    http_response_code(200);
    echo json_encode(['ok' => true, 'status' => 'ignored']);
    exit;
}

$name = trim((string) ($input['name'] ?? ''));
$email = trim((string) ($input['email'] ?? ''));
$message = trim((string) ($input['message'] ?? ''));
$article = trim((string) ($input['article'] ?? ''));
$pageUrl = trim((string) ($input['page_url'] ?? ''));

if ($name === '' || $email === '' || $message === '' || $article === '' || $pageUrl === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Missing required fields']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Invalid email']);
    exit;
}

if (mb_strlen($message) > COMMENTS_MAX_LENGTH) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Message too long']);
    exit;
}

$ip = get_client_ip();
$userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 255);

try {
    $pdo = get_db();

    // Basic rate limiting by IP.
    $limitStmt = $pdo->prepare(
        'SELECT created_at FROM article_comments WHERE ip_address = :ip ORDER BY created_at DESC LIMIT 1'
    );
    $limitStmt->execute([':ip' => $ip]);
    $last = $limitStmt->fetchColumn();
    if ($last && COMMENTS_RATE_LIMIT_MINUTES > 0) {
        $lastTime = strtotime($last);
        $minDelay = COMMENTS_RATE_LIMIT_MINUTES * 60;
        if (time() - $lastTime < $minDelay) {
            http_response_code(429);
            echo json_encode(['ok' => false, 'error' => 'Too many requests']);
            exit;
        }
    }

    $status = COMMENTS_REQUIRE_APPROVAL ? 'pending' : 'approved';
    $stmt = $pdo->prepare(
        'INSERT INTO article_comments (article_slug, page_url, author_name, author_email, message, status, created_at, ip_address, user_agent)
         VALUES (:article_slug, :page_url, :author_name, :author_email, :message, :status, :created_at, :ip_address, :user_agent)'
    );
    $stmt->execute([
        ':article_slug' => $article,
        ':page_url' => $pageUrl,
        ':author_name' => $name,
        ':author_email' => $email,
        ':message' => $message,
        ':status' => $status,
        ':created_at' => date('Y-m-d H:i:s'),
        ':ip_address' => $ip,
        ':user_agent' => $userAgent,
    ]);

    echo json_encode(['ok' => true, 'status' => $status]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error']);
}
