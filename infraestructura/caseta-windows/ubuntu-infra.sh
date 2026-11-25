#!/bin/sh
# Instalar root:root, 0755 en /usr/local/sbin/mj-infra-ubuntu.
# No reinicia servicios activos ni transmite texto libre del journal.
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
a=false; b=false; ae=false; be=false
systemctl is-active --quiet asterisk && a=true
systemctl is-active --quiet misionjardines-caseta && b=true
systemctl is-enabled --quiet asterisk && ae=true
systemctl is-enabled --quiet misionjardines-caseta && be=true
cli=null; sip1=null; sip2=null
# No confundir falta de privilegios con caída del CLI.
if [ "$(id -u)" = 0 ]; then cli=false; fi
if [ "$(id -u)" = 0 ] && asterisk -rx 'core show uptime' 2>/dev/null | grep -qi 'System uptime'; then
  cli=true; sip1=false; sip2=false
  contacts=$(asterisk -rx 'pjsip show contacts' 2>/dev/null || true)
  printf '%s\n' "$contacts" | grep -q '6001/sip:' && sip1=true
  printf '%s\n' "$contacts" | grep -q '6002/sip:' && sip2=true
fi
count_errors() {
  if [ "$(id -u)" != 0 ]; then printf null; return; fi
  logs=$(journalctl -b -u "$1" -n 30 --no-pager -o cat 2>/dev/null) || { printf null; return; }
  printf '%s\n' "$logs" | grep -Eic 'error|fail|timeout|no se pudo' || true
}
ea=$(count_errors asterisk)
eb=$(count_errors misionjardines-caseta)
printf '{"asterisk":%s,"agente":%s,"asteriskEnabled":%s,"agenteEnabled":%s,"asteriskCli":%s,"sip6001":%s,"sip6002":%s,"erroresAsterisk":%s,"erroresAgente":%s}\n' "$a" "$b" "$ae" "$be" "$cli" "$sip1" "$sip2" "$ea" "$eb"
