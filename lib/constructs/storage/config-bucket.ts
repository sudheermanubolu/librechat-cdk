import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';

export class ConfigBucket extends s3.Bucket {
    constructor(scope: Construct, id: string) {
        super(scope, id, {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            versioned: true,
            enforceSSL: true,
            lifecycleRules: [
                {
                    enabled: true,
                    noncurrentVersionTransitions: [
                        {
                            storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                            transitionAfter: cdk.Duration.days(30)
                        }
                    ]
                }
            ]
        });
        // Deploy config files to the bucket
        new s3deploy.BucketDeployment(this, 'LibreConfigDeployment', {
            sources: [s3deploy.Source.asset(path.resolve(process.cwd(), 'config/Libre_config'))],
            destinationBucket: this,
            destinationKeyPrefix: 'config',
            prune: false, // Set to true if you want to delete files in the bucket that are not in the source
            retainOnDelete: false, // Keeps the files in the bucket even if the stack is destroyed
        });
    }
}