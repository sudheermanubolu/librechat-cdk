import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { DatabaseLayer } from './lambda-layer';

interface InitPostgresLambdaProps {
  cluster: rds.DatabaseCluster;
  vpc: cdk.aws_ec2.IVpc;
  dbSecret: secretsmanager.ISecret;
  bedrockUserSecret: secretsmanager.ISecret;
  databaseName: string;
}

export class InitPostgresLambda extends Construct {
  public readonly handler: lambda.IFunction;

  constructor(scope: Construct, id: string, props: InitPostgresLambdaProps) {
    super(scope, id);

    // Create Database Layer
    const databaseLayer = new DatabaseLayer(this, 'DatabaseLayer');

    // Create Security Group first
    const lambdaSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true, 
    });

    // Add a version to the environment variables
    const configVersion = '1.0.0'; // Increment this when you change env vars or layers

    // Create Lambda function
    this.handler = new lambda.Function(this, 'InitPostgresHandler', {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'init_postgres.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../src/lambda')),
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [lambdaSecurityGroup],
      layers: [databaseLayer.layer],
      memorySize: 256,
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      environment: {
        POSTGRES_CLUSTER_ENDPOINT: props.cluster.clusterEndpoint.hostname,
        POSTGRES_PORT: props.cluster.clusterEndpoint.port.toString(),
        POSTGRES_SECRET_ARN: props.dbSecret.secretArn,
        BEDROCK_USER_SECRET_ARN: props.bedrockUserSecret.secretArn,
        DATABASE_NAME: props.databaseName, 
        CONFIG_VERSION: configVersion,
      },
      description: `PostgreSQL initialization function (Config: ${configVersion})`,
    });

    // Grant Lambda permissions to read DB secret
    props.dbSecret.grantRead(this.handler);

    // Grant Lambda permissions to read and write to bedrock user secret
    props.bedrockUserSecret.grantWrite(this.handler);
    props.bedrockUserSecret.grantRead(this.handler);

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
