"#!/bin/bash" 
"set -e" 
"" 
'PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"' 
'cd "$PROJECT_ROOT"' 
"" 
'echo "?? WSL Local Setup for Container Escape Detection"' 
"" 
'# Ensure Python venv support is available and install system packages if needed' 
'if ! python3 -m venv --help ; then' 
