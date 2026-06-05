import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const dataDir = path.join(process.cwd(), 'data');
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const logFile = path.join(dataDir, 'inference_logs.txt');
    
    const logEntry = `
=========================================
TIMESTAMP: ${data.timestamp}
PROVIDER:  ${data.provider || 'local'}
MODEL:     ${data.model}
=========================================
MESSAGES:
${JSON.stringify(data.messages, null, 2)}
=========================================
`;
    
    fs.appendFileSync(logFile, logEntry, 'utf8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Log API Error:", error);
    return NextResponse.json({ error: 'Failed to write log' }, { status: 500 });
  }
}
