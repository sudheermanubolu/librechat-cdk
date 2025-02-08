import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as efs from 'aws-cdk-lib/aws-efs';
import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'; 


export interface MeilisearchServiceProps {
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  meilisearchImage?: {
    repository: string;
    tag: string;
  };
  fileSystem: efs.FileSystem;
  accessPoint: efs.AccessPoint;
  libreChatService: ecs.FargateService;
}

export class MeilisearchService extends Construct {
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: MeilisearchServiceProps) {
    super(scope, id);

    if (!props.meilisearchImage?.repository || !props.meilisearchImage?.tag) {
      throw new Error('Meilisearch image configuration is missing repository or tag');
    }
    
    // Add explicit dependency on the LibreChat service
    this.node.addDependency(props.libreChatService);

    // Create security group for the Fargate service
    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Meilisearch Fargate service',
      allowAllOutbound: true,
    });

    // Allow inbound traffic on port 7700 from LibreChat security group
    serviceSecurityGroup.addIngressRule(
      props.libreChatService.connections.securityGroups[0],
      ec2.Port.tcp(7700),
      'Allow inbound traffic from LibreChat service on port 7700'
    );

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      taskRole: new iam.Role(this, 'TaskRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
        ]
        }),
      executionRole: new iam.Role(this, 'ExecutionRole', {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      })
    });
    // Grant EFS access to task role
    props.fileSystem.grant(
      taskDefinition.taskRole,
      'elasticfilesystem:ClientMount',
      'elasticfilesystem:ClientWrite',
      'elasticfilesystem:ClientRootAccess'
    );

    // Grant Secrets Manager access for Meilisearch master key
    const meiliSecret = secretsmanager.Secret.fromSecretNameV2(
      this, 
      'MeilisearchSecretRef', 
      'LibreChat/app/LibreSecretTokens'
    );
    meiliSecret.grantRead(taskDefinition.executionRole!);



    // Add EFS volume to task definition
    const volumeName = 'meilisearch-data';
    taskDefinition.addVolume({
      name: volumeName,
      efsVolumeConfiguration: {
        fileSystemId: props.fileSystem.fileSystemId,
        transitEncryption: 'ENABLED',
        authorizationConfig: {
          accessPointId: props.accessPoint.accessPointId,
          iam: 'ENABLED',
        },
      },
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('meilisearch', {
      image: ecs.ContainerImage.fromRegistry(`${props.meilisearchImage.repository}:${props.meilisearchImage.tag}`),
      essential: true,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'Meilisearch' }),
      portMappings: [{ 
        containerPort: 7700,
        name: 'meilisearch-port'
       }],
      environment: {
        'MEILI_NO_ANALYTICS': 'true',
        'MEILI_HOST': 'http://meilisearch:7700',
      },
      secrets: {
        'MEILI_MASTER_KEY': ecs.Secret.fromSecretsManager(meiliSecret, 'MEILI_MASTER_KEY')
      }
    });

    // Add the mount points after creating the container
    container.addMountPoints({
      sourceVolume: volumeName,
      containerPath: '/meili_data',
      readOnly: false
    });

    // Create the Fargate service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition,
      desiredCount: 1,
      maxHealthyPercent: 200,
      minHealthyPercent: 100,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      enableExecuteCommand: true,
      serviceConnectConfiguration: {
        namespace: props.cluster.defaultCloudMapNamespace?.namespaceName ?? 'librechat',
        services: [{
          portMappingName: 'meilisearch-port',
          dnsName: 'meilisearch',
          port: 7700,
          discoveryName: 'meilisearch'
        }]
      }
    });

    // Allow EFS access from the Fargate service
    props.fileSystem.connections.allowDefaultPortFrom(
      serviceSecurityGroup,
      'Allow EFS access from Meilisearch service'
    );
  }
}