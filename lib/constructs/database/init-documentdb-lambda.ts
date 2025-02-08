import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { DatabaseLayer } from './lambda-layer';

interface InitDocumentDBLambdaProps {
  cluster: docdb.DatabaseCluster;
  vpc: cdk.aws_ec2.IVpc;
  dbSecret: secretsmanager.ISecret;
  libreChatUserSecret: secretsmanager.ISecret;
}

export class InitDocumentDBLambda extends Construct {
  public readonly handler: lambda.IFunction;

  constructor(scope: Construct, id: string, props: InitDocumentDBLambdaProps) {
    super(scope, id);

    // Create MongoDB Layer
    const mongoDbLayer = new DatabaseLayer(this, 'MongoDBLayer');

    // Create Security Group first
    const lambdaSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true, 
    });

    // Add a version to the environment variables
    const configVersion = '1.0.1'; // Increment this when you change env vars or layers


    // Create Lambda function
    this.handler = new lambda.Function(this, 'InitDocumentDBHandler', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'init_documentdb.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../src/lambda')),
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [lambdaSecurityGroup], // Assign the security group
      layers: [mongoDbLayer.layer],
      memorySize: 256,
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        DOCDB_CLUSTER_ENDPOINT: props.cluster.clusterEndpoint.hostname,
        DOCDB_INSTANCE_NAME: props.cluster.clusterEndpoint.hostname.split('.')[0],
        DOCDB_INSTANCE_ENDPOINT: props.cluster.clusterEndpoint.hostname,
        DOCDB_PORT: props.cluster.clusterEndpoint.port.toString(),
        DOCDB_SECRET_ARN: props.dbSecret.secretArn,
        CONFIG_VERSION: configVersion, // Add version to force updates
        LIBRECHAT_USER_SECRET_ARN: props.libreChatUserSecret.secretArn
      },
      // Force new deployment when config changes
      description: `DocumentDB initialization function (Config: ${configVersion})`,
    });

    // Grant Lambda permissions to read DB secret
    props.dbSecret.grantRead(this.handler);
    props.libreChatUserSecret.grantWrite(this.handler);
    props.libreChatUserSecret.grantRead(this.handler);

    // Add VPC-related permissions
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
        ],
        resources: ['*'],
      })
    );
  }
}
