#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LibreChatCdkStack } from '../lib/librechat-cdk-stack';
import { LibreSecretTokensStack } from '../lib/constructs/compute/services/libre-secret-tokens-stack';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../lib/interfaces/types';

// Create a separate config loader function
const loadConfig = (): Config => {
    try {
        const configPath = path.join(__dirname, '..', 'config', 'current-config.json');
        const defaultConfigPath = path.join(__dirname, '..', 'config', 'default-config.json');
        
        // Load default config first
        console.log('Loading default config from:', defaultConfigPath);
        const defaultConfigContent = fs.readFileSync(defaultConfigPath, 'utf8');
        console.log('Default config content:', defaultConfigContent);
        // Parse and validate default config
        const defaultConfig = JSON.parse(defaultConfigContent);
        console.log('Parsed default config:', defaultConfig);
        if (!defaultConfig || typeof defaultConfig !== 'object') {
            throw new Error('Default config is not a valid object after parsing');
        }
        
        // Load and merge current config if it exists
        console.log('Checking for current config at:', configPath);
        const currentConfig = fs.existsSync(configPath) 
            ? (() => {
                console.log('Found current config, loading...');
                const content = fs.readFileSync(configPath, 'utf8');
                console.log('Current config content:', content);
                // Parse and validate current config
                const parsedConfig = JSON.parse(content);
                console.log('Parsed current config:', parsedConfig);
                if (!parsedConfig || typeof parsedConfig !== 'object') {
                    throw new Error('Current config is not a valid object after parsing');
                }
                return parsedConfig;
              })()
            : {};

        // Helper function to ensure non-nullability
        function ensureNonNull<T>(value: T | undefined | null, defaultValue: T): T {
            return (value !== undefined && value !== null) ? value : defaultValue;
        }

        // Helper function to merge nested objects
        function mergeNestedObjects<T>(current: any, defaultValue: T, path: string = 'root'): T {
            console.log(`Merging at path ${path}:`, { current, defaultValue });

            // Return default if current is undefined/null
            if (current === undefined || current === null) {
                console.log(`Using default at ${path} due to undefined/null current`);
                return defaultValue;
            }

            // Handle primitive types
            if (typeof defaultValue === 'boolean') {
                const result = Boolean(current);
                console.log(`Boolean at ${path}:`, result);
                return result as T;
            }

            if (typeof defaultValue === 'number') {
                const num = Number(current);
                const result = isNaN(num) ? defaultValue : num;
                console.log(`Number at ${path}:`, result);
                return result as T;
            }

            if (typeof defaultValue === 'string') {
                const result = String(current);
                console.log(`String at ${path}:`, result);
                return result as T;
            }

            // Handle arrays
            if (Array.isArray(defaultValue)) {
                // If current is not an array or is empty, use default
                if (!Array.isArray(current) || current.length === 0) {
                    console.log(`Using default array at ${path}:`, defaultValue);
                    return [...defaultValue] as T;
                }
                // Otherwise use current array with same type checking as default
                const result = current.map(item => {
                    const defaultItemType = typeof defaultValue[0];
                    if (defaultItemType === typeof item) {
                        return item;
                    }
                    // Try to convert to the correct type
                    if (defaultItemType === 'string') {
                        return String(item);
                    }
                    if (defaultItemType === 'number') {
                        const num = Number(item);
                        return isNaN(num) ? defaultValue[0] : num;
                    }
                    if (defaultItemType === 'boolean') {
                        return Boolean(item);
                    }
                    return item;
                });
                console.log(`Processed array at ${path}:`, result);
                return result as T;
            }

            // Handle objects (but not null)
            if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
                console.log(`Merging object at ${path}`);
                const result: any = {};

                // Get all possible keys from both objects, ensuring only own properties
                const defaultKeys = Object.getOwnPropertyNames(defaultValue);
                const currentKeys = Object.getOwnPropertyNames(current);
                const allKeys = new Set([...defaultKeys, ...currentKeys]);

                // Process each key
                for (const key of allKeys) {
                    // Only include properties that exist in the default value
                    if (!Object.prototype.hasOwnProperty.call(defaultValue, key)) {
                        continue;
                    }
                    const defaultVal = (defaultValue as any)[key];
                    const currentVal = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined;

                    // Skip keys that don't exist in default value
                    if (defaultVal === undefined) continue;

                    // Recursively merge
                    result[key] = mergeNestedObjects(
                        currentVal,
                        defaultVal,
                        `${path}.${key}`
                    );
                }

                console.log(`Merged object at ${path}:`, result);
                return result;
            }

            // Fallback to default
            console.log(`Using default at ${path} as fallback`);
            return defaultValue;
        }

        console.log('Default config before merge:', JSON.stringify(defaultConfig, null, 2));
        console.log('Current config before merge:', JSON.stringify(currentConfig, null, 2));

        // Create the base config with properties in the correct order according to Config type
        const baseConfig: Config = {
            region: defaultConfig.region,
            domain: defaultConfig.domain,
            vpc: defaultConfig.vpc,
            aurora: defaultConfig.aurora,
            container: defaultConfig.container,
            documentDb: defaultConfig.documentDb
        };
        const mergedConfig: Config = {
            // Start with primitive values
            region: currentConfig.region !== undefined ? String(currentConfig.region) : baseConfig.region,

            // Handle domain config
            domain: mergeNestedObjects(
                currentConfig.domain ?? {},
                baseConfig.domain,
                'domain'
            ),

            // Handle VPC config
            vpc: mergeNestedObjects(
                currentConfig.vpc ?? {},
                baseConfig.vpc,
                'vpc'
            ),

            // Handle Aurora config
            aurora: mergeNestedObjects(
                currentConfig.aurora ?? {},
                baseConfig.aurora,
                'aurora'
            ),

            // Handle container config
            container: mergeNestedObjects(
                currentConfig.container ?? {},
                baseConfig.container,
                'container'
            ),

            // Handle DocumentDB config
            documentDb: mergeNestedObjects(
                currentConfig.documentDb ?? {},
                baseConfig.documentDb,
                'documentDb'
            ),
        };

        // Deep validation of merged structure before type assertion
        console.log('Pre-validation merged config:', JSON.stringify(mergedConfig, null, 2));
        
        // Additional type checks before validation
        console.log('Type checks:', {
            region: typeof mergedConfig.region,
            vpc: {
                useExisting: typeof mergedConfig.vpc?.useExisting,
                existingVpcId: typeof mergedConfig.vpc?.existingVpcId,
                newVpc: mergedConfig.vpc?.newVpc ? {
                    maxAzs: typeof mergedConfig.vpc.newVpc.maxAzs,
                    natGateways: typeof mergedConfig.vpc.newVpc.natGateways,
                    cidr: typeof mergedConfig.vpc.newVpc.cidr
                } : 'missing'
            },
            aurora: {
                engine: typeof mergedConfig.aurora?.engine,
                multiAz: typeof mergedConfig.aurora?.multiAz,
                database: mergedConfig.aurora?.database ? {
                    monitoring: mergedConfig.aurora.database.monitoring ? {
                        logsExports: Array.isArray(mergedConfig.aurora.database.monitoring.logsExports) 
                            ? 'array' : typeof mergedConfig.aurora.database.monitoring.logsExports
                    } : 'missing'
                } : 'missing'
            },
            documentDb: {
                instances: typeof mergedConfig.documentDb?.instances,
                instanceType: typeof mergedConfig.documentDb?.instanceType
            }
        });

        console.log('Merged configuration:', JSON.stringify(mergedConfig, null, 2));

        // Validate all required properties deeply
        const validateConfig = (config: any): config is Config => {
            const debug = true; // Enable debug logging
            
            const log = (message: string) => {
                if (debug) console.log('Config validation failed:', message);
            };

            // Check top-level properties existence
            if (!config.region || typeof config.region !== 'string') {
                log('Invalid or missing region');
                return false;
            }
            
            // Check domain properties
            if (!config.domain) {
                log('Missing domain configuration');
                return false;
            }
            if (!config.domain.name || !config.domain.certificateArn) {
                log('Missing domain name or certificateArn');
                return false;
            }
            
            // Check VPC properties
            if (!config.vpc) {
                log('Missing VPC configuration');
                return false;
            }
            if (typeof config.vpc.useExisting !== 'boolean') {
                log('Missing or invalid VPC useExisting property');
                return false;
            }
            
            // Validate existingVpcId - must be string (can be empty when not using existing VPC)
            if (typeof config.vpc.existingVpcId !== 'string') {
                log('existingVpcId must be a string (can be empty when not using existing VPC)');
                return false;
            }
            // When using existing VPC, existingVpcId must not be empty
            if (config.vpc.useExisting && !config.vpc.existingVpcId) {
                log('existingVpcId is required when useExisting is true');
                return false;
            }
            
            // Validate newVpc properties - required regardless of useExisting
            if (!config.vpc.newVpc) {
                log('Missing newVpc configuration');
                return false;
            }
            if (typeof config.vpc.newVpc.maxAzs !== 'number' || 
                typeof config.vpc.newVpc.natGateways !== 'number' || 
                typeof config.vpc.newVpc.cidr !== 'string') {
                log('Missing or invalid required properties in newVpc configuration');
                return false;
            }
            
            // Check Aurora properties
            if (!config.aurora) {
                log('Missing Aurora configuration');
                return false;
            }

            // Check Aurora base properties
            if (!config.aurora.engine || typeof config.aurora.engine !== 'string') {
                log('Missing or invalid Aurora engine');
                return false;
            }
            if (!config.aurora.engineVersion || typeof config.aurora.engineVersion !== 'string') {
                log('Missing or invalid Aurora engineVersion');
                return false;
            }
            if (!config.aurora.instanceClass || typeof config.aurora.instanceClass !== 'string') {
                log('Missing or invalid Aurora instanceClass');
                return false;
            }
            if (typeof config.aurora.minCapacity !== 'number') {
                log('Invalid or missing Aurora minCapacity');
                return false;
            }
            if (typeof config.aurora.maxCapacity !== 'number') {
                log('Invalid or missing Aurora maxCapacity');
                return false;
            }
            if (typeof config.aurora.multiAz !== 'boolean') {
                log('Invalid or missing Aurora multiAz');
                return false;
            }

            // Check Aurora database properties
            if (!config.aurora.database) {
                log('Missing Aurora database configuration');
                return false;
            }
            if (!config.aurora.database.name || typeof config.aurora.database.name !== 'string') {
                log('Missing or invalid Aurora database name');
                return false;
            }
            if (typeof config.aurora.database.port !== 'number') {
                log('Invalid or missing Aurora database port');
                return false;
            }

            // Check additional Aurora database properties
            if (typeof config.aurora.database.backupRetentionDays !== 'number') {
                log('Invalid or missing Aurora backupRetentionDays');
                return false;
            }
            if (typeof config.aurora.database.backupWindow !== 'string') {
                log('Invalid or missing Aurora backupWindow');
                return false;
            }
            if (typeof config.aurora.database.maintenanceWindow !== 'string') {
                log('Invalid or missing Aurora maintenanceWindow');
                return false;
            }
            if (typeof config.aurora.database.deletionProtection !== 'boolean') {
                log('Invalid or missing Aurora deletionProtection');
                return false;
            }
            // Check tags - must be an object with string keys and string values
            if (!config.aurora.database.tags || 
                typeof config.aurora.database.tags !== 'object' ||
                Object.entries(config.aurora.database.tags).some(([key, value]) => 
                    typeof key !== 'string' || typeof value !== 'string'
                )) {
                log('Invalid or missing Aurora database tags - must be an object with string keys and values');
                return false;
            }

            // Check Aurora monitoring properties
            if (!config.aurora.database.monitoring) {
                log('Missing Aurora monitoring configuration');
                return false;
            }
            
            const monitoring = config.aurora.database.monitoring;
            
            if (typeof monitoring.enableEnhancedMonitoring !== 'boolean') {
                log('Invalid or missing Aurora enableEnhancedMonitoring');
                return false;
            }
            if (typeof monitoring.monitoringInterval !== 'number') {
                log('Invalid or missing Aurora monitoringInterval');
                return false;
            }
            if (!Array.isArray(monitoring.logsExports)) {
                log('Invalid or missing Aurora logsExports array');
                return false;
            }
            if (typeof monitoring.logsRetentionDays !== 'number') {
                log('Invalid or missing Aurora logsRetentionDays');
                return false;
            }
            
            // Check container images
            if (!config.container) {
                log('Missing container configuration');
                return false;
            }
            if (!config.container.libreChatImage || 
                typeof config.container.libreChatImage.repository !== 'string' ||
                typeof config.container.libreChatImage.tag !== 'string' ||
                !config.container.meiliSearchImage ||
                typeof config.container.meiliSearchImage.repository !== 'string' ||
                typeof config.container.meiliSearchImage.tag !== 'string' ||
                !config.container.ragAPIImage ||
                typeof config.container.ragAPIImage.repository !== 'string' ||
                typeof config.container.ragAPIImage.tag !== 'string') {
                log('Invalid container image configuration');
                return false;
            }
            
            // Check DocumentDB properties
            if (!config.documentDb) {
                log('Missing documentDb configuration');
                return false;
            }
            if (typeof config.documentDb.instanceType !== 'string' ||
                typeof config.documentDb.instances !== 'number') {
                log('Invalid documentDb configuration');
                return false;
            }
            
            return true;
        };

        if (!validateConfig(mergedConfig)) {
            console.error('Configuration validation failed. Merged config was:', JSON.stringify(mergedConfig, null, 2));
            console.error('Validation logs above should indicate which check failed');
            throw new Error('Invalid configuration: missing or invalid required properties');
        }

        return mergedConfig as Config;
    } catch (error) {
        console.error('Error loading configuration:', error);
        throw error;
    }
};

const app = new cdk.App();

// Load the configuration
const config = loadConfig();

// Create the secrets stack first
const secretsStack = new LibreSecretTokensStack(app, 'LibreSecretTokensStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: config.region
    }
});

// Create the stack
const stack = new LibreChatCdkStack(app, 'LibreChatCdkStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: config.region
    },
    config: config,
    secretTokens: secretsStack.secretTokens
});