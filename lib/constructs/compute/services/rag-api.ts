import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { StackConfig } from '../../../interfaces/stack-config';
import { Stack } from 'aws-cdk-lib';

export interface RagApiServiceProps {
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  ragAPIImage?: {
    repository: string;
    tag: string;
  };
  configBucket: s3.IBucket;
  dbSecurityGroup: ec2.ISecurityGroup;
  dbSecret: secretsmanager.ISecret;
  config: StackConfig;
  secretTokens: secretsmanager.ISecret;
}

export class RagApiService extends Construct {
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: RagApiServiceProps) {
    super(scope, id);

    if (!props.ragAPIImage?.repository || !props.ragAPIImage?.tag) {
      throw new Error('ragAPI image configuration is missing repository or tag');
    }

    // Create security group for the Fargate service
    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RAG API Fargate service',
      allowAllOutbound: true,
    });

    // Allow inbound traffic from the service to the database
    props.dbSecurityGroup.addIngressRule(
      serviceSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access from RAG API'
    );

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      taskRole: new iam.Role(this, 'TaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudMapDiscoverInstanceAccess')
        ],
        // Note: AWSCloudMapDiscoverInstanceAccess managed policy provides required service discovery permissions
      }),
      executionRole: new iam.Role(this, 'ExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudMapDiscoverInstanceAccess')
        ]
      })
    });

    props.configBucket.grantRead(taskDefinition.executionRole!);

    // S3 permissions for config bucket (Bedrock permissions added separately below)
    props.secretTokens.grantRead(taskDefinition.taskRole);

    // Grant read access to secrets
    props.dbSecret.grantRead(taskDefinition.executionRole!);
    props.secretTokens.grantRead(taskDefinition.executionRole!);

    

    // Add container to task definition
    const container = taskDefinition.addContainer('rag-api', {
      image: ecs.ContainerImage.fromRegistry(`${props.ragAPIImage.repository}:${props.ragAPIImage.tag}`),
      essential: true,
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'librechat-rag',
        logRetention: logs.RetentionDays.ONE_MONTH
      }),
      environmentFiles: [
        ecs.EnvironmentFile.fromBucket(
          props.configBucket,
          'config/librechat.env'
        )
      ],
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(props.dbSecret, 'DB_HOST'),
        DB_PORT: ecs.Secret.fromSecretsManager(props.dbSecret, 'DB_PORT'),
        POSTGRES_DB: ecs.Secret.fromSecretsManager(props.dbSecret, 'POSTGRES_DB'),
        POSTGRES_USER: ecs.Secret.fromSecretsManager(props.dbSecret, 'POSTGRES_USER'),
        POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'POSTGRES_PASSWORD'),
        // LibreChat security tokens
        CREDS_KEY: ecs.Secret.fromSecretsManager(props.secretTokens, 'CREDS_KEY'),
        CREDS_IV: ecs.Secret.fromSecretsManager(props.secretTokens, 'CREDS_IV'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(props.secretTokens, 'JWT_SECRET'),
        JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(props.secretTokens, 'JWT_REFRESH_SECRET'),
      },
    });

    // Add Bedrock permissions for embeddings (allow all regions for cross-region models)
    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        // Foundation models in all regions
        `arn:aws:bedrock:*::foundation-model/*`,
        // Cross-region inference profiles
        `arn:aws:bedrock:*:${Stack.of(this).account}:inference-profile/*`
      ]
    });
    taskDefinition.taskRole.addToPrincipalPolicy(bedrockPolicy);

    container.addPortMappings({ 
      containerPort: 8000,
      protocol: ecs.Protocol.TCP,
      name: 'rag-port'
    });

    // Create ECS Service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition,
      securityGroups: [serviceSecurityGroup],
      desiredCount: 1,
      maxHealthyPercent: 200,
      minHealthyPercent: 50,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      enableExecuteCommand: true,
      serviceConnectConfiguration: {
        namespace: props.cluster.defaultCloudMapNamespace?.namespaceName ?? 'librechat',
        services: [{
          portMappingName: 'rag-port',
          dnsName: 'librechat-rag',
          port: 8000,
          discoveryName: 'librechat-rag'
        }]
      },
    });
  }
}