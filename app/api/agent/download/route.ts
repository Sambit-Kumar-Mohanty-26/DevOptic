export async function GET() {
    const fs = require('fs').promises;
    const path = require('path');

    try {
        const filePath = path.join(process.cwd(), 'agent.js');
        const content = await fs.readFile(filePath, 'utf-8');

        return new Response(content, {
            headers: {
                'Content-Type': 'application/javascript',
                'Content-Disposition': 'attachment; filename="agent.js"'
            }
        });
    } catch (error) {
        return new Response('File not found', { status: 404 });
    }
}
