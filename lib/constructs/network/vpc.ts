import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { VpcConstructProps } from '../../interfaces/types';

export class VpcConstruct extends Construct {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    if (props.useExisting && props.existingVpcId) {
      // Use existing VPC
      this.vpc = ec2.Vpc.fromLookup(this, 'ImportedVpc', {
        vpcId: props.existingVpcId
      });
    } else if (props.newVpc) {
      // Create new VPC with only public and private subnets
      this.vpc = new ec2.Vpc(this, 'LibreChatVpc', {
        maxAzs: props.newVpc.maxAzs,
        natGateways: props.newVpc.natGateways,
        ipAddresses: ec2.IpAddresses.cidr(props.newVpc.cidr),
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          }
        ],
      });

      // Add outputs for the new VPC
      new cdk.CfnOutput(this, 'VpcId', { 
        value: this.vpc.vpcId,
        description: 'VPC ID'
      });

      new cdk.CfnOutput(this, 'PublicSubnets', { 
        value: this.vpc.publicSubnets.map(subnet => 
          `${subnet.subnetId} (${subnet.availabilityZone})`
        ).join('\n'),
        description: 'Public Subnets'
      });

      new cdk.CfnOutput(this, 'PrivateSubnets', { 
        value: this.vpc.privateSubnets.map(subnet => 
          `${subnet.subnetId} (${subnet.availabilityZone})`
        ).join('\n'),
        description: 'Private Subnets'
      });
    } else {
      throw new Error('Invalid VPC configuration');
    }
  }
}
