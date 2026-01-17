# LibreChat CDK Deployment - Resume State

## Current Status: Waiting for ACM Certificate Validation

### What's Done
- Repository cloned and configured for **eu-north-1**
- CDK bootstrapped
- GitHub Actions CI/CD deployed
- LibreChat config updated for Bedrock eu-north-1
- All Bedrock models are ACTIVE

### Blocking Task
**ACM Certificate needs DNS validation via Cloudflare**

Certificate ARN:
```
arn:aws:acm:eu-north-1:291515987508:certificate/d9ca22a8-1941-4f37-af49-640114ef9215
```

DNS Record to add:
| Type | Name | Value |
|------|------|-------|
| CNAME | `_ee500108ec98cf3588e9d94b64ab4b5a.vestransfers.com` | `_ee2e16adc545a1cba4fd92e73b8dc9b0.jkddzztszm.acm-validations.aws` |

### Next Steps After Certificate Validation
1. Verify certificate status:
   ```bash
   AWS_PROFILE=vestransfers aws acm describe-certificate \
     --certificate-arn arn:aws:acm:eu-north-1:291515987508:certificate/d9ca22a8-1941-4f37-af49-640114ef9215 \
     --region eu-north-1 --query 'Certificate.Status'
   ```

2. Deploy infrastructure:
   ```bash
   cd /Users/rotemlevi/repos/private/librechat-cdk
   AWS_PROFILE=vestransfers npx cdk deploy --all
   ```

3. After deployment, add A record for `librechat.vestransfers.com` pointing to ALB DNS

### Key Resources
- GitHub Project: https://github.com/orgs/Doktransfers/projects/3
- GitHub Issues: https://github.com/Doktransfers/librechat-cdk/issues
- Certificate Issue: #8
- AWS Account: 291515987508
- AWS Profile: vestransfers
- Region: eu-north-1
