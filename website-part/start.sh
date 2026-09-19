#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="${PM2_APP_NAME:-liulianbot-website}"
ENTRY_FILE="${SCRIPT_DIR}/src/server.js"
PM2_BIN="${PM2_BIN:-pm2}"

log() {
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_pm2() {
    if ! command -v "${PM2_BIN}" >/dev/null 2>&1 && [ ! -x "${PM2_BIN}" ]; then
        log "PM2 was not found. Install it first: npm install -g pm2"
        exit 1
    fi
}

is_openwrt() {
    [ -f /etc/openwrt_release ] && [ -f /etc/rc.common ]
}

startup() {
    require_pm2
    if ! is_openwrt; then
        "${PM2_BIN}" startup
        return
    fi

    # This service restores the root account's complete saved PM2 process list.
    if [ "$(id -u)" -ne 0 ] || [ "${PM2_HOME:-${HOME}/.pm2}" != /root/.pm2 ]; then
        log "OpenWrt startup requires root with PM2_HOME=/root/.pm2."
        exit 1
    fi
    if [ "$(command -v "${PM2_BIN}")" != /usr/bin/pm2 ]; then
        log "The OpenWrt service requires PM2 at /usr/bin/pm2."
        exit 1
    fi
    if ! is_initialized; then
        log "${APP_NAME} is not initialized. Run: $0 init"
        exit 1
    fi

    local template="${SCRIPT_DIR}/deploy/openwrt/pm2-pm2"
    local service=/etc/init.d/pm2-pm2
    [ -f "${template}" ] || { log "Missing service template: ${template}"; exit 1; }
    sh -n "${template}"
    PM2_HOME=/root/.pm2 "${PM2_BIN}" save
    if [ -e "${service}" ]; then
        local backup
        mkdir -p /root/.pm2/startup-backups
        chmod 700 /root/.pm2/startup-backups
        backup="$(mktemp /root/.pm2/startup-backups/pm2-pm2.XXXXXX)"
        cp -p "${service}" "${backup}"
        log "Previous startup service saved to ${backup}"
    fi
    cp "${template}" "${service}"
    chmod 755 "${service}"
    "${service}" enable
    log "OpenWrt startup enabled: ${service} (PM2_HOME=/root/.pm2)."
    log "Use '${service} start' to restore saved processes; current processes were not restarted."
}

is_initialized() {
    "${PM2_BIN}" describe "${APP_NAME}" >/dev/null 2>&1
}

start() {
    require_pm2
    if ! is_initialized; then
        log "${APP_NAME} is not initialized. Run: $0 init"
        exit 1
    fi

    log "Starting ${APP_NAME}..."
    "${PM2_BIN}" start "${APP_NAME}" --update-env
}

stop() {
    require_pm2
    if ! is_initialized; then
        log "${APP_NAME} is not initialized; nothing to stop."
        return 0
    fi

    log "Stopping ${APP_NAME}..."
    "${PM2_BIN}" stop "${APP_NAME}"
}

restart() {
    require_pm2
    if ! is_initialized; then
        log "${APP_NAME} is not initialized. Run: $0 init"
        exit 1
    fi

    log "Restarting ${APP_NAME}..."
    "${PM2_BIN}" restart "${APP_NAME}" --update-env
}

init() {
    require_pm2

    if ! command -v node >/dev/null 2>&1; then
        log "Node.js was not found."
        exit 1
    fi
    if ! command -v npm >/dev/null 2>&1; then
        log "npm was not found."
        exit 1
    fi
    if [ ! -f "${ENTRY_FILE}" ]; then
        log "Website entry file was not found: ${ENTRY_FILE}"
        exit 1
    fi

    log "Installing production dependencies..."
    if [ -f "${SCRIPT_DIR}/package-lock.json" ]; then
        (cd "${SCRIPT_DIR}" && npm ci --omit=dev)
    else
        (cd "${SCRIPT_DIR}" && npm install --omit=dev)
    fi

    if is_initialized; then
        log "Removing the existing ${APP_NAME} definition..."
        "${PM2_BIN}" delete "${APP_NAME}"
    fi

    log "Initializing ${APP_NAME} with PM2..."
    NODE_ENV=production "${PM2_BIN}" start "${ENTRY_FILE}" \
        --name "${APP_NAME}" \
        --cwd "${SCRIPT_DIR}" \
        --time
    "${PM2_BIN}" save

    log "PM2 initialization complete."
    if is_openwrt; then
        log "For startup after reboot on OpenWrt/iStoreOS, run: bash ${BASH_SOURCE[0]} startup"
    else
        log "For startup after reboot, run 'pm2 startup' once and follow its instructions."
    fi
}

case "${1:-}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    init)
        init
        ;;
    startup)
        startup
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|init|startup}"
        exit 1
        ;;
esac
