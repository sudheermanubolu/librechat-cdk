import * as cdk from 'aws-cdk-lib';
import * as docdb from 'aws-cdk-lib/aws-docdb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as custom_resources from 'aws-cdk-lib/custom-resources';
import { InitDocumentDBLambda } from './init-documentdb-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';


interface DocumentDBProps {
  vpc: ec2.IVpc;
  instanceType?: ec2.InstanceType;
  instances?: number;
}

export class DocumentDB extends Construct {
  public readonly cluster: docdb.DatabaseCluster;
  public readonly port: number = 27017;
  private readonly initFunction: lambda.IFunction;
  public readonly secret: secretsmanager.ISecret;
  public readonly libreChatUserSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DocumentDBProps) {
    super(scope, id);

    // Create security group for DocumentDB
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'LibreChatDocumentDBSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for LibreChat DocumentDB cluster',
      allowAllOutbound: true,
    });

    // Allow inbound access on DocumentDB port
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(this.port),
      'Allow inbound DocumentDB access from VPC'
    );

    // Create new DocumentDB cluster
    this.cluster = new docdb.DatabaseCluster(this, 'LibreChatDocumentDBCluster', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      instanceType: props.instanceType || ec2.InstanceType.of(ec2.InstanceClass.R6G, ec2.InstanceSize.LARGE),
      instances: props.instances || 1,
      securityGroup: dbSecurityGroup,
      backup: {
        retention: cdk.Duration.days(7),
      },
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enablePerformanceInsights: false,
      exportProfilerLogsToCloudWatch: false,
      exportAuditLogsToCloudWatch: false,
      cloudWatchLogsRetention: logs.RetentionDays.ONE_WEEK,
      masterUser: {
        username: 'dbadmin',
        secretName: 'LibreChat/docdb/master-user-secret',
      },
      dbClusterName: 'librechat',
    });

    this.secret = this.cluster.secret!;

    // Create the LibreChat application user secret
    this.libreChatUserSecret = new secretsmanager.Secret(this, 'LibreChatUserSecret', {
      secretName: 'LibreChat/docdb/app-user',
      description: 'Credentials for LibreChat application user in DocumentDB',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'librechat-dbuser',
          host: this.cluster.clusterEndpoint.hostname,
          port: 27017,
          dbname: 'LibreChat',
          replicaSet: 'rs0',
          readPreference: 'secondaryPreferred',
          MONGO_URI: `mongodb://librechat-dbuser:dummy-password@${this.cluster.clusterEndpoint.hostname}:27017/LibreChat?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false`
        }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 20
      }
    });

    // Add dependency to ensure secret is created after cluster
    this.libreChatUserSecret.node.addDependency(this.cluster);

    // Create initialization Lambda function
    const initLambda = new InitDocumentDBLambda(this, 'InitFunction', {
      cluster: this.cluster,
      vpc: props.vpc,
      dbSecret: this.secret,
      libreChatUserSecret: this.libreChatUserSecret
    });

    // Ensure Lambda is created after cluster and secrets
    initLambda.handler.node.addDependency(this.cluster);
    initLambda.handler.node.addDependency(this.libreChatUserSecret);

    // Create custom resource to trigger Lambda
    new custom_resources.AwsCustomResource(this, 'InitDocumentDB', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: initLambda.handler.functionName,
          InvocationType: 'RequestResponse'
        },
        physicalResourceId: custom_resources.PhysicalResourceId.of('InitDocumentDBCustomResource-' + Date.now())
      },
      policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'], 
          resources: [initLambda.handler.functionArn],
          effect: iam.Effect.ALLOW
      })
    ])
    });
  }
}
