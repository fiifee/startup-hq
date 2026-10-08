#!/usr/bin/env bash
# Call a Startup HQ tool over HTTP.
#   hq.sh list_events '{"include_proposed": true}'
#   hq.sh propose_event '{"title": "...", "kind": "event", "importance": "mandatory", "when": "2026-10-24 14:00", "timezone": "Europe/Tallinn", "source": "WhatsApp · ..."}'
#   hq.sh tools            # list every tool with its input schema
# Needs STARTUP_HQ_URL and STARTUP_HQ_TOKEN (a personal token from Settings), e.g. in ~/.hermes/.env.
set -euo pipefail
: "${STARTUP_HQ_URL:?set STARTUP_HQ_URL}"
: "${STARTUP_HQ_TOKEN:?set STARTUP_HQ_TOKEN}"
tool="${1:?usage: hq.sh <tool> '<json args>'}"
if [ "$tool" = "tools" ]; then
  curl -sS --fail-with-body "$STARTUP_HQ_URL/api/v1/tools" -H "Authorization: Bearer $STARTUP_HQ_TOKEN"
  exit
fi
curl -sS --fail-with-body -X POST "$STARTUP_HQ_URL/api/v1/tools/$tool" \
  -H "Authorization: Bearer $STARTUP_HQ_TOKEN" -H "content-type: application/json" \
  -d "${2:-{\}}"
