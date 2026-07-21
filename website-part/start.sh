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
    log "For startup after reboot, run 'pm2 startup' once and follow its instructions."
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
    *)
        echo "Usage: $0 {start|stop|restart|init}"
        exit 1
        ;;
esac
