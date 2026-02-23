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
            "SELECT id, parent_id, author_name, message, likes_count, created_at
             FROM article_comments
             WHERE article_slug = :article AND status = 'approved'
             ORDER BY created_at ASC, id ASC
             LIMIT 300"
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

$action = trim((string) ($input['action'] ?? 'comment'));

if ($action === 'like') {
    $article = trim((string) ($input['article'] ?? ''));
    $commentId = (int) ($input['comment_id'] ?? 0);
    if ($article === '' || $commentId <= 0) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Missing required fields']);
        exit;
    }

    try {
        $pdo = get_db();

        $update = $pdo->prepare(
            'UPDATE article_comments
             SET likes_count = likes_count + 1
             WHERE id = :id AND article_slug = :article AND status = :status'
        );
        $update->execute([
            ':id' => $commentId,
            ':article' => $article,
            ':status' => 'approved',
        ]);

        if ($update->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Comment not found']);
            exit;
        }

        $select = $pdo->prepare(
            'SELECT likes_count FROM article_comments WHERE id = :id AND article_slug = :article LIMIT 1'
        );
        $select->execute([':id' => $commentId, ':article' => $article]);
        $liked = $select->fetch();
        $likesCount = (int) ($liked['likes_count'] ?? 0);

        echo json_encode(['ok' => true, 'likes_count' => $likesCount]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Server error']);
    }
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
$parentId = (int) ($input['parent_id'] ?? 0);
$parentId = $parentId > 0 ? $parentId : null;

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

    if ($parentId !== null) {
        $parentStmt = $pdo->prepare(
            'SELECT id FROM article_comments
             WHERE id = :parent_id AND article_slug = :article AND status = :status
             LIMIT 1'
        );
        $parentStmt->execute([
            ':parent_id' => $parentId,
            ':article' => $article,
            ':status' => 'approved',
        ]);
        if (!$parentStmt->fetch()) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'error' => 'Invalid parent comment']);
            exit;
        }
    }

    $status = COMMENTS_REQUIRE_APPROVAL ? 'pending' : 'approved';
    $stmt = $pdo->prepare(
        'INSERT INTO article_comments (article_slug, page_url, parent_id, author_name, author_email, message, likes_count, status, created_at, ip_address, user_agent)
         VALUES (:article_slug, :page_url, :parent_id, :author_name, :author_email, :message, :likes_count, :status, :created_at, :ip_address, :user_agent)'
    );
    $stmt->execute([
        ':article_slug' => $article,
        ':page_url' => $pageUrl,
        ':parent_id' => $parentId,
        ':author_name' => $name,
        ':author_email' => $email,
        ':message' => $message,
        ':likes_count' => 0,
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
