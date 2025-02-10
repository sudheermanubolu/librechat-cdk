import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { DocumentDB } from './constructs/database/documentdb';
import { Construct } from 'constructs';
import { LibreChatCdkStackProps } from './interfaces/types';
import { VpcConstruct } from './constructs/network/vpc';
import { EFSStorage } from './constructs/storage/efs';
import { AuroraPostgres } from './constructs/database/postgres';
import { LibreChatService } from './constructs/compute/services/librechat-service';
import { MeilisearchService } from './constructs/compute/services/meilisearch';
import { ConfigBucket } from './constructs/storage/config-bucket';
import { RagApiService } from './constructs/compute/services/rag-api';


export class LibreChatCdkStack extends cdk.Stack {
    public readonly vpc: ec2.IVpc;
    public readonly documentDb: DocumentDB;
    public readonly ecsCluster: ecs.ICluster;
    private readonly props: LibreChatCdkStackProps;

    constructor(scope: Construct, id: string, props: LibreChatCdkStackProps) {
        super(scope, id, props);
        
        // Store props after super() call
        this.props = props;
        
        // Input validation
        if (!this.props.config?.documentDb?.instanceType) {
            throw new Error('DocumentDB instance type configuration is required');
        }
        if (!this.props.config?.vpc) {
            throw new Error('VPC configuration is required');
        }
        if (!this.props.config?.region) {
            throw new Error('Region configuration is required');
        }
        if (!this.props.config?.domain?.name || !this.props.config?.domain?.certificateArn) {
            throw new Error('Domain configuration is required');
        }

        // Create or import VPC
        const vpcConstruct = new VpcConstruct(this, 'VPC', this.props.config.vpc);
        this.vpc = vpcConstruct.vpc;

        // Create EFS Storage for Meilisearch
        const efsStorage = new EFSStorage(this, 'LibreChatEFS', {
            vpc: this.vpc
        });

        // Create Config Bucket
        // Create Aurora PostgreSQL
        const postgres = new AuroraPostgres(this, 'PostgresDatabase', {
            vpc: this.vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
        });

        // Create DocumentDB - Parse instance class and size from config
        const [instanceClass, instanceSize] = props.config.documentDb.instanceType.split('.');
        if (!instanceClass || !instanceSize) {
            throw new Error(`Invalid instance type format: ${props.config.documentDb.instanceType}`);
        }

        const instanceType = ec2.InstanceType.of(
            instanceClass.toUpperCase() as ec2.InstanceClass,
            instanceSize.toUpperCase() as ec2.InstanceSize
        );

        this.documentDb = new DocumentDB(this, 'Database', {
            vpc: this.vpc,
            instanceType: instanceType,
            instances: props.config.documentDb.instances,
        });

        // Create ECS Cluster
        this.ecsCluster = new ecs.Cluster(this, 'LibreChatCluster', {
            vpc: this.vpc,
            containerInsightsV2: ecs.ContainerInsights.ENHANCED,
            defaultCloudMapNamespace: {
                name: 'librechat',
            },
            enableFargateCapacityProviders: true
        });
        
        // Add VPC endpoints to optimize network traffic
        new ec2.InterfaceVpcEndpoint(this, 'EcrEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR,
        });
        new ec2.InterfaceVpcEndpoint(this, 'EcrDockerEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        });
        new ec2.InterfaceVpcEndpoint(this, 'CloudWatchLogsEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        });
        new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
            vpc: this.vpc,
            service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        });

        // Apply removal policy to cluster
        this.ecsCluster.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

        // If namespace exists, apply removal policy
        if (this.ecsCluster.defaultCloudMapNamespace) {
            this.ecsCluster.defaultCloudMapNamespace.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        }

        // Create S3 bucket for config files
        const configBucket = new ConfigBucket(this, `config-bucket-${process.env.ENVIRONMENT || 'XXX'}`);


        const meilisearchService = new MeilisearchService(this, 'MeilisearchService', {
            vpc: this.vpc,
            cluster: this.ecsCluster,
            meilisearchImage: props.config.container.meiliSearchImage,
            fileSystem: efsStorage.fileSystem,
            accessPoint: efsStorage.meiliSearchAccessPoint,
        });

        efsStorage.fileSystem.connections.allowFrom(
            meilisearchService.service.connections,
            ec2.Port.tcp(2049),
            'Allow EFS access from Meilisearch ECS service'
        );

        // Create RAG API Service
        const ragApiService = new RagApiService(this, 'RagApi', {
            vpc: this.vpc,
            cluster: this.ecsCluster,
            configBucket: configBucket,
            dbSecurityGroup: postgres.dbSecurityGroup,
            ragAPIImage: this.props.config.container.ragAPIImage,
            config: this.props.config,
            secretTokens: props.secretTokens,
        });

        // Create LibreChat Service
        const libreChatService = new LibreChatService(this, 'LibreChatService', {
            vpc: this.vpc,
            cluster: this.ecsCluster,
            configBucket: configBucket,
            // Debug log the domain configuration
            domainName: (() => {
                console.log('Domain config:', props.config.domain);
                return props.config.domain.name;
            })(),
            certificateArn: props.config.domain.certificateArn,
            mongoSecret: this.documentDb.libreChatUserSecret,
            secretTokens: props.secretTokens,
            libreChatImage: props.config.container.libreChatImage,
            fileSystem: efsStorage.fileSystem,
            accessPoint: efsStorage.libreChatAccessPoint,
        });

        efsStorage.fileSystem.connections.allowFrom(
            libreChatService.service.connections,
            ec2.Port.tcp(2049),
            'Allow EFS access from LibreChat ECS service'
        );
        //allow access from librechat service to meilisearch service
        meilisearchService.service.connections.allowFrom(
            libreChatService.service,
            ec2.Port.tcp(7700),
            'Allow access from LibreChat service to Meilisearch service'
        );
        //allow access from librechat service to rag api service
        ragApiService.service.connections.allowFrom(
            libreChatService.service,
            ec2.Port.tcp(8000),
            'Allow access from LibreChat service to RAG API service'
        );

        this.addTags();
    }

    private addTags(): void {
        const tags = {
            Project: 'LibreChat',
            Environment: this.props.config.region,
            Stack: this.stackName,
            CreatedBy: 'CDK',
            CreatedDate: new Date().toISOString(),
        };

        Object.entries(tags).forEach(([key, value]) => {
            if (value) {  // Only add tag if value exists
                cdk.Tags.of(this).add(key, value);
            }
        });
    }
}
