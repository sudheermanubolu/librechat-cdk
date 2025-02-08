import { configure } from './configure';

async function runConfiguration() {
    try {
        const config = await configure();
        console.log('\nConfiguration completed successfully!');
        console.log('Configuration details:', JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Configuration failed:', error);
        process.exit(1);
    }
}

// Run the configuration
runConfiguration();
