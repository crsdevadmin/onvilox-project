const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: 'server/.env' });

async function listModels() {
    try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log('Fetching models...');
        // Note: Anthropic SDK might not have a direct 'list' method in all versions, 
        // but let's try it or just try a standard heartbeat message with a few known IDs.
        
        const models = ['claude-3-5-sonnet-20240620', 'claude-3-7-sonnet-20250219', 'claude-3-opus-20240229'];
        for (const m of models) {
            try {
                await anthropic.messages.create({
                    model: m,
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'hi' }]
                });
                console.log(`✅ ACCESS CONFIRMED: ${m}`);
            } catch (e) {
                console.log(`❌ NO ACCESS: ${m} (${e.message})`);
            }
        }
    } catch (err) {
        console.error('Diagnostic error:', err);
    }
}

listModels();
