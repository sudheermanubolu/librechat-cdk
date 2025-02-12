import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib';
import * as custom from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as crypto from 'crypto';

export class LibreSecretTokensStack extends cdk.Stack {
  public readonly secretTokens: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Helper function to generate hex string
    function generateHexKey(byteLength: number): string {
      return crypto.randomBytes(byteLength).toString('hex');
    }

    // Create the main secret
    const secret = new secretsmanager.Secret(this, 'LibreSecretTokens', {
      secretName: 'LibreChat/app/LibreSecretTokens',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          CREDS_KEY: '',
          CREDS_IV: '',
          JWT_SECRET: '',
          JWT_REFRESH_SECRET: '',
          MEILI_MASTER_KEY: ''
        }),
        generateStringKey: 'dummy'
      }
    });

    // Custom resource to generate and combine hex keys
    new custom.AwsCustomResource(this, 'GenerateHexKeys', {
      onCreate: {
        service: 'SecretsManager',
        action: 'updateSecret',
        parameters: {
          SecretId: secret.secretArn,
          SecretString: JSON.stringify({
            CREDS_KEY: generateHexKey(32),         // 64 hex chars (256-bit)
            CREDS_IV: generateHexKey(16),          // 32 hex chars (128-bit)
            JWT_SECRET: generateHexKey(32),        // 64 hex chars (256-bit)
            JWT_REFRESH_SECRET: generateHexKey(32), // 64 hex chars (256-bit)
            MEILI_MASTER_KEY: generateHexKey(16)   // 32 hex chars (128-bit)
          })
        },
        physicalResourceId: custom.PhysicalResourceId.of('GenerateHexKeys')
      },
      
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [secret.secretArn]
      })
    });

    this.secretTokens = secret;
  }
}
