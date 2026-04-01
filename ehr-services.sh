#!/bin/bash
# EHR Demo Services Startup Script
# Giữ chaincode + backend chạy liên tục

DEMO="/home/nguye/.openclaw/workspace-thesis-lead/demo"
PKGID="ehr-chaincode_1.0:9f2b2a0c8ec69fb28f748bf6162929e8b85cbf68a37b24bafc7d31b9ded1ef53"
LOG_CC="/tmp/cc-ccaas.log"
LOG_BE="/tmp/backend.log"
PIDFILE_CC="/tmp/ehr-cc.pid"
PIDFILE_BE="/tmp/ehr-be.pid"

start_chaincode() {
    if [ -f "$PIDFILE_CC" ] && kill -0 $(cat $PIDFILE_CC) 2>/dev/null; then
        echo "[chaincode] already running (pid=$(cat $PIDFILE_CC))"
        return
    fi
    cd "$DEMO/chaincode"
    node node_modules/.bin/fabric-chaincode-node server \
        --chaincode-address="0.0.0.0:7055" \
        --chaincode-id="$PKGID" >> "$LOG_CC" 2>&1 &
    echo $! > "$PIDFILE_CC"
    echo "[chaincode] started (pid=$!)"
}

start_backend() {
    if [ -f "$PIDFILE_BE" ] && kill -0 $(cat $PIDFILE_BE) 2>/dev/null; then
        echo "[backend] already running (pid=$(cat $PIDFILE_BE))"
        return
    fi
    cd "$DEMO/backend"
    node server.js >> "$LOG_BE" 2>&1 &
    echo $! > "$PIDFILE_BE"
    echo "[backend] started (pid=$!)"
}

stop_all() {
    for pf in "$PIDFILE_CC" "$PIDFILE_BE"; do
        [ -f "$pf" ] && kill $(cat $pf) 2>/dev/null && rm -f "$pf"
    done
    pkill -9 -f "fabric-chaincode-node" 2>/dev/null
    pkill -9 -f "node server.js" 2>/dev/null
    echo "All services stopped."
}

status() {
    echo "=== EHR Demo Services ==="
    for name in chaincode backend; do
        pf="/tmp/ehr-${name/chain*/cc}.pid"
        [ "$name" = "backend" ] && pf="$PIDFILE_BE"
        [ "$name" = "chaincode" ] && pf="$PIDFILE_CC"
        if [ -f "$pf" ] && kill -0 $(cat $pf) 2>/dev/null; then
            echo "  $name: RUNNING (pid=$(cat $pf))"
        else
            echo "  $name: STOPPED"
        fi
    done
    echo ""
    ss -tlnp | grep -E "3001|7055" | awk '{print "  port:", $4, "-", $NF}'
}

watchdog() {
    echo "[watchdog] Starting... (Ctrl+C to stop)"
    while true; do
        start_chaincode
        start_backend
        sleep 10
    done
}

case "$1" in
    start)
        start_chaincode
        sleep 2
        start_backend
        sleep 2
        status
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all; sleep 2
        start_chaincode; sleep 2
        start_backend; sleep 2
        status
        ;;
    status)
        status
        ;;
    watchdog)
        watchdog
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|watchdog}"
        exit 1
        ;;
esac
