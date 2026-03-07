# Production Deployment Guide

## Deployment Options

This guide covers deployment on AWS (EC2 and EKS). For other platforms, adapt these instructions accordingly.

## Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured
- Docker and Docker Compose
- Terraform (for IaC)
- kubectl (for EKS)
- `uv` for Python package management

## AWS EC2 Deployment

### 1. Prepare EC2 Instance

Launch Ubuntu 22.04 LTS instance with:
- **Instance Type**: t3.medium or larger
- **Storage**: 50GB+ root volume
- **Security Group**: Allow ports 80, 443, 8000, 5173

### 2. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Python and uv
sudo apt install -y python3.12 curl
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Node.js (optional, if not using Docker)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Deploy with Docker Compose

```bash
# Clone repository
git clone <repository-url>
cd major2

# Create .env file
cp .env.example .env
# Edit .env with production settings

# Build images (or pull from ECR)
docker-compose build

# Start services
docker-compose up -d

# Verify services
curl http://localhost:8000/health
curl http://localhost:5173
```

### 4. SSH Tunnel or Reverse Proxy Setup

For production, use nginx as reverse proxy:

```nginx
upstream backend {
    server localhost:8000;
}

upstream frontend {
    server localhost:5173;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 5. Enable eBPF Programs

On the EC2 host (requires Linux):

```bash
# Check kernel eBPF support
cat /proc/config.gz | zcat | grep BPF

# Install required packages
sudo apt install -y clang llvm libelf-dev libpcap-dev
sudo apt install -y libbpf-dev linux-headers-$(uname -r)

# Compile eBPF programs
cd major2/ebpf
sudo make

# Load eBPF programs (requires systemd service or manual)
sudo ./load-ebpf.sh
```

## AWS EKS Deployment

### 1. Create EKS Cluster

```bash
# Using Terraform (recommended)
cd major2/aws/terraform
terraform init
terraform plan
terraform apply

# Or using eksctl CLI
eksctl create cluster --name container-guardian --region us-east-1 --nodes 3
```

### 2. Push Docker Images to ECR

```bash
# Create ECR repositories
aws ecr create-repository --repository-name container-guardian-backend --region us-east-1
aws ecr create-repository --repository-name container-guardian-daemon --region us-east-1
aws ecr create-repository --repository-name container-guardian-frontend --region us-east-1

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build and push images
docker build -t 123456789012.dkr.ecr.us-east-1.amazonaws.com/container-guardian-backend ./backend
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/container-guardian-backend

# Repeat for daemon and frontend
```

### 3. Deploy to EKS

```bash
# Configure kubectl access
aws eks update-kubeconfig --name container-guardian --region us-east-1

# Create namespace
kubectl create namespace container-guardian

# Apply Kubernetes manifests
kubectl apply -f major2/aws/kubectl/

# Verify deployment
kubectl get pods -n container-guardian
kubectl get services -n container-guardian
```

### 4. Setup MongoDB on EKS

Option 1: AWS DocumentDB
```bash
# AWS DocumentDB is MongoDB-compatible
# Create cluster via AWS console or Terraform
# Update MONGODB_URI in ConfigMap
```

Option 2: MongoDB Helm Chart
```bash
# Install MongoDB via Helm
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install mongodb bitnami/mongodb --namespace container-guardian

# Get connection string
kubectl get secret --namespace container-guardian mongodb -o jsonpath="{.data.mongodb-root-password}" | base64 --decode
```

## Monitoring & Logging

### CloudWatch Integration

```bash
# Backend logs to CloudWatch
# Environment variable
export AWS_LOGS_GROUP=/container-guardian/backend

# Configure in backend
# Update daemon/logger.py for CloudWatch integration
```

### Log Aggregation

```bash
# View logs in CloudWatch
aws logs tail /container-guardian/backend --follow
aws logs tail /container-guardian/daemon --follow
aws logs tail /container-guardian/frontend --follow
```

## SSL/TLS Certificates

### Using Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### Using AWS Certificate Manager

```bash
# Request certificate in AWS console
# Use in ALB/NLB for ingress
```

## Backup Strategy

### MongoDB Backups

```bash
# Automated backups using MongoDB Atlas or AWS DocumentDB

# Manual backup
mongodump --uri "mongodb://admin:password@your-host:27017" --out ./backup

# Restore from backup
mongorestore --uri "mongodb://admin:password@your-host:27017" ./backup
```

### S3 Backup for Forensic Data

```bash
# Automatic daily export to S3
aws s3 sync mongodb-exports/ s3://your-bucket/container-guardian/

# Lifecycle policy for retention
# Set in S3 bucket lifecycle rules
```

## Disaster Recovery

### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: 1 hour
- **RPO (Recovery Point Objective)**: 15 minutes

### Failover Procedures

1. **Database Failover**
   - Use AWS RDS Multi-AZ or DocumentDB failover
   - Automatic within 1-2 minutes

2. **Application Failover**
   - EKS auto-scaling takes over
   - Re-deploy to new nodes automatically

3. **Manual Recovery**
   ```bash
   # Restore from backup
   mongorestore --uri "mongodb://..." backup/
   
   # Restart services
   kubectl rollout restart deployment/backend -n container-guardian
   ```

## Performance Tuning

### Backend Optimization
```bash
# Update FastAPI settings in main.py
# - Increase worker processes
# - Enable caching headers
# - Use async/await
```

### Database Optimization
```bash
# Create indexes on frequently queried fields
db.security_events.createIndex({ "container_id": 1, "timestamp": -1 })
db.security_events.createIndex({ "risk_score": 1 })

# Archival of old data
db.security_events.deleteMany({ "timestamp": { "$lt": ISODate("2024-01-01") } })
```

### Frontend Optimization
```bash
# Enable production builds
npm run build

# CDN configuration (CloudFront or CloudFlare)
# Static assets served from CDN
# API calls proxied to backend
```

## Security Best Practices

### Network Security
- Use VPC with private subnets
- Security groups restrict to necessary ports only
- Use VPN for remote access
- Enable VPC Flow Logs

### Access Control
- Use IAM roles instead of access keys
- Enable MFA for AWS console access
- Rotate secrets regularly
- Use AWS Secrets Manager

### Data Security
- Enable encryption at rest (EBS, S3)
- Use HTTPS/TLS for all communications
- Encrypt MongoDB data
- Regular security audits

### Application Security
- Keep dependencies updated
- Enable CORS properly
- Validate all inputs
- Use security headers

## Maintenance

### Regular Tasks

**Daily**
- Monitor CloudWatch dashboards
- Check alert notifications
- Verify backup completion

**Weekly**
- Review security logs
- Check for updates
- Performance review

**Monthly**
- Disaster recovery test
- Security patch updates
- Capacity planning review

### Updates

```bash
# Update application code
git pull origin main
docker-compose build
docker-compose up -d

# Kubernetes updates
kubectl set image deployment/backend container=backend:new-tag -n container-guardian
```

## Troubleshooting

### Service Not Responding
```bash
# Check container logs
docker logs container-id
kubectl logs pod-name -n container-guardian

# Check port availability
sudo netstat -tlnp | grep 8000

# Restart services
docker-compose restart backend
```

### Database Connection Issues
```bash
# Verify connection string
echo $MONGODB_URI

# Test connectivity
mongosh $MONGODB_URI

# Check network security groups
aws ec2 describe-security-groups
```

### High CPU/Memory Usage
```bash
# Monitor resource usage
docker stats
kubectl top pods -n container-guardian

# Scale horizontally
kubectl scale deployment backend --replicas=3 -n container-guardian

# Check eBPF program efficiency
# Review risk_scorer.py, event_processor.py
```

## Rollback Procedures

```bash
# Docker Compose
docker-compose down
docker-compose pull  # Or checkout previous image tag
docker-compose up -d

# Kubernetes
kubectl rollout history deployment/backend -n container-guardian
kubectl rollout undo deployment/backend -n container-guardian
```

---

For emergency support, contact infrastructure team. See main README for additional resources.
