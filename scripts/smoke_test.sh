#!/usr/bin/env bash
set -euo pipefail

SMOKE_DIR=/tmp/smoke_test_$(date +%s)
mkdir -p "$SMOKE_DIR"
echo "SMOKE DIR: $SMOKE_DIR" > "$SMOKE_DIR/log.txt"

echo "Pulling images..." >> "$SMOKE_DIR/log.txt"
docker pull -q nginx:alpine busybox:latest alpine:latest || true

for nm in smoke_nginx smoke_busybox smoke_privileged smoke_mount; do
  docker rm -f "$nm" >/dev/null 2>&1 || true
done

echo "Creating sample containers..." >> "$SMOKE_DIR/log.txt"
CID_NGINX=$(docker run -d --name smoke_nginx nginx:alpine || true)
CID_BUSYBOX=$(docker run -d --name smoke_busybox busybox:latest sh -c "sleep 3600" || true)
CID_PRIV=$(docker run -d --name smoke_privileged --privileged alpine:latest sh -c "sleep 3600" || true)
CID_MOUNT=$(docker run -d --name smoke_mount -v /:/host_root:ro alpine:latest sh -c "sleep 3600" || true)

sleep 2

# Build container payload for sync
python3 - <<'PYTHON' > /tmp/containers_payload.json
import json, subprocess
names = ["smoke_nginx","smoke_busybox","smoke_privileged","smoke_mount"]
containers = []
for name in names:
    try:
        out = subprocess.check_output(["docker","inspect",name], text=True)
        data = json.loads(out)[0]
        cid = data.get("Id","")[:12]
        full = data.get("Id","")
        cname = data.get("Name","").lstrip("/")
        image = data.get("Config",{}).get("Image") or data.get("Image","")
        status = data.get("State",{}).get("Status") or ("running" if data.get("State",{}).get("Running") else "exited")
        paused = bool(data.get("State",{}).get("Paused", False))
        containers.append({
            "container_id": cid,
            "full_id": full,
            "name": cname,
            "image": image,
            "status": status,
            "quarantined": paused,
            "risk_score": 0,
            "risk_level": "LOW",
            "runtime_findings": []
        })
    except Exception:
        continue
print(json.dumps({"containers":containers}))
PYTHON

mv /tmp/containers_payload.json "$SMOKE_DIR/containers_payload.json" || true

# Sync containers into backend DB
curl -sS -X POST -H "Content-Type: application/json" -d @"$SMOKE_DIR/containers_payload.json" http://127.0.0.1:8000/api/containers/sync > "$SMOKE_DIR/containers_sync_response.json" || true

