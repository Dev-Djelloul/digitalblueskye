<?php
declare(strict_types=1);

/**
 * @deprecated Pile PHP/MariaDB legacy (cible InfinityFree/XAMPP), non exécutée
 * en production dans l'architecture actuelle Netlify + Cloudflare Workers + D1.
 * Voir backend/README-LEGACY.md et docs/ARCHITECTURE.md.
 */

require_once __DIR__ . '/db.php';

function assistant_client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function assistant_user_agent(): string {
    return substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 255);
}

function normalize_language(?string $language): string {
    $value = strtolower(trim((string) $language));
    return str_starts_with($value, 'en') ? 'en' : 'fr';
}

function detect_intent(string $text): string {
    $value = strtolower($text);

    if (preg_match('/profil|profile|chef de projet|project manager|\bpm\b/u', $value)) {
        return 'profile';
    }

    if (preg_match('/projet|project|portfolio|realisations|réalisations/u', $value)) {
        return 'projects';
    }

    if (preg_match('/rgpd|gdpr|gouvernance|governance|\bia\b|\bai\b|conformit|compliance/u', $value)) {
        return 'governance';
    }

    if (preg_match('/contact|mission|devis|brief|quote|hire|work/u', $value)) {
        return 'contact';
    }

    return 'fallback';
}

function intent_cta(string $intent, string $language): array {
    $isEnglish = $language === 'en';

    return match ($intent) {
        'profile' => [
            'label' => $isEnglish ? 'View profile' : 'Voir mon profil',
            'href' => '/pages/about.html',
        ],
        'projects' => [
            'label' => $isEnglish ? 'View projects' : 'Voir les projets',
            'href' => '/pages/visualTourProjects.html',
        ],
        'governance' => [
            'label' => $isEnglish ? 'Open AI governance' : 'Consulter Gouvernance IA',
            'href' => '/pages/gouvernance-ia.html',
        ],
        'contact' => [
            'label' => $isEnglish ? 'Contact Digitalblueskye' : 'Contacter Digitalblueskye',
            'href' => '/pages/contact.html',
        ],
        default => [
            'label' => $isEnglish ? 'Go to contact' : 'Aller au contact',
            'href' => '/pages/contact.html',
        ],
    };
}

function fallback_reply(string $intent, string $language): string {
    $isEnglish = $language === 'en';

    return match ($intent) {
        'profile' => $isEnglish
            ? 'Start with my profile to review my background, skills, and digital project management approach.'
            : 'Commencez par mon profil pour voir mon parcours, mes competences et ma methode de pilotage digital.',
        'projects' => $isEnglish
            ? 'I recommend a visual tour first, then project details to review scope, execution, and deliverables.'
            : 'Je vous recommande un tour visuel puis le detail des projets pour voir cadrage, execution et livrables.',
        'governance' => $isEnglish
            ? 'The AI governance page details framework, compliance, and human validation principles.'
            : 'La page Gouvernance IA detaille le cadre d\'usage, la conformite et la validation humaine.',
        'contact' => $isEnglish
            ? 'Use the contact form to share your context, timeline, and expected outcomes.'
            : 'Utilisez le formulaire de contact pour partager votre contexte, delai et resultats attendus.',
        default => $isEnglish
            ? 'I can route you quickly: profile, projects, AI governance, or contact.'
            : 'Je peux vous orienter rapidement: profil, projets, gouvernance IA ou contact.',
    };
}

function log_assistant_event(
    string $eventType,
    ?string $eventValue,
    ?string $sessionId,
    ?string $language,
    ?string $pageUrl,
    ?array $meta = null
): void {
    try {
        $pdo = get_db();
        $stmt = $pdo->prepare(
            'INSERT INTO ai_assistant_events (
                session_id,
                event_type,
                event_value,
                language,
                page_url,
                meta,
                created_at,
                ip_address,
                user_agent
            ) VALUES (
                :session_id,
                :event_type,
                :event_value,
                :language,
                :page_url,
                :meta,
                :created_at,
                :ip_address,
                :user_agent
            )'
        );

        $stmt->execute([
            ':session_id' => $sessionId !== '' ? substr((string) $sessionId, 0, 64) : null,
            ':event_type' => substr($eventType, 0, 64),
            ':event_value' => $eventValue !== null ? substr($eventValue, 0, 500) : null,
            ':language' => $language !== null ? substr($language, 0, 8) : null,
            ':page_url' => $pageUrl !== null ? substr($pageUrl, 0, 255) : null,
            ':meta' => $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
            ':created_at' => date('Y-m-d H:i:s'),
            ':ip_address' => assistant_client_ip(),
            ':user_agent' => assistant_user_agent(),
        ]);
    } catch (Throwable $e) {
        // Silent fail: analytics logging must not block assistant usage.
    }
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

$mode = strtolower(trim((string) ($input['mode'] ?? 'chat')));
$language = normalize_language((string) ($input['language'] ?? 'fr'));
$pageUrl = trim((string) ($input['page_url'] ?? ''));
$sessionId = trim((string) ($input['session_id'] ?? ''));

if ($mode === 'event') {
    $eventType = trim((string) ($input['event_type'] ?? 'unknown'));
    $eventValue = isset($input['event_value']) ? trim((string) $input['event_value']) : null;
    $meta = isset($input['meta']) && is_array($input['meta']) ? $input['meta'] : null;

    if ($eventType === '') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Missing event_type']);
        exit;
    }

    log_assistant_event($eventType, $eventValue, $sessionId, $language, $pageUrl, $meta);
    echo json_encode(['ok' => true]);
    exit;
}

