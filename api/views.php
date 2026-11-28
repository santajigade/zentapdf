<?php
// Guide page view counter. POST ?p=<slug> adds one view and returns the count; GET ?p=a,b,c returns counts.
// Counts are kept outside the website folder, so a new publish never resets them. No personal data is stored.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Robots-Tag: noindex');
$dir = dirname(__DIR__, 2) . '/zentapdf-data';
if (!is_dir($dir) && !@mkdir($dir, 0750, true)) { $dir = __DIR__ . '/data'; @mkdir($dir, 0750, true); @file_put_contents("$dir/.htaccess", "Require all denied\n"); }
$file = "$dir/views.json";
$slugs = array_slice(array_filter(explode(',', (string)($_GET['p'] ?? '')), fn($s) => preg_match('/^[a-z0-9-]{1,90}$/', $s)), 0, 100);
if (!$slugs) { http_response_code(400); echo '{}'; exit; }
$fh = @fopen($file, 'c+');
if (!$fh) { http_response_code(500); echo '{}'; exit; }
flock($fh, $_SERVER['REQUEST_METHOD'] === 'POST' ? LOCK_EX : LOCK_SH);
$data = json_decode(stream_get_contents($fh) ?: '{}', true) ?: [];
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$bot = $ua === '' || preg_match('/bot|crawl|spider|slurp|preview|headless|lighthouse|python|curl|wget/', $ua);
if ($_SERVER['REQUEST_METHOD'] === 'POST' && count($slugs) === 1 && !$bot && ($_SERVER['HTTP_X_ZENTA'] ?? '') === 'view') {
  $data[$slugs[0]] = ($data[$slugs[0]] ?? 0) + 1;
  ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($data)); fflush($fh);
}
flock($fh, LOCK_UN); fclose($fh);
$out = [];
foreach ($slugs as $s) $out[$s] = (int)($data[$s] ?? 0);
echo json_encode($out);
