#!/bin/sh
# Instalar root:root, 0755 en /usr/local/sbin/mj-infra-ssh.
case "${SSH_ORIGINAL_COMMAND:-}" in
  status) exec /usr/local/sbin/mj-infra-ubuntu status ;;
  recover) exec sudo -n /usr/local/sbin/mj-infra-ubuntu recover ;;
  *) exit 2 ;;
esac
