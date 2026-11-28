<?php
// Free Templates download handler. No login.
//   /templates/files/<slug>/<slug>.<ext>  is rewritten here by .htaccess (?s=<slug>&f=<ext>): serves the file and counts it.
//   /templates/download.php?c=slug1,slug2  returns download counts as JSON.
// Safety: the slug must match [a-z0-9-], the extension must be docx, xlsx or pdf, and the resolved path must sit inside files/.
// Counts are kept outside the website folder (like api/views.php), so a new publish never resets them. No personal data is stored.
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

$dir = dirname(__DIR__, 2) . '/zentapdf-data';
if (!is_dir($dir) && !@mkdir($dir, 0750, true)) { $dir = __DIR__ . '/data'; @mkdir($dir, 0750, true); @file_put_contents("$dir/.htaccess", "Require all denied\n"); }
$countFile = "$dir/downloads.json";
$okSlug = fn($s) => is_string($s) && strlen($s) <= 100 && preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $s);

function counts_update($file, $slug, $ext) {
  $fh = @fopen($file, 'c+'); if (!$fh) return;
  flock($fh, LOCK_EX);
  $data = json_decode(stream_get_contents($fh) ?: '{}', true) ?: [];
  $data[$slug] = ($data[$slug] ?? 0) + 1;
  $data["$slug.$ext"] = ($data["$slug.$ext"] ?? 0) + 1;
  ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($data)); fflush($fh);
  flock($fh, LOCK_UN); fclose($fh);
}

// ---- counts (JSON) ----
if (isset($_GET['c'])) {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store, max-age=0');
  $slugs = array_slice(array_values(array_filter(explode(',', (string)$_GET['c']), $okSlug)), 0, 100);
  $data = [];
  if ($slugs && is_file($countFile) && ($fh = @fopen($countFile, 'r'))) { flock($fh, LOCK_SH); $data = json_decode(stream_get_contents($fh) ?: '{}', true) ?: []; flock($fh, LOCK_UN); fclose($fh); }
  $out = [];
  foreach ($slugs as $s) $out[$s] = (int)($data[$s] ?? 0);
  echo json_encode($out);
  exit;
}

// ---- file download ----
$types = [
  'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'pdf'  => 'application/pdf',
];
$slug = $_GET['s'] ?? ''; $ext = $_GET['f'] ?? '';
if (!$okSlug($slug) || !is_string($ext) || !isset($types[$ext])) { http_response_code(400); header('Content-Type: text/plain'); echo 'Bad request'; exit; }
$base = realpath(__DIR__ . '/files');
$path = $base ? realpath("$base/$slug/$slug.$ext") : false;
if (!$path || strpos($path, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($path)) {
  http_response_code(404); header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><meta charset="utf-8"><title>Template not found</title><p>Sorry, this template file was not found. <a href="/templates/">Browse all free templates</a>.</p>';
  exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ua = strtolower($_SERVER['HTTP_USER_AGENT'] ?? '');
$bot = $ua === '' || preg_match('/bot|crawl|spider|slurp|preview|headless|lighthouse|python|curl|wget|facebookexternalhit|whatsapp/', $ua);
$range = $_SERVER['HTTP_RANGE'] ?? '';
$continued = $range !== '' && !preg_match('/^bytes=0-/', $range); // later parts of a resumed download are not counted twice
if ($method === 'GET' && !$bot && !$continued) counts_update($countFile, $slug, $ext);

$size = filesize($path);
header('Content-Type: ' . $types[$ext]);
header('Content-Disposition: attachment; filename="' . $slug . '.' . $ext . '"');
header('Content-Length: ' . $size);
header('Cache-Control: private, max-age=0, must-revalidate');
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', filemtime($path)) . ' GMT');
if ($method === 'HEAD') exit;
while (ob_get_level()) ob_end_clean();
readfile($path);
