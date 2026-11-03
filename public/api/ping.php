<?php
// Tiny response for latency (ping) measurements. Nothing is stored.
header('Content-Type: text/plain'); header('Cache-Control: no-store, max-age=0'); header('X-Robots-Tag: noindex');
echo 'ok';
