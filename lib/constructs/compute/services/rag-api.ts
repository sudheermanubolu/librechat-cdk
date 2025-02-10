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
        inlinePolicies: {
          'CloudMapAccess': new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['servicediscovery:*'],
                resources: ['*']
              })
            ]
          })
        }
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

    // Add Bedrock and S3 permissions
    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:*',
          's3:GetObject',
          's3:ListBucket',
        ],
        resources: [
          props.configBucket.arnForObjects('*'),
          props.configBucket.bucketArn
        ],
      })
    );
    props.secretTokens.grantRead(taskDefinition.taskRole);

    // Load secrets from Secrets Manager
    const dbSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 
      'RagDbSecret', 
      'LibreChat/Postgres/rag_user'
    );
    dbSecret.grantRead(taskDefinition.executionRole!);
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
        DB_HOST: ecs.Secret.fromSecretsManager(dbSecret, 'DB_HOST'),
        DB_PORT: ecs.Secret.fromSecretsManager(dbSecret, 'DB_PORT'),
        POSTGRES_DB: ecs.Secret.fromSecretsManager(dbSecret, 'POSTGRES_DB'),
        POSTGRES_USER: ecs.Secret.fromSecretsManager(dbSecret, 'POSTGRES_USER'),
        POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'POSTGRES_PASSWORD'),
        // LibreChat security tokens
        CREDS_KEY: ecs.Secret.fromSecretsManager(props.secretTokens, 'CREDS_KEY'),
        CREDS_IV: ecs.Secret.fromSecretsManager(props.secretTokens, 'CREDS_IV'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(props.secretTokens, 'JWT_SECRET'),
        JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(props.secretTokens, 'JWT_REFRESH_SECRET'),
      },
    });

    // Add Bedrock permissions for embeddings
    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream'
      ],
      resources: [
        // Add specific model ARNs for your region
        `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/*`
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