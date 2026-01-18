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
      const useVpcEndpoints = props.newVpc.useVpcEndpoints ?? false;
      // Keep NAT gateway even with VPC endpoints for external API access (LLM APIs, etc.)
      const natGateways = props.newVpc.natGateways;

      // Create new VPC with public and private subnets
      // Private subnets use NAT for internet access (required for external LLM APIs)
      const vpc = new ec2.Vpc(this, 'LibreChatVpc', {
        maxAzs: props.newVpc.maxAzs,
        natGateways: natGateways,
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

      this.vpc = vpc;

      // Add VPC endpoints for AWS services (cost-effective alternative to NAT Gateway)
      if (useVpcEndpoints) {
        // ECR API endpoint
        vpc.addInterfaceEndpoint('EcrApiEndpoint', {
          service: ec2.InterfaceVpcEndpointAwsService.ECR,
        });

        // ECR Docker endpoint
        vpc.addInterfaceEndpoint('EcrDkrEndpoint', {
          service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        });

        // CloudWatch Logs endpoint
        vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
          service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        });

        // Secrets Manager endpoint (for database credentials)
        vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
          service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        });

        // S3 Gateway endpoint (free, for ECR image layers)
        vpc.addGatewayEndpoint('S3Endpoint', {
          service: ec2.GatewayVpcEndpointAwsService.S3,
        });

        new cdk.CfnOutput(this, 'VpcEndpointsEnabled', {
          value: 'true',
          description: 'VPC Endpoints enabled (ECR, CloudWatch Logs, Secrets Manager, S3)',
        });
      }

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
