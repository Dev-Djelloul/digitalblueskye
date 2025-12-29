<?php
declare(strict_types=1);

// Basic configuration for database and comment settings.
// Prefer environment variables in production.

date_default_timezone_set('Europe/Paris');

define('DB_HOST', getenv('DB_HOST') ?: 'sql300.infinityfree.com');
define('DB_NAME', getenv('DB_NAME') ?: 'if0_40780692_digitalblueskye');
define('DB_USER', getenv('DB_USER') ?: 'if0_40780692');
define('DB_PASS', getenv('DB_PASS') ?: 'DUVCqEl8epmL');
define('DB_CHARSET', 'utf8mb4');

// Comment settings.
define('COMMENTS_REQUIRE_APPROVAL', getenv('COMMENTS_REQUIRE_APPROVAL') === 'true');
define('COMMENTS_MAX_LENGTH', 2000);

header('Content-Type: application/json; charset=utf-8');
