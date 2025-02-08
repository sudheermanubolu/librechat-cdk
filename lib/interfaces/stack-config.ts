export interface StackConfig {
  vpc: {
    useExisting: boolean;
    existingVpcId?: string;
    newVpc?: {
      maxAzs: number;
      natGateways: number;
      cidr: string;
    };
  };
  region: string;
  documentDb: {
    instanceType: string;
    instances: number;
  };
  aurora?: {
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
      monitoring?: {
        enableEnhancedMonitoring: boolean;
        monitoringInterval: number;
        logsExports: string[];
        logsRetentionDays: number;
      };
      tags?: Record<string, string>;
    };
  };
  domain?: {
    name: string;
    certificateArn: string;
  };
}