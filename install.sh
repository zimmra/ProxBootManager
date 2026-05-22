#!/usr/bin/env bash
set -euo pipefail

# ---------- colours ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
die()     { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }

# ---------- must run as root ----------
[[ $EUID -eq 0 ]] || die "Run this script as root (sudo ./install.sh)"

INSTALL_DIR=/opt/proxbootmanager
SERVICE_USER=proxbootmanager
SERVICE_FILE=/etc/systemd/system/proxbootmanager.service
REPO_URL=https://github.com/zimmra/ProxBootManager

echo -e "\n${BOLD}=== ProxBootManager Installer ===${RESET}\n"

# ---------- system deps ----------
info "Updating package lists and installing prerequisites..."
apt-get update -qq
apt-get install -y -qq curl git

# ---------- Node.js 20 LTS ----------
if ! node --version 2>/dev/null | grep -q '^v20\.'; then
  info "Installing Node.js 20 LTS via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
else
  success "Node.js $(node --version) already installed"
fi

# ---------- dedicated system user ----------
if id -u "$SERVICE_USER" &>/dev/null; then
  success "System user '$SERVICE_USER' already exists"
else
  info "Creating system user '$SERVICE_USER'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  success "Created system user '$SERVICE_USER'"
fi

# ---------- clone or update repo ----------
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing repository at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only
  success "Repository updated"
else
  info "Cloning repository to $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  success "Repository cloned"
fi

# ---------- install npm dependencies ----------
info "Installing npm dependencies..."
npm install --prefix "$INSTALL_DIR" --silent
success "Dependencies installed"

# ---------- build frontend ----------
info "Building frontend..."
npm run build --prefix "$INSTALL_DIR/frontend" --silent
success "Frontend built → $INSTALL_DIR/frontend/dist"

# ---------- build backend ----------
info "Building backend TypeScript..."
npm run build --prefix "$INSTALL_DIR/backend" --silent
success "Backend built → $INSTALL_DIR/backend/dist"

# ---------- configure .env ----------
ENV_FILE="$INSTALL_DIR/backend/.env"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists at $ENV_FILE"
  echo -e "  ${YELLOW}Skip to keep existing values, or re-enter to overwrite.${RESET}"
  read -rp "  Reconfigure .env? [y/N] " reconfigure
  reconfigure=${reconfigure,,}
else
  reconfigure=y
  cp "$INSTALL_DIR/backend/.env.example" "$ENV_FILE"
  info "Created $ENV_FILE from .env.example"
fi

if [[ "$reconfigure" == "y" ]]; then
  echo ""
  echo -e "${BOLD}Proxmox Configuration${RESET}"

  read -rp "  PROXMOX_HOST (e.g. 192.168.1.10 or proxmox.local): " px_host
  read -rp "  PROXMOX_TOKEN_ID (e.g. root@pam!mytoken): "           px_token_id
  read -rsp "  PROXMOX_TOKEN_SECRET: "                              px_token_secret
  echo ""
  read -rp "  PROXMOX_NODE (e.g. pve): "                            px_node
  echo ""
  read -rp "  Is the Proxmox certificate self-signed? [Y/n] "       self_signed
  self_signed=${self_signed,,}
  if [[ "$self_signed" == "n" ]]; then
    verify_ssl=true
  else
    verify_ssl=false
  fi

  # Write values into the .env file (idempotent key=value replacement)
  set_env() {
    local key=$1 val=$2
    if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      echo "${key}=${val}" >> "$ENV_FILE"
    fi
  }

  set_env PROXMOX_HOST          "$px_host"
  set_env PROXMOX_TOKEN_ID      "$px_token_id"
  set_env PROXMOX_TOKEN_SECRET  "$px_token_secret"
  set_env PROXMOX_NODE          "$px_node"
  set_env VERIFY_SSL            "$verify_ssl"
  set_env PORT                  "3001"
  set_env NODE_ENV              "production"

  success ".env written"
fi

# Ensure NODE_ENV=production is always set
grep -q '^NODE_ENV=' "$ENV_FILE" || echo 'NODE_ENV=production' >> "$ENV_FILE"
sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' "$ENV_FILE"

# Secure the env file
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

# ---------- ownership ----------
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
# Let root still write to node_modules during updates
chmod -R u+w "$INSTALL_DIR"

# ---------- systemd service ----------
info "Writing systemd service file $SERVICE_FILE..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=ProxBootManager - Proxmox boot order manager
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proxbootmanager

[Install]
WantedBy=multi-user.target
EOF
success "Service file written"

# ---------- enable & start ----------
info "Reloading systemd and enabling proxbootmanager..."
systemctl daemon-reload
systemctl enable proxbootmanager
systemctl restart proxbootmanager
success "Service enabled and started"

# ---------- done ----------
PORT_VAL=$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2)
PORT_VAL=${PORT_VAL:-3001}

echo ""
echo -e "${GREEN}${BOLD}=== Installation complete! ===${RESET}"
echo ""
echo -e "  Dashboard: ${CYAN}http://$(hostname -I | awk '{print $1}'):${PORT_VAL}${RESET}"
echo ""
echo -e "${BOLD}Useful commands:${RESET}"
echo "  systemctl status proxbootmanager   # check service status"
echo "  journalctl -u proxbootmanager -f   # follow logs"
echo "  nano $ENV_FILE                     # edit configuration"
echo ""
echo -e "${BOLD}To update:${RESET}"
echo "  sudo bash $INSTALL_DIR/install.sh"
echo "  (or: git -C $INSTALL_DIR pull && systemctl restart proxbootmanager)"
echo ""
