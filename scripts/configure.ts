import * as inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export async function configure() {
    try {
        const defaultConfigPath = path.join(__dirname, '../config/default-config.json');
        
        if (!fs.existsSync(defaultConfigPath)) {
            throw new Error('Default configuration file not found');
        }

        const defaultConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'));
        
        console.log('LibreChat CDK Configuration Setup');
        console.log('================================\n');

        const { configMethod } = await inquirer.prompt([{
            type: 'list',
            name: 'configMethod',
            message: 'How would you like to configure the stack?',
            choices: [
                { name: 'Interactive setup', value: 'interactive' },
                { name: 'Use existing config file', value: 'file' }
            ]
        }]);

        if (configMethod === 'file') {
            console.log('Using default configuration');
            return defaultConfig;
        }

        const regions = execSync('aws ec2 describe-regions --query "Regions[].RegionName" --output text')
            .toString()
            .trim()
            .split('\t');

        // Import DocumentDB instance types
        const { documentDbInstanceTypes } = require('../config/instance-types');

        const config = await inquirer.prompt([
            {
                type: 'list',
                name: 'region',
                message: 'Select AWS region:',
                choices: regions,
                default: defaultConfig.region
            },
            {
                type: 'list',
                name: 'documentDbInstanceType',
                message: 'Select DocumentDB instance type:',
                choices: documentDbInstanceTypes,
                default: defaultConfig.documentDb.instanceType
            },
            {
                type: 'number',
                name: 'documentDbInstances',
                message: 'Number of DocumentDB instances:',
                default: defaultConfig.documentDb.instances,
                validate: (input: number) => {
                    return input >= 1 && input <= 10 || 'Please enter a number between 1 and 10';
                }
            },
            {
                type: 'confirm',
                name: 'useExistingVpc',
                message: 'Do you want to use an existing VPC?',
                default: defaultConfig.vpc.useExisting
            }
        ]);

        let vpcConfig;

        if (config.useExistingVpc) {
            const vpcs = execSync(
                `aws ec2 describe-vpcs --region ${config.region} --query "Vpcs[].{ID:VpcId,CIDR:CidrBlock}" --output json`
            );
            const vpcList = JSON.parse(vpcs.toString());

            const vpcAnswer = await inquirer.prompt([{
                type: 'list',
                name: 'existingVpcId',
                message: 'Select VPC:',
                choices: vpcList.map((vpc: any) => ({
                    name: `${vpc.ID} (${vpc.CIDR})`,
                    value: vpc.ID
                }))
            }]);

            vpcConfig = {
                useExisting: true,
                existingVpcId: vpcAnswer.existingVpcId
            };
        } else {
            const newVpcConfig = await inquirer.prompt([
                {
                    type: 'number',
                    name: 'maxAzs',
                    message: 'Maximum number of Availability Zones:',
                    default: defaultConfig.vpc.newVpc.maxAzs
                },
                {
                    type: 'number',
                    name: 'natGateways',
                    message: 'Number of NAT Gateways:',
                    default: defaultConfig.vpc.newVpc.natGateways
                },
                {
                    type: 'input',
                    name: 'cidr',
                    message: 'VPC CIDR range:',
                    default: defaultConfig.vpc.newVpc.cidr,
                    validate: (input: string) => {
                        const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/;
                        return cidrRegex.test(input) || 'Please enter a valid CIDR range';
                    }
                }
            ]);

            vpcConfig = {
                useExisting: false,
                newVpc: newVpcConfig
            };
        }

        const finalConfig = {
            region: config.region,
            vpc: vpcConfig,
            documentDb: {
                instanceType: config.documentDbInstanceType,
                instances: config.documentDbInstances
            }
        };

        // Save the configuration
        const currentConfigPath = path.join(__dirname, '../config/current-config.json');
        fs.writeFileSync(currentConfigPath, JSON.stringify(finalConfig, null, 2));
        
        return finalConfig;
    } catch (error) {
        console.error('Configuration error:', error);
        throw error;
    }
}
