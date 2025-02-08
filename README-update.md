# Configuration Files Setup

Before deploying the stack, you need to prepare and upload the following configuration files to the S3 bucket:

1. Create a directory structure in your local environment:
```bash
mkdir -p config/
```

2. Create the required configuration files:

Create `config/librechat.yaml`:
```yaml
# LibreChat configuration
# Add your LibreChat specific configuration here
```

Create `config/.env`:
```
# Environment variables will be replaced by values from Secrets Manager
# You can leave this file empty or add non-sensitive default values
```

3. Upload the files to the S3 bucket:
```bash
# Replace ENVIRONMENT with your environment name (dev, prod, etc)
aws s3 cp config/ s3://config-bucket-${ENVIRONMENT}/config/ --recursive
```

Note: The actual configuration values for sensitive data like API keys and secrets will be managed through AWS Secrets Manager and injected into the container at runtime.