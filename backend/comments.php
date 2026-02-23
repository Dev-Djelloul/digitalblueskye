<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function get_client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function reaction_columns(): array {
    return [
        'like' => 'reactions_like',
        'smile' => 'reactions_smile',
        'dislike' => 'reactions_dislike',
        'clap' => 'reactions_clap',
        'blueheart' => 'reactions_blueheart',
    ];
}

function format_reactions(array $row): array {
    return [
        'like' => (int) ($row['reactions_like'] ?? 0),
        'smile' => (int) ($row['reactions_smile'] ?? 0),
        'dislike' => (int) ($row['reactions_dislike'] ?? 0),
        'clap' => (int) ($row['reactions_clap'] ?? 0),
        'blueheart' => (int) ($row['reactions_blueheart'] ?? 0),
    ];
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
            "SELECT id, parent_id, author_name, message, likes_count,
                    reactions_like, reactions_smile, reactions_dislike, reactions_clap, reactions_blueheart,
                    created_at
             FROM article_comments
             WHERE article_slug = :article AND status = 'approved'
             ORDER BY created_at ASC, id ASC
             LIMIT 300"
        );
        $stmt->execute([':article' => $article]);
        $comments = $stmt->fetchAll();

        $normalized = array_map(static function (array $comment): array {
            $comment['reactions'] = format_reactions($comment);
            return $comment;
        }, $comments);

        echo json_encode(['ok' => true, 'comments' => $normalized]);
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

if ($action === 'react' || $action === 'like') {
    $article = trim((string) ($input['article'] ?? ''));
    $commentId = (int) ($input['comment_id'] ?? 0);
    $reaction = trim((string) ($input['reaction'] ?? ($action === 'like' ? 'like' : '')));
    $operation = trim((string) ($input['operation'] ?? 'add')); // add|remove

    if ($article === '' || $commentId <= 0 || $reaction === '') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Missing required fields']);
        exit;
    }

    $map = reaction_columns();
    if (!isset($map[$reaction])) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Invalid reaction']);
        exit;
    }

    $delta = $operation === 'remove' ? -1 : 1;
    $column = $map[$reaction];

    try {
        $pdo = get_db();

        $updateSql = "UPDATE article_comments
                      SET {$column} = GREATEST({$column} + :delta, 0)";
        // Keep backward compatibility with likes_count.
        if ($reaction === 'like') {
            $updateSql .= ", likes_count = GREATEST(likes_count + :delta, 0)";
        }
        $updateSql .= " WHERE id = :id AND article_slug = :article AND status = :status";

        $update = $pdo->prepare($updateSql);
        $update->execute([
            ':delta' => $delta,
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
            'SELECT likes_count, reactions_like, reactions_smile, reactions_dislike, reactions_clap, reactions_blueheart
             FROM article_comments
             WHERE id = :id AND article_slug = :article
             LIMIT 1'
        );
        $select->execute([':id' => $commentId, ':article' => $article]);
        $row = $select->fetch() ?: [];

        echo json_encode([
            'ok' => true,
            'likes_count' => (int) ($row['likes_count'] ?? 0),
            'reactions' => format_reactions($row),
        ]);
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
        'INSERT INTO article_comments (
            article_slug, page_url, parent_id, author_name, author_email, message,
            likes_count, reactions_like, reactions_smile, reactions_dislike, reactions_clap, reactions_blueheart,
            status, created_at, ip_address, user_agent
         )
         VALUES (
            :article_slug, :page_url, :parent_id, :author_name, :author_email, :message,
            :likes_count, :reactions_like, :reactions_smile, :reactions_dislike, :reactions_clap, :reactions_blueheart,
            :status, :created_at, :ip_address, :user_agent
         )'
    );
    $stmt->execute([
        ':article_slug' => $article,
        ':page_url' => $pageUrl,
        ':parent_id' => $parentId,
        ':author_name' => $name,
        ':author_email' => $email,
        ':message' => $message,
        ':likes_count' => 0,
        ':reactions_like' => 0,
        ':reactions_smile' => 0,
        ':reactions_dislike' => 0,
        ':reactions_clap' => 0,
        ':reactions_blueheart' => 0,
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
