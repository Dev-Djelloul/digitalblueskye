<?php
declare(strict_types=1);

// Basic configuration for database and comment settings.
// Prefer environment variables in production.

// Optional local secrets file(s), loaded before getenv fallbacks.
// Keep these files out of public web root whenever possible.
$secretsCandidates = [
    dirname(__DIR__, 2) . '/ai-secrets.php',
    dirname(__DIR__) . '/ai-secrets.php',
    __DIR__ . '/ai-secrets.php',
];

foreach ($secretsCandidates as $secretsFile) {
    if (is_file($secretsFile)) {
        require_once $secretsFile;
        break;
    }
}

date_default_timezone_set('Europe/Paris');

define('DB_HOST', getenv('DB_HOST') ?: 'sql300.infinityfree.com');
define('DB_NAME', getenv('DB_NAME') ?: 'if0_40780692_digitalblueskye');
define('DB_USER', getenv('DB_USER') ?: 'if0_40780692');
define('DB_PASS', getenv('DB_PASS') ?: 'DUVCqEl8epmL');
define('DB_CHARSET', 'utf8mb4');

// Comment settings.
define('COMMENTS_REQUIRE_APPROVAL', getenv('COMMENTS_REQUIRE_APPROVAL') === 'true');
define('COMMENTS_MAX_LENGTH', 2000);

// AI assistant settings.
define(
    'OPENAI_API_KEY',
    defined('OPENAI_API_KEY') ? OPENAI_API_KEY : (getenv('OPENAI_API_KEY') ?: '')
);
define(
    'OPENAI_MODEL',
    defined('OPENAI_MODEL') ? OPENAI_MODEL : (getenv('OPENAI_MODEL') ?: 'gpt-4.1-mini')
);
define(
    'OPENAI_PROJECT',
    defined('OPENAI_PROJECT') ? OPENAI_PROJECT : (getenv('OPENAI_PROJECT') ?: '')
);

header('Content-Type: application/json; charset=utf-8');
