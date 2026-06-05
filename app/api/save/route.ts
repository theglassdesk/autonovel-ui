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

    const filePath = path.join(dataDir, 'autonovel_state.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, message: 'State saved to disk successfully.' });
  } catch (error: any) {
    console.error('Failed to save state to disk:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
