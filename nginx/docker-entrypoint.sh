#!/bin/sh
# Generate a self-signed TLS cert on first run if none exists.
# Persists to /etc/nginx/ssl (mount a volume there to survive rebuilds).
set -e

SSL_DIR="/etc/nginx/ssl"
CRT="${SSL_DIR}/hecate.crt"
KEY="${SSL_DIR}/hecate.key"

mkdir -p "${SSL_DIR}"

if [ ! -f "${CRT}" ] || [ ! -f "${KEY}" ]; then
  echo "[hecate] Generating self-signed SSL certificate (RSA-2048, 365d)…"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "${KEY}" \
    -out "${CRT}" \
    -days 365 \
    -subj "/CN=hecate/O=Hecate/C=US" \
    >/dev/null 2>&1
  chmod 600 "${KEY}"
  echo "[hecate] Certificate written to ${CRT}"
else
  echo "[hecate] Reusing existing certificate at ${CRT}"
fi
