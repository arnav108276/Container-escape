# CI/CD Pipeline Configuration

Automated build, test, and deployment pipeline.

## Components
- `github-actions/` - GitHub Actions workflows
- `docker-compose.yml` - Local development environment
- `.dockerignore` - Docker build exclusions

## Workflows
- **Build & Test**: Compile code, run tests, build containers
- **Security Scan**: eBPF code analysis, SAST scanning
- **Deploy Dev**: Deploy to development environment
- **Deploy Prod**: Deploy to production (manual approval)

## Run Locally
```bash
docker-compose up -d
```

## GitHub Actions
Workflows are in `.github/workflows/`
