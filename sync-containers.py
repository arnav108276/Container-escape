#!/usr/bin/env python3
"""
Cross-platform container synchronization script
Works on Windows, Linux, and macOS
Syncs all running Docker containers to the Container Escape Detection dashboard
"""

import subprocess
import json
import sys
import requests
from typing import List, Dict
from pathlib import Path

# Configuration
BACKEND_URL = "http://localhost:8000"


def get_containers() -> List[Dict]:
    """Get all running containers using Docker CLI"""
    try:
        result = subprocess.run(
            ["docker", "ps", "--no-trunc", "--format", "json"],
            capture_output=True,
            text=True,
            timeout=5,
            check=True
        )
        
        containers = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            try:
                container_data = json.loads(line)
                containers.append({
                    'container_id': container_data.get('ID', '')[:12],
                    'full_id': container_data.get('ID', ''),
                    'name': container_data.get('Names', ''),
                    'image': container_data.get('Image', ''),
                    'status': 'running',
                    'quarantined': False,
                    'risk_level': 'LOW',
                    'risk_score': 0,
                    'alert_count': 0,
                    'runtime_findings': []
                })
            except json.JSONDecodeError:
                continue
        
        return containers
    
    except FileNotFoundError:
        print("❌ Error: Docker CLI not found. Make sure Docker is installed and in your PATH.")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print("❌ Error: Docker command timed out")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running docker command: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


def sync_containers(containers: List[Dict]) -> bool:
    """Send containers to the backend API"""
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/containers/sync",
            json={"containers": containers},
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            return True
        else:
            print(f"⚠️  Backend returned status {response.status_code}")
            print(f"Response: {response.text}")
            return False
    
    except requests.exceptions.ConnectionError:
        print(f"❌ Error: Cannot connect to backend at {BACKEND_URL}")
        print("Make sure the backend is running: docker-compose up -d backend")
        return False
    except requests.exceptions.Timeout:
        print("❌ Error: Backend request timed out")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    """Main entry point"""
    print("🔍 Finding all running containers...")
    containers = get_containers()
    
    if not containers:
        print("⚠️  No containers found")
        return
    
    print(f"✅ Found {len(containers)} container(s)")
    print("\nContainers:")
    for container in containers:
        print(f"  - {container['name']} ({container['container_id']})")
    
    print(f"\n📤 Sending to backend at {BACKEND_URL}...")
    if sync_containers(containers):
        print(f"✅ Successfully synced {len(containers)} container(s)!")
        print("📊 Refresh your dashboard at http://localhost:5173")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
