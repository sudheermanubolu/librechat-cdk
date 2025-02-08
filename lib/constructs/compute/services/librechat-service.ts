import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

import { Construct } from 'constructs';

export interface LibreChatServiceProps {
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  configBucket: s3.IBucket;
  domainName?: string;
  certificateArn?: string;
  mongoSecret: secretsmanager.ISecret;
  secretTokens: secretsmanager.ISecret;
  libreChatImage?: {
    repository: string;
    tag: string;
  };
}

export class LibreChatService extends Construct {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: LibreChatServiceProps) {
    super(scope, id);

      // Debug log
    console.log('Certificate ARN:', props.certificateArn);
    console.log('Domain Name:', props.domainName);

    if (!props.libreChatImage?.repository || !props.libreChatImage?.tag) {
      throw new Error('LibreChat image configuration is missing repository or tag');
    }

    // Create ALB
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
    });

    // Create target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: 3080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        healthyHttpCodes: '200-399'
      },
      deregistrationDelay: cdk.Duration.seconds(30)
    });

    // Add listeners
    if (props.certificateArn && props.domainName) {
      // HTTP Listener with redirect
      this.loadBalancer.addListener('HttpListener', {
        port: 80,
        defaultAction: elbv2.ListenerAction.redirect({
          port: '443',
          protocol: 'HTTPS',
          permanent: true
        })
      });
    
      // HTTPS Listener
      this.loadBalancer.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [{ certificateArn: props.certificateArn }],
        defaultAction: elbv2.ListenerAction.forward([targetGroup])
      });
    } else {
      // HTTP only listener
      this.loadBalancer.addListener('HttpListener', {
        port: 80,
        defaultAction: elbv2.ListenerAction.forward([targetGroup])
      });
    }

    // Create shared volume for config files
    const sharedVolume: ecs.Volume = {
      name: 'config',
      dockerVolumeConfiguration: {
          scope: ecs.Scope.TASK,  // Use the enum instead of string 'task'
          driver: 'local',
          labels: { 'com.amazonaws.ecs.lifecycle': 'task' }
      }
    };

    // Create task definition with required volumes
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 4096,
      cpu: 2048,
      ephemeralStorageGiB: 21,
      // Explicitly create the task role
      taskRole: new iam.Role(this, 'TaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
      }),
    // Explicitly create the execution role
      executionRole: new iam.Role(this, 'ExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
      }),
      volumes: [{
        name: 'config'
      }]
    });

    // Grant task role access to S3 and Secrets Manager
    props.configBucket.grantRead(taskDefinition.taskRole);
    props.mongoSecret.grantRead(taskDefinition.taskRole);
    props.secretTokens.grantRead(taskDefinition.taskRole);

    // For the ECS agent to fetch secrets and env files
    props.configBucket.grantRead(taskDefinition.executionRole!);
    props.mongoSecret.grantRead(taskDefinition.executionRole!);
    props.secretTokens.grantRead(taskDefinition.executionRole!);

    // Create init container to copy config from S3
    const initContainer = taskDefinition.addContainer('init', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-cli/aws-cli:latest'),
      command: [
        's3',
        'cp',
        '--recursive',
        `s3://${props.configBucket.bucketName}/`,
        '/app/librechat/'
      ],
      essential: false,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'LibreChatInit' }),
      containerName: 'init'
    });
    initContainer.addMountPoints({
      containerPath: '/app/librechat/config',
      readOnly: false,
      sourceVolume: 'config'
    });


    // Add container
    const container = taskDefinition.addContainer('LibreChat', {
      image: ecs.ContainerImage.fromRegistry( 
        `${props.libreChatImage?.repository}:${props.libreChatImage?.tag}`
      ),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'LibreChat' }),
      secrets: {
        // MongoDB secrets
        MONGO_URI: ecs.Secret.fromSecretsManager(props.mongoSecret, 'MONGO_URI'),
        MONGODB_DATABASE: ecs.Secret.fromSecretsManager(props.mongoSecret, 'dbname'),
        
        // LibreChat security tokens
        CREDS_KEY: ecs.Secret.fromSecretsManager(props.secretTokens, 'CREDS_KEY'),
        CREDS_IV: ecs.Secret.fromSecretsManager(props.secretTokens, 'CREDS_IV'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(props.secretTokens, 'JWT_SECRET'),
        JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(props.secretTokens, 'JWT_REFRESH_SECRET'),
        MEILI_MASTER_KEY: ecs.Secret.fromSecretsManager(props.secretTokens, 'MEILI_MASTER_KEY')
      },
      environmentFiles: [
        ecs.EnvironmentFile.fromBucket(
          props.configBucket,
          'config/librechat.env'
        )
      ],
      environment: {
        HOST: '0.0.0.0',
        PORT: '3080',
        DOMAIN_CLIENT: props.certificateArn ? 
          `https://${props.domainName}` : 
          `http://${this.loadBalancer.loadBalancerDnsName}`,
        DOMAIN_SERVER: props.certificateArn ? 
          `https://${props.domainName}` : 
          `http://${this.loadBalancer.loadBalancerDnsName}`,
        MEILI_HOST: 'http://meilisearch:7700',
        CONFIG_PATH: "/app/librechat/config/librechat.yaml",
        ENABLE_STARTUP_PROMPT: 'true',
        DISABLE_REGISTRATION: process.env.DISABLE_REGISTRATION || 'false'
      },
      portMappings: [{ 
        name: 'librechat-port',
        protocol: ecs.Protocol.TCP,
        containerPort: 3080 }]
    });
    container.addMountPoints({
      containerPath: '/app/librechat/config',
      readOnly: true,
      sourceVolume: 'config'
    });

    // Add mount points for config files to main container
    container.addContainerDependencies({
      container: initContainer,
      condition: ecs.ContainerDependencyCondition.COMPLETE
    });
    
    // Configure container dependencies
    container.addContainerDependencies({
      container: initContainer,
      condition: ecs.ContainerDependencyCondition.COMPLETE
    });

    // Create security group for the service
    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSG', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: 'LibreChat service security group'
    });

    // Allow inbound traffic from ALB
    serviceSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(this.loadBalancer.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(3080),
      'Allow inbound from ALB'
    );

    // Add ingress rule for DocumentDB
    serviceSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(27017),
      'Allow MongoDB access'
    );

    // Create Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      cloudMapOptions: {
        name: `librechat-${cdk.Names.uniqueId(this)}`,
        dnsTtl: cdk.Duration.seconds(60),
        failureThreshold: 2,
      },
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      serviceConnectConfiguration: {
        namespace: props.cluster.defaultCloudMapNamespace?.namespaceName ?? 'librechat',
        services: [{
          portMappingName: 'librechat-port',
          port: 3080,
          dnsName: 'librechat',
          discoveryName: 'librechat',
        }]
      }, 
    });

    // removal policy and dependencies
    this.service.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    if (this.service.cloudMapService) {
      this.service.cloudMapService.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    }

    // Add autoscaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 8
    });

    // Add scaling based on request count
    scaling.scaleOnRequestCount('RequestScaling', {
      targetGroup,
      requestsPerTarget: 1000
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 70
    });

    // Add service as target to target group
    this.service.attachToApplicationTargetGroup(targetGroup);
  }
}