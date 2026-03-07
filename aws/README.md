# AWS Deployment & Infrastructure

Cloud infrastructure and deployment scripts for AWS.

## Components
- `terraform/` - Infrastructure as Code (IaC) using Terraform
- `docker/` - Docker images for containerization
- `scripts/` - Deployment and management scripts
- `cloudwatch/` - CloudWatch monitoring configurations
- `iam/` - IAM roles and policies

## Deployment

### Prerequisites
- AWS CLI configured
- Terraform installed
- Docker

### Deploy to EC2
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Deploy to EKS
```bash
bash scripts/deploy-eks.sh
```

## Monitoring
CloudWatch integration for:
- eBPF event metrics
- Container quarantine events
- API latency and errors
- System resource usage
