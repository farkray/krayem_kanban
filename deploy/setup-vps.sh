#!/usr/bin/env bash
# Prepara un VPS Ubuntu/Debian recién creado (cualquier proveedor). Ejecutar UNA vez, como root:
#   scp deploy/setup-vps.sh root@IP:/root/ && ssh root@IP 'bash /root/setup-vps.sh'
# Hace: instala Docker (repositorio oficial), abre solo SSH/80/443, crea el usuario `deploy`
# (con tu misma llave SSH), el directorio /opt/kanban y un cron de copias de seguridad diarias.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root." >&2; exit 1; }
. /etc/os-release
case "${ID}" in ubuntu | debian) ;; *) echo "SO no soportado: ${ID} (usa Ubuntu o Debian)." >&2; exit 1 ;; esac

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw

# --- Docker (repositorio oficial) ---
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# --- Firewall: SSH (en su puerto real), HTTP, HTTPS y HTTP/3 ---
SSH_PORT="$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')"
SSH_PORT="${SSH_PORT:-22}"
ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# --- Usuario de despliegue (sin contraseña; entra con tu llave SSH) ---
if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
fi

install -d -o deploy -g deploy /opt/kanban

# --- Copia de seguridad diaria (03:30) de la base y las imágenes ---
cat > /etc/cron.d/kanban-backup <<'CRON'
30 3 * * * deploy cd /opt/kanban && test -x backup.sh && ./backup.sh >> backups/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/kanban-backup
install -d -o deploy -g deploy /opt/kanban/backups

echo
echo "Listo. Siguiente paso (desde tu computadora):"
echo "  scp deploy/.env.example deploy@$(hostname -I | awk '{print $1}'):/opt/kanban/.env"
echo "  ssh deploy@... 'nano /opt/kanban/.env'   # DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD"
echo "  ./deploy/deploy.sh deploy@IP"