# Login to backend
LOGIN_JSON=$(curl -sS -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin1234"}' http://127.0.0.1:8000/api/auth/login || true)
echo "$LOGIN_JSON" > "$SMOKE_DIR/login.json"
TOKEN=$(printf '%s' "$LOGIN_JSON" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' || true)
if [ -z "$TOKEN" ]; then
  echo "ERROR: failed to get token" >> "$SMOKE_DIR/log.txt"
  echo "login response:" >> "$SMOKE_DIR/log.txt"
  cat "$SMOKE_DIR/login.json" >> "$SMOKE_DIR/log.txt"
fi

python3 - <<'PYTHON' > "$SMOKE_DIR/containers_list.txt"
import json
d = json.load(open("$SMOKE_DIR/containers_payload.json"))
for c in d.get("containers",[]):
    print(c["container_id"], c["name"])
PYTHON

while read -r short name; do
  echo "Testing container $name ($short)" >> "$SMOKE_DIR/log.txt"
  curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/containers/$short" > "$SMOKE_DIR/${short}_info.json" || true
  curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/containers/$short/risk" > "$SMOKE_DIR/${short}_risk.json" || true
  curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/containers/$short/vulnerabilities" > "$SMOKE_DIR/${short}_vuln.json" || true

  # Quarantine (may fail if runtime actions unavailable)
  curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"reason":"smoke","approved_by":"tester"}' "http://127.0.0.1:8000/api/containers/$short/quarantine" > "$SMOKE_DIR/${short}_quarantine.json" || true
  docker inspect -f '{{.State.Paused}}' "$short" > "$SMOKE_DIR/${short}_paused_after_quarantine.txt" 2>/dev/null || true

  # Unquarantine (approved_by is a required query param)
  curl -sS -X POST -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/containers/$short/unquarantine?approved_by=tester" > "$SMOKE_DIR/${short}_unquarantine.json" || true
  docker inspect -f '{{.State.Paused}}' "$short" > "$SMOKE_DIR/${short}_paused_after_unquarantine.txt" 2>/dev/null || true

  # Create an alert for this container
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  curl -sS -X POST -H "Content-Type: application/json" -d "{\"container_id\":\"$short\",\"event_type\":\"smoke-test\",\"risk_score\":45,\"details\":\"smoke test\",\"timestamp\":\"$TS\",\"reason\":\"smoke\"}" http://127.0.0.1:8000/api/alerts > "$SMOKE_DIR/${short}_alert_create.json" || true

done < "$SMOKE_DIR/containers_list.txt"

# Alerts and acknowledgement
curl -sS http://127.0.0.1:8000/api/alerts > "$SMOKE_DIR/alerts.json" || true
curl -sS -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/alerts/acknowledge/all > "$SMOKE_DIR/alerts_ack_all.json" || true

# Reports for first sample
first_short=$(awk 'NR==1{print $1}' "$SMOKE_DIR/containers_list.txt" || true)
if [ -n "$first_short" ]; then
  curl -sS -X POST "http://127.0.0.1:8000/api/reports/generate?container_id=$first_short&hours=24" > "$SMOKE_DIR/report_generate.json" || true
  REPORT_ID=$(sed -n 's/.*"report_id"[: ]*"\([^"]*\)".*/\1/p' "$SMOKE_DIR/report_generate.json" | head -n1 || true)
  if [ -n "$REPORT_ID" ]; then
    curl -sS "http://127.0.0.1:8000/api/reports/$REPORT_ID" > "$SMOKE_DIR/report_${REPORT_ID}_detail.json" || true
    curl -sS "http://127.0.0.1:8000/api/reports/$REPORT_ID/export?format=markdown" > "$SMOKE_DIR/report_${REPORT_ID}.md" || true
  fi
fi

# Notifications
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/notifications/config > "$SMOKE_DIR/notify_before.json" || true
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"recipients":["ops@example.com"],"enabled":true,"min_severity":"low"}' http://127.0.0.1:8000/api/notifications/config > "$SMOKE_DIR/notify_after.json" || true
curl -sS -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/notifications/queue/process > "$SMOKE_DIR/notify_process.json" || true

# Admin stats and events
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/admin/stats > "$SMOKE_DIR/admin_stats.json" || true
curl -sS http://127.0.0.1:8000/api/events > "$SMOKE_DIR/events.json" || true
curl -sS http://127.0.0.1:8000/api/events/statistics > "$SMOKE_DIR/events_stats.json" || true

# Final summary
{
  echo "Smoke test summary - $SMOKE_DIR";
  echo "Created containers:";
  cat "$SMOKE_DIR/containers_list.txt" || true;
  echo "";
  for l in $(awk '{print $1}' "$SMOKE_DIR/containers_list.txt"); do
    echo "--- $l ---";
    [ -s "$SMOKE_DIR/${l}_info.json" ] && echo "info: OK" || echo "info: MISSING";
    [ -s "$SMOKE_DIR/${l}_risk.json" ] && echo "risk: OK" || echo "risk: MISSING";
    [ -s "$SMOKE_DIR/${l}_vuln.json" ] && echo "vuln: OK" || echo "vuln: MISSING";
    [ -s "$SMOKE_DIR/${l}_quarantine.json" ] && echo "quarantine: OK" || echo "quarantine: MISSING";
    paused_after=$(cat "$SMOKE_DIR/${l}_paused_after_quarantine.txt" 2>/dev/null || true);
    paused_un=$(cat "$SMOKE_DIR/${l}_paused_after_unquarantine.txt" 2>/dev/null || true);
    echo "paused after quarantine: ${paused_after:-unknown}";
    echo "paused after unquarantine: ${paused_un:-unknown}";
    [ -s "$SMOKE_DIR/${l}_alert_create.json" ] && echo "alert create: OK" || echo "alert create: MISSING";
  done;
  echo "";
  [ -s "$SMOKE_DIR/report_generate.json" ] && echo "report generation: OK" || echo "report generation: MISSING";
  [ -s "$SMOKE_DIR/alerts.json" ] && echo "alerts list: OK" || echo "alerts list: MISSING";
  [ -s "$SMOKE_DIR/admin_stats.json" ] && echo "admin stats: OK" || echo "admin stats: MISSING";
} > "$SMOKE_DIR/summary.txt"

cat "$SMOKE_DIR/summary.txt"

# Cleanup sample containers
for name in smoke_nginx smoke_busybox smoke_privileged smoke_mount; do
  docker rm -f "$name" >/dev/null 2>&1 || true
done

echo "Done. Outputs saved to $SMOKE_DIR"
