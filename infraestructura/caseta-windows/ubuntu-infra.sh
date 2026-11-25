#!/bin/sh
# Instalar root:root, 0755 en /usr/local/sbin/mj-infra-ubuntu.
# Solo se aceptan dos argumentos fijos; jamás reinicia servicios activos.
set -eu
case "${1:-}" in
  status) ;;
  recover)
    for service in asterisk misionjardines-caseta; do
      if ! systemctl is-active --quiet "$service"; then
        systemctl start "$service" >/dev/null 2>&1 || true
      fi
    done ;;
  *) exit 2 ;;
esac
a=false; b=false
systemctl is-active --quiet asterisk && a=true
systemctl is-active --quiet misionjardines-caseta && b=true
printf '{"asterisk":%s,"agente":%s}\n' "$a" "$b"