$message = trim((string) ($input['message'] ?? ''));
$history = $input['history'] ?? [];

if ($message === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Missing message']);
    exit;
}

if (!is_array($history)) {
    $history = [];
}

$intent = detect_intent($message);
$cta = intent_cta($intent, $language);

log_assistant_event('user_message', $message, $sessionId, $language, $pageUrl, ['intent' => $intent]);

$openAiKey = defined('OPENAI_API_KEY') ? (string) OPENAI_API_KEY : '';
$model = defined('OPENAI_MODEL') ? (string) OPENAI_MODEL : 'gpt-4.1-mini';
$openAiProject = defined('OPENAI_PROJECT') ? trim((string) OPENAI_PROJECT) : '';

if ($openAiKey === '') {
    $reply = fallback_reply($intent, $language);
    log_assistant_event('assistant_reply_fallback', $reply, $sessionId, $language, $pageUrl, ['reason' => 'missing_api_key']);

    echo json_encode([
        'ok' => true,
        'reply' => $reply,
        'cta' => $cta,
        'fallback' => true,
        'fallback_reason' => 'missing_api_key',
    ]);
    exit;
}

$systemPromptFr = "Tu es BlueSkye Assistant, l'assistant du site Digitalblueskye (chef de projet digital). "
    . "Ton role: orienter le visiteur vers la bonne page et repondre de facon concise. "
    . "Priorites: projets, profil, gouvernance IA/RGPD, contact mission. "
    . "Reste factuel, clair, non marketing, 2-4 phrases max. "
    . "Ne donne aucun conseil juridique ferme. En cas de doute, proposer la page contact.";

$systemPromptEn = "You are BlueSkye Assistant for the Digitalblueskye website (digital project manager). "
    . "Your role: route visitors to the right page and answer concisely. "
    . "Priorities: projects, profile, AI/GDPR governance, contact for projects. "
    . "Be factual, clear, non-marketing, max 2-4 sentences. "
    . "Do not provide firm legal advice. When in doubt, route to contact.";

$messages = [
    [
        'role' => 'system',
        'content' => $language === 'en' ? $systemPromptEn : $systemPromptFr,
    ],
];

$maxHistoryItems = 8;
$historySlice = array_slice($history, -$maxHistoryItems);

foreach ($historySlice as $item) {
    if (!is_array($item)) {
        continue;
    }

    $role = strtolower((string) ($item['role'] ?? ''));
    $content = trim((string) ($item['content'] ?? ''));

    if ($content === '' || !in_array($role, ['user', 'assistant'], true)) {
        continue;
    }

    $messages[] = [
        'role' => $role,
        'content' => mb_substr($content, 0, 1200),
    ];
}

$messages[] = [
    'role' => 'user',
    'content' => mb_substr($message, 0, 1200),
];

$payload = [
    'model' => $model,
    'temperature' => 0.3,
    'max_tokens' => 240,
    'messages' => $messages,
];

$requestHeaders = [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $openAiKey,
];

if ($openAiProject !== '') {
    $requestHeaders[] = 'OpenAI-Project: ' . $openAiProject;
}

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => $requestHeaders,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
]);

$response = curl_exec($ch);
$curlErr = curl_error($ch);
$statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($response === false || $curlErr !== '' || $statusCode < 200 || $statusCode >= 300) {
    $openAiErrorMessage = null;
    $openAiErrorCode = null;

    if (is_string($response) && $response !== '') {
        $errorPayload = json_decode($response, true);
        if (is_array($errorPayload)) {
            $openAiErrorMessage = trim((string) ($errorPayload['error']['message'] ?? ''));
            $openAiErrorCode = trim((string) ($errorPayload['error']['code'] ?? ''));
        }
    }

    $reply = fallback_reply($intent, $language);
    log_assistant_event(
        'assistant_reply_fallback',
        $reply,
        $sessionId,
        $language,
        $pageUrl,
        [
            'reason' => 'openai_request_failed',
            'status_code' => $statusCode,
            'curl_error' => $curlErr,
            'openai_error_code' => $openAiErrorCode,
            'openai_error_message' => $openAiErrorMessage,
        ]
    );

    echo json_encode([
        'ok' => true,
        'reply' => $reply,
        'cta' => $cta,
        'fallback' => true,
        'fallback_reason' => 'openai_request_failed',
        'diagnostic' => [
            'status_code' => $statusCode,
            'curl_error' => $curlErr,
            'openai_error_code' => $openAiErrorCode,
            'openai_error_message' => $openAiErrorMessage,
        ],
    ]);
    exit;
}

$data = json_decode($response, true);
$reply = trim((string) ($data['choices'][0]['message']['content'] ?? ''));

if ($reply === '') {
    $reply = fallback_reply($intent, $language);

    echo json_encode([
        'ok' => true,
        'reply' => $reply,
        'cta' => $cta,
        'fallback' => true,
        'fallback_reason' => 'empty_openai_reply',
    ]);
    exit;
}

log_assistant_event('assistant_reply', $reply, $sessionId, $language, $pageUrl, ['intent' => $intent]);

echo json_encode([
    'ok' => true,
    'reply' => $reply,
    'cta' => $cta,
    'fallback' => false,
]);
