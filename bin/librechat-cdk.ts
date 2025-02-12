#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LibreChatCdkStack } from '../lib/librechat-cdk-stack';
import { LibreSecretTokensStack } from '../lib/constructs/compute/services/libre-secret-tokens-stack';
import { loadConfig } from '../scripts/load-config';

const app = new cdk.App();
const config = loadConfig();

// First, create the secrets stack
const secretsStack = new LibreSecretTokensStack(app, 'LibreSecretTokensStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: config.region || process.env.CDK_DEFAULT_REGION,
    }
});

// Then create the main stack, using the secrets from the secrets stack
const mainStack = new LibreChatCdkStack(app, 'LibreChatCdkStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: config.region || process.env.CDK_DEFAULT_REGION,
    },
    config: config,
    secretTokens: secretsStack.secretTokens,
});

app.synth();