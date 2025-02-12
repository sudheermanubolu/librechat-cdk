import * as fs from 'fs';
import * as path from 'path';

export function loadConfig() {
    const configPath = path.join(__dirname, '../config/config.json');
    
    if (!fs.existsSync(configPath)) {
        throw new Error('Configuration file not found. Please ensure config.json exists in the config directory.');
    }

    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configContent);
    } catch (error) {
        console.error('Error loading configuration:', error);
        throw error;
    }
}