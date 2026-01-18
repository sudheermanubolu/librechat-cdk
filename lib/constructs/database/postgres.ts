import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as custom_resources from 'aws-cdk-lib/custom-resources';
import { InitPostgresLambda } from './init-postgres-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';


interface AuroraPostgresProps {
  vpc: ec2.IVpc;
  instanceType?: ec2.InstanceType;
  postgresVersion: string;
}

export class AuroraPostgres extends Construct {
  public readonly cluster: rds.DatabaseCluster;
  public readonly port: number = 5432;
  private readonly initFunction: lambda.IFunction;
  public readonly secret: secretsmanager.ISecret;
  public readonly bedrockUserSecret: secretsmanager.Secret;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: AuroraPostgresProps) {
    super(scope, id);

    // Create security group for Aurora PostgreSQL
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'LibreChatPostgresSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for LibreChat Aurora PostgreSQL cluster',
      allowAllOutbound: true,
    });

    // Allow inbound access on PostgreSQL port
    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(this.port),
      'Allow inbound PostgreSQL access from VPC'
    );

    // Create new Aurora PostgreSQL cluster
    const databaseName = 'rag_api';
    this.cluster = new rds.DatabaseCluster(this, 'LibreChatPostgresCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of(props.postgresVersion, props.postgresVersion.split('.')[0]),
      }),
      vpc: props.vpc,
      vpcSubnets: {
        subnetGroupName: 'Private',
      },
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        autoMinorVersionUpgrade: true,
        publiclyAccessible: false,
        enablePerformanceInsights: false,
      }),
      securityGroups: [this.dbSecurityGroup],
      backup: {
        retention: cdk.Duration.days(7),
      },
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      serverlessV2MinCapacity: 2,
      serverlessV2MaxCapacity: 16,
      cloudwatchLogsExports: [],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_WEEK,
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: 'LibreChat/Postgres/master-user-secret',
      }),
      defaultDatabaseName: databaseName,
    });

    this.secret = this.cluster.secret!;

    // Create the bedrock user secret
    // This secret stores credentials for the RAG API user that will be created during initialization
    // The init-postgres Lambda will populate the password field during database setup
    this.bedrockUserSecret = new secretsmanager.Secret(this, 'BedrockUserSecret', {
      secretName: 'LibreChat/Postgres/rag_user',
      description: 'Credentials for bedrock_user in PostgreSQL',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          POSTGRES_USER: 'rag',
          DB_HOST: this.cluster.clusterEndpoint.hostname,
          DB_PORT: this.port,
          POSTGRES_DB: databaseName
        }),
        generateStringKey: 'POSTGRES_PASSWORD',
        excludePunctuation: true,
        passwordLength: 20
      }
    });

    // Add a dependency to ensure the secret is created after the cluster
    this.bedrockUserSecret.node.addDependency(this.cluster);

    // Create initialization Lambda function
    const initLambda = new InitPostgresLambda(this, 'InitFunction', {
      cluster: this.cluster,
      vpc: props.vpc,
      dbSecret: this.secret,
      bedrockUserSecret: this.bedrockUserSecret,
      databaseName: databaseName
    });

    // Ensure Lambda is created after cluster and secrets
    initLambda.handler.node.addDependency(this.cluster);
    initLambda.handler.node.addDependency(this.bedrockUserSecret);

    // Create custom resource to trigger Lambda after cluster creation
    const customResource = new custom_resources.AwsCustomResource(this, 'InitPostgres', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: initLambda.handler.functionName,
          InvocationType: 'RequestResponse'
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of('InitPostgresCustomResource-' + Date.now())
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
        resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE
      })
    });

    // Grant the custom resource role permission to invoke the Lambda
    initLambda.handler.grantInvoke(customResource);

    // Ensure custom resource is created after Lambda function
    customResource.node.addDependency(initLambda.handler);
  }
}
