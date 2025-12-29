<?php
declare(strict_types=1);

require __DIR__ . "/config/contact-db.php";

header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
  http_response_code(405);
  echo json_encode([
    "success" => false,
    "message" => "Method not allowed."
  ]);
  exit;
}

if (!empty($_POST["website"] ?? "")) {
  http_response_code(400);
  echo json_encode([
    "success" => false,
    "message" => "Invalid submission."
  ]);
  exit;
}

$firstName = trim((string) ($_POST["user_first_name"] ?? ""));
$lastName = trim((string) ($_POST["user_last_name"] ?? ""));
$email = trim((string) ($_POST["user_email"] ?? ""));
$message = trim((string) ($_POST["message"] ?? ""));

if ($firstName === "" || $lastName === "" || $email === "" || $message === "") {
  http_response_code(422);
  echo json_encode([
    "success" => false,
    "message" => "Missing required fields."
  ]);
  exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  http_response_code(422);
  echo json_encode([
    "success" => false,
    "message" => "Invalid email."
  ]);
  exit;
}

if (strlen($message) > 5000) {
  http_response_code(422);
  echo json_encode([
    "success" => false,
    "message" => "Message too long."
  ]);
  exit;
}

try {
  date_default_timezone_set("Europe/Paris");
  mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
  $mysqli = new mysqli($dbHost, $dbUser, $dbPass, $dbName);
  $mysqli->set_charset("utf8mb4");

  $stmt = $mysqli->prepare(
    "INSERT INTO {$dbTable} (first_name, last_name, email, message, ip_address, user_agent, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  $ipAddress = $_SERVER["REMOTE_ADDR"] ?? null;
  $userAgent = $_SERVER["HTTP_USER_AGENT"] ?? null;

  $submittedAt = date("Y-m-d H:i:s");
  $stmt->bind_param(
    "sssssss",
    $firstName,
    $lastName,
    $email,
    $message,
    $ipAddress,
    $userAgent,
    $submittedAt
  );
  $stmt->execute();
  $stmt->close();
  $mysqli->close();

  echo json_encode([
    "success" => true,
    "message" => "Saved."
  ]);
} catch (Throwable $error) {
  http_response_code(500);
  echo json_encode([
    "success" => false,
    "message" => "Server error."
  ]);
}
