<?php
// Returns the visitor's public IP address as JSON (used by /device-test/what-is-my-ip/). Nothing is stored.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Robots-Tag: noindex');
function pick_ip() {
  $cands = [];
  foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k) {
    if (!empty($_SERVER[$k])) foreach (explode(',', $_SERVER[$k]) as $p) $cands[] = trim($p);
  }
  foreach ($cands as $ip) if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return $ip;
  foreach ($cands as $ip) if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
  return '';
}
$ip = pick_ip();
echo json_encode([
  'ip' => $ip,
  'version' => strpos($ip, ':') !== false ? 6 : 4,
  'host' => ($ip && isset($_GET['host'])) ? @gethostbyaddr($ip) : null,
  'time' => gmdate('c'),
]);
