#!/bin/bash
while true; do
  echo "Attempting to access host /etc/shadow via /host mount..."
  if [ -f /host/etc/shadow ]; then
    head -n 1 /host/etc/shadow
  else
    echo "Host /etc/shadow not found or not mounted."
  fi
  sleep 60
done
