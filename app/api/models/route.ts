import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider') || 'local';

    if (provider === 'local') {
      return NextResponse.json({
        data: [{ id: 'local-model', label: 'Local Model' }]
      });
    }

    if (provider === 'openrouter') {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) throw new Error("Failed to fetch OpenRouter models");
      const json = await res.json();
      const models = json.data.map((m: any) => ({
        id: m.id,
        label: m.name || m.id
      }));
      return NextResponse.json({ data: models });
    }

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing in your .env file.");

      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        }
      });
      if (!res.ok) throw new Error("Failed to fetch Anthropic models");
      const json = await res.json();
      const models = json.data.map((m: any) => ({
        id: m.id,
        label: m.display_name || m.name || m.id
      }));
      return NextResponse.json({ data: models });
    }

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is missing in your .env file.");

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error("Failed to fetch Gemini models");
      const json = await res.json();
      const models = json.models.map((m: any) => ({
        // The API returns name as "models/gemini-pro", so we strip "models/" if we want to use the id directly
        id: m.name.replace('models/', ''),
        label: m.displayName || m.name.replace('models/', '')
      }));
      return NextResponse.json({ data: models });
    }

    return NextResponse.json({ data: [] });
  } catch (error: any) {
    console.error("Models API Error:", error);
    return NextResponse.json({ error: error.message || error.toString() }, { status: 500 });
  }
}
