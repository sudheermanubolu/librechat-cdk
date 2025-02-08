import { StackProps } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export type Config = Readonly<{
    region: string;
    domain: {
        name: string;
        certificateArn: string;
    };
    vpc: {
        useExisting: boolean;
        existingVpcId: string | '';  // Allow empty string when not using existing VPC
        newVpc: {
            maxAzs: number;
            natGateways: number;
            cidr: string;
        };
    };
    aurora: {
        engine: string;
        engineVersion: string;
        instanceClass: string;
        minCapacity: number;
        maxCapacity: number;
        multiAz: boolean;
        database: {
            name: string;
            port: number;
            backupRetentionDays: number;
            backupWindow: string;
            maintenanceWindow: string;
            deletionProtection: boolean;
            monitoring: {
                enableEnhancedMonitoring: boolean;
                monitoringInterval: number;
                logsExports: string[];
                logsRetentionDays: number;
            };
            tags: {
                [key: string]: string;
            };
        };
    };
    container: {
        libreChatImage: {
            repository: string;
            tag: string;
        },
        meiliSearchImage: {
            repository: string;
            tag: string;
        },
        ragAPIImage: {
            repository: string;
            tag: string;
        }
    };
    documentDb: {
        instanceType: string;
        instances: number;
    };
}>;

export interface VpcConstructProps {
    useExisting: boolean;
    existingVpcId: string;
    newVpc: {
      maxAzs: number;
      natGateways: number;
      cidr: string;
    };
  }
  
  export interface LibreChatCdkStackProps extends StackProps {
    config: Config;
    secretTokens: secretsmanager.ISecret; 
  }
  
