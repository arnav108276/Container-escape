# setup.md

## Fastest run (WSL)

```bash
git clone <repo-url>
cd Container-escape
docker compose up --build
```

Open:
- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/api/health

## One-file Kubernetes install

```bash
kubectl apply -f https://raw.githubusercontent.com/<org>/<repo>/<branch>/k8s/single-manifest.yaml
```

This deploys MongoDB, backend, frontend, daemon, probes, PVC, secret template, and backend HPA.

## Notes
- Designed for Linux/WSL runtime for eBPF daemon support.
- Configure SMTP and API keys by editing `container-escape-secrets` values before production use.
