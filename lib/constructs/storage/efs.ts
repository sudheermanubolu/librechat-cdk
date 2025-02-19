import * as cdk from 'aws-cdk-lib';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface EFSStorageProps {
  vpc: ec2.IVpc;
}

export class EFSStorage extends Construct {
  public readonly fileSystem: efs.FileSystem;
  public readonly meiliSearchAccessPoint: efs.AccessPoint;
  public readonly libreChatAccessPoint: efs.AccessPoint;

  constructor(scope: Construct, id: string, props: EFSStorageProps) {
    super(scope, id);

    // Create EFS File System
    this.fileSystem = new efs.FileSystem(this, 'LibreSearchEFS', {
      vpc: props.vpc,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      throughputMode: efs.ThroughputMode.ELASTIC,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }
    });

    // Create access point for Meilisearch
    this.meiliSearchAccessPoint = this.fileSystem.addAccessPoint('MeiliSearchAccessPoint', {
      path: '/meili_data',
      createAcl: {
        ownerGid: '1001',
        ownerUid: '1001',
        permissions: '755'
      },
      posixUser: {
        gid: '1001',
        uid: '1001'
      }
    });

    // Create access point for LibreChat
    this.libreChatAccessPoint = this.fileSystem.addAccessPoint('LibreChatAccessPoint', {
      path: '/app/client/public/images',
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '755'
      },
      posixUser: {
        gid: '1000',
        uid: '1000'
      }
    });

  }
}