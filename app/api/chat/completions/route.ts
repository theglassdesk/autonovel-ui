import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { model, messages, temperature = 0.7, max_tokens, provider } = await req.json();

    if (provider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      // Extract system message
      let system = "";
      const filteredMessages = [];
      for (const msg of messages) {
        if (msg.role === 'system') {
          system += msg.content + "\n";
        } else {
          filteredMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
        }
      }

      const response = await anthropic.messages.create({
        model: model || "claude-3-5-sonnet-20241022",
        system: system || undefined,
        messages: filteredMessages as any,
        temperature: temperature,
        max_tokens: max_tokens || 8000, // Anthropic requires max_tokens
      });

      return NextResponse.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: response.content[0].type === 'text' ? response.content[0].text : ''
            }
          }
        ]
      });
    }

    if (provider === 'openrouter') {
      const openai = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
      });

      const response = await openai.chat.completions.create({
        model: model || "openai/gpt-4o",
        messages: messages,
        temperature: temperature,
        max_tokens: max_tokens || undefined,
      });

      return NextResponse.json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: response.choices[0].message.content
            }
          }
        ]
      });
    }

    // Default to Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Convert OpenAI messages format to Gemini format
    let systemInstruction = "";
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += msg.content + "\n";
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    const response = await ai.models.generateContent({
      model: (model === 'local-model' || !model) ? 'gemini-2.5-flash' : model,
      contents: contents,
      config: {
        systemInstruction: systemInstruction || undefined,
        temperature: temperature,
        maxOutputTokens: max_tokens || undefined,
      }
    });

    return NextResponse.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: response.text
          }
        }
      ]
    });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || error.toString() }, { status: 500 });
  }
}
