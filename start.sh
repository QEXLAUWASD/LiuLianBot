#!/bin/bash
# ============================================================
# LiuLianBot - Discord Bot Startup Script
# ============================================================
set -e

# --- Configuration ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="${SCRIPT_DIR}/discord-part"
VENV_DIR="${SCRIPT_DIR}/.venv"
REQUIREMENTS_FILE="${BOT_DIR}/requirements.txt"
MAIN_SCRIPT="${BOT_DIR}/main.py"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/bot_$(date +%Y%m%d).log"
PID_FILE="${SCRIPT_DIR}/bot.pid"

# --- Color output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# --- Functions ---
check_python() {
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        log_error "Python not found. Please install Python 3.8 or higher."
        exit 1
    fi

    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
    log_info "Using Python: $PYTHON_VERSION ($($PYTHON_CMD -c "import sys; print(sys.executable)"))"

    # Check minimum version (3.8)
    MAJOR=$($PYTHON_CMD -c "import sys; print(sys.version_info[0])")
    MINOR=$($PYTHON_CMD -c "import sys; print(sys.version_info[1])")
    if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 8 ]); then
        log_error "Python 3.8+ is required. Found: $PYTHON_VERSION"
        exit 1
    fi
}

setup_venv() {
    if [ ! -d "$VENV_DIR" ]; then
        log_info "Creating virtual environment..."
        $PYTHON_CMD -m venv "$VENV_DIR"
        log_info "Virtual environment created at $VENV_DIR"
    else
        log_info "Virtual environment already exists. Skipping creation."
    fi

    # Activate virtual environment
    if [ -f "${VENV_DIR}/bin/activate" ]; then
        source "${VENV_DIR}/bin/activate"
    elif [ -f "${VENV_DIR}/Scripts/activate" ]; then
        source "${VENV_DIR}/Scripts/activate"
    else
        log_error "Cannot find virtual environment activation script."
        exit 1
    fi
    log_info "Virtual environment activated."
}

install_dependencies() {
    if [ ! -f "$REQUIREMENTS_FILE" ]; then
        log_error "requirements.txt not found at $REQUIREMENTS_FILE"
        exit 1
    fi

    log_info "Installing/updating dependencies..."
    pip install --upgrade pip -q
    pip install -r "$REQUIREMENTS_FILE" -q
    log_info "Dependencies installed."
}

check_config() {
    if [ ! -f "${BOT_DIR}/config.json" ]; then
        log_error "config.json not found at ${BOT_DIR}/config.json"
        exit 1
    fi
    log_info "config.json found."
}

create_directories() {
    mkdir -p "$LOG_DIR"
    log_info "Log directory: $LOG_DIR"
}

is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            return 0
        else
            # Stale PID file
            rm -f "$PID_FILE"
        fi
    fi
    return 1
}

start_bot() {
    if is_running; then
        log_warn "Bot is already running (PID: $(cat "$PID_FILE"))."
        exit 1
    fi

    log_info "Starting LiuLianBot..."
    cd "$SCRIPT_DIR"

    # Run bot in background and capture PID
    nohup python "${MAIN_SCRIPT}" >> "${LOG_FILE}" 2>&1 &
    BOT_PID=$!
    echo "$BOT_PID" > "$PID_FILE"

    # Wait a moment to check if it started successfully
    sleep 2
    if kill -0 "$BOT_PID" 2>/dev/null; then
        log_info "Bot started successfully! (PID: $BOT_PID)"
        log_info "Log file: $LOG_FILE"
    else
        log_error "Bot failed to start. Check the log file: $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
}

stop_bot() {
    if ! is_running; then
        log_warn "Bot is not running."
        rm -f "$PID_FILE"
        exit 0
    fi

    PID=$(cat "$PID_FILE")
    log_info "Stopping bot (PID: $PID)..."
    kill "$PID" 2>/dev/null

    # Wait for process to terminate gracefully
    for i in {1..10}; do
        if ! kill -0 "$PID" 2>/dev/null; then
            break
        fi
        sleep 1
    done

    # Force kill if still running
    if kill -0 "$PID" 2>/dev/null; then
        log_warn "Bot did not stop gracefully. Force killing..."
        kill -9 "$PID" 2>/dev/null
    fi

    rm -f "$PID_FILE"
    log_info "Bot stopped."
}

restart_bot() {
    log_info "Restarting bot..."
    stop_bot
    sleep 1
    # Re-run setup steps for restart
    check_python
    setup_venv
    install_dependencies
    check_config
    create_directories
    start_bot
}

show_status() {
    if is_running; then
        PID=$(cat "$PID_FILE")
        log_info "Bot is running (PID: $PID)"
        # Show uptime if possible
        if command -v ps &> /dev/null; then
            ps -p "$PID" -o pid,etime,cmd --no-headers 2>/dev/null || true
        fi
    else
        log_warn "Bot is not running."
    fi
}

show_help() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        LiuLianBot - Manager         ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|help}"
    echo ""
    echo "Commands:"
    echo "  start    Start the bot (default if no arg)"
    echo "  stop     Stop the bot"
    echo "  restart  Restart the bot"
    echo "  status   Show bot status"
    echo "  help     Show this help message"
    echo ""
}

# --- Main ---
COMMAND="${1:-start}"

case "$COMMAND" in
    start)
        check_python
        setup_venv
        install_dependencies
        check_config
        create_directories
        start_bot
        ;;
    stop)
        stop_bot
        ;;
    restart)
        restart_bot
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
