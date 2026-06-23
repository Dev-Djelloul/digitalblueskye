<?php
declare(strict_types=1);

/**
 * @deprecated Pile PHP/MySQL legacy (génération A, racine du projet), non
 * exécutée en production dans l'architecture actuelle Netlify + Cloudflare
 * Workers + D1. Le chemin /export-csv.php reste utilisé comme route
 * compatible, mais il est servi par cloudflare/worker-api.js, pas par ce
 * fichier. Voir docs/ARCHITECTURE.md.
 */

require __DIR__ . '/config/contact-db.php';
require __DIR__ . '/config/export-token.php';

if (EXPORT_TOKEN === '') {
  http_response_code(503);
  echo "Export disabled.";
  exit;
}

if (!hash_equals(EXPORT_TOKEN, (string) ($_GET['token'] ?? ''))) {
  http_response_code(403);
  echo "Forbidden";
  exit;
}

$table = (string) ($_GET['table'] ?? '');
$allowedTables = [
  'contact_messages' => [
    'id', 'first_name', 'last_name', 'email', 'message',
    'contact_consent', 'ip_address', 'user_agent', 'submitted_at'
  ],
  'consent_logs' => [
    'id', 'consent_id', 'consent_given', 'analytics', 'marketing', 'language', 'theme',
    'viewport_width', 'viewport_height', 'device_pixel_ratio',
    'screen_width', 'screen_height', 'navigator_language',
    'ua_data', 'in_app_browser', 'created_at', 'ip_address',
    'user_agent', 'page_url'
  ],
  'article_comments' => [
    'id', 'article_slug', 'page_url', 'author_name', 'author_email',
    'message', 'status', 'created_at', 'ip_address', 'user_agent'
  ],
];

function format_french_datetime(?string $value): string {
  if (!$value) {
    return '';
  }

  try {
    $date = new DateTime($value, new DateTimeZone('Europe/Paris'));
  } catch (Throwable $error) {
    return $value;
  }

  $months = [
    1 => 'janvier',
    2 => 'février',
    3 => 'mars',
    4 => 'avril',
    5 => 'mai',
    6 => 'juin',
    7 => 'juillet',
    8 => 'août',
    9 => 'septembre',
    10 => 'octobre',
    11 => 'novembre',
    12 => 'décembre',
  ];

  $day = (int) $date->format('j');
  $month = $months[(int) $date->format('n')] ?? $date->format('F');
  $year = $date->format('Y');
  $time = $date->format('H:i');
  $offsetHours = $date->getOffset() / 3600;
  $offsetLabel = sprintf('UTC%+d', $offsetHours);

  return sprintf('%d %s %s %s (%s)', $day, $month, $year, $time, $offsetLabel);
}

if (!array_key_exists($table, $allowedTables)) {
  http_response_code(400);
  echo "Invalid table.";
  exit;
}

try {
  mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
  $mysqli = new mysqli($dbHost, $dbUser, $dbPass, $dbName);
  $mysqli->set_charset('utf8mb4');

  $columns = $allowedTables[$table];
  $columnList = implode(', ', array_map(fn($col) => "`{$col}`", $columns));
  $sql = "SELECT {$columnList} FROM `{$table}` ORDER BY `id` DESC";
  $result = $mysqli->query($sql);

  $filename = $table . '-' . date('Ymd-His') . '.csv';
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="' . $filename . '"');

  $output = fopen('php://output', 'w');
  fputcsv($output, $columns);

  while ($row = $result->fetch_assoc()) {
    $line = [];
    foreach ($columns as $column) {
      $value = $row[$column];
      if (in_array($column, ['submitted_at', 'created_at'], true)) {
        $value = format_french_datetime($value);
      }
      if ($column === 'user_agent') {
        $value = str_replace(
          [",", "\r\n", "\r", "\n", "\""],
          [" |", " ", " ", " ", "'"],
          (string) $value
        );
      }
      if ($table === 'article_comments' && $column === 'message') {
        $value = str_replace(["\r\n", "\r", "\n"], ' ', (string) $value);
      }
      $line[] = $value;
    }
    fputcsv($output, $line);
  }

  fclose($output);
  $result->free();
  $mysqli->close();
} catch (Throwable $error) {
  http_response_code(500);
  echo "Server error.";
}
