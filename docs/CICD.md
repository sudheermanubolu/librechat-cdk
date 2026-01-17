# CI/CD Setup Guide

This project uses GitHub Actions for continuous integration and deployment.

## Workflows

### 1. CDK Deploy (`cdk-deploy.yml`)
- **Trigger**: Push to `main` branch or manual dispatch
- **Action**: Deploys all CDK stacks to AWS
- **Environment**: Production

### 2. CDK Diff (`cdk-diff.yml`)
- **Trigger**: Pull requests to `main`
- **Action**: Runs `cdk diff` and comments the results on the PR
- **Purpose**: Preview infrastructure changes before merging

### 3. CDK Destroy (`cdk-destroy.yml`)
- **Trigger**: Manual dispatch only
- **Action**: Destroys all CDK stacks
- **Safety**: Requires typing "DESTROY" to confirm

## Setup Instructions

### 1. Deploy the OIDC Role (Already Done)

The OIDC role for GitHub Actions has been deployed. The role ARN is:

```
arn:aws:iam::291515987508:role/github-actions-librechat-cdk
```

If you need to redeploy:

```bash
aws cloudformation deploy \
  --template-file .github/oidc-role.yml \
  --stack-name github-actions-oidc-librechat \
  --capabilities CAPABILITY_NAMED_IAM \
  --region eu-north-1
```

### 2. Configure GitHub Secrets

Add the following secret to your GitHub repository:

1. Go to **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret**
3. Add:
   - **Name**: `AWS_ROLE_ARN`
   - **Value**: `arn:aws:iam::291515987508:role/github-actions-librechat-cdk`

### 3. Configure GitHub Environments (Optional)

For better control, create environments:

1. Go to **Settings** > **Environments**
2. Create `production` environment
3. Add protection rules:
   - Require reviewers for production deployments
   - Add deployment branches (only `main`)

## Manual Deployment

To deploy manually from your local machine:

```bash
# Set AWS profile
export AWS_PROFILE=vestransfers

# Login to ECR public (for Docker images)
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws

# Deploy
npx cdk deploy --all
```

## Troubleshooting

### Docker Login Issues

If you see "pull access denied", run:

```bash
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
```

### Certificate Validation

Before first deployment, ensure the ACM certificate is validated. Add this DNS record:

| Type | Name | Value |
|------|------|-------|
| CNAME | `_ee500108ec98cf3588e9d94b64ab4b5a.vestransfers.com` | `_ee2e16adc545a1cba4fd92e73b8dc9b0.jkddzztszm.acm-validations.aws` |

### Permission Issues

If GitHub Actions fails with permission errors, verify:
1. The OIDC provider is correctly configured
2. The role ARN is correct in GitHub secrets
3. The role has sufficient permissions
