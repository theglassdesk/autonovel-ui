import JSON5 from 'json5';

export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function generateChatCompletion(
  apiUrl: string,
  model: string,
  messages: Message[],
  temperature = 0.7,
  max_tokens?: number,
  provider?: string
) {
  try {
    // Fire off async log to local disk
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        model,
        provider,
        messages
      })
    }).catch(e => console.error("Logging error", e));

    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(max_tokens && { max_tokens }),
        ...(provider && { provider })
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    return data.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error("Local Inference Error:", error);
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error(`Failed to connect to ${apiUrl}. Check that your local AI server (e.g., LM Studio, Ollama) is running, and that CORS is enabled. Note: Some browsers block mixed content; try using http://127.0.0.1 instead of localhost.`);
    }
    throw error;
  }
}

// Helpers for specific tasks

function parseJSONWithRepair(text: string) {
  let jsonStr = text;
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    jsonStr = match[0];
  } else {
    jsonStr = text.replace(/```(?:json)?/gi, '').trim();
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    try {
      return JSON5.parse(jsonStr);
    } catch (err2) {
      // Repair truncated array (model cut off before finishing)
      const firstBracket = jsonStr.indexOf('[');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace !== -1) {
        let chopped = jsonStr.substring(firstBracket !== -1 ? firstBracket : 0, lastBrace + 1) + ']';
        if (!chopped.startsWith('[')) chopped = '[' + chopped;
        try {
          return JSON5.parse(chopped);
        } catch (err3) {
          // ignore
        }
      }
      
      // Last resort: maybe it output an object instead of array?
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
         return JSON5.parse(objMatch[0]);
      }
      throw err2;
    }
  }
}

const PLANNING_SYSTEM_PROMPT = `You are an expert fiction planning agent and structural editor. Your job is to help plan, structure, and package commercial fiction. You specialize in genres with strong reader expectations, specifically dark romance, psychological thrillers, and small town contemporary romance/western romance.`;

const TITLE_SYSTEM_PROMPT = `You are an expert fiction planning agent and structural editor. Your job is to help plan, structure, and package commercial fiction. You specialize in genres with strong reader expectations, specifically dark romance, psychological thrillers, and small town contemporary romance/western romance. When you create the book title, you must match the conventions of the requested genre. A small town romance title needs a cozy, community focused feel. A dark romance or thriller requires an intense or ominous tone. Keep titles memorable and under five words.`;

export async function generateSynopsis(apiUrl: string, model: string, systemPrompt: string, title: string, premise: string, provider?: string) {
  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    { role: 'user', content: `Write a detailed 2-3 paragraph synopsis for a novel titled "${title}".\n\nPremise: ${premise}\n\nDo not include any pleasantries, just the synopsis text.` }
  ];
  return generateChatCompletion(apiUrl, model, messages, 0.8, 1500, provider);
}

export async function generateTitle(apiUrl: string, model: string, systemPrompt: string, synopsis: string, provider?: string) {
  const messages: Message[] = [
    { role: 'system', content: TITLE_SYSTEM_PROMPT },
    { role: 'user', content: `Based on the following synopsis, suggest a single, compelling title for the novel. Return ONLY the title text, nothing else. No quotes.\n\nSynopsis:\n${synopsis}` }
  ];
  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, 50, provider);
  return response.replace(/["']/g, '').trim();
}

export async function generateCharacters(apiUrl: string, model: string, systemPrompt: string, synopsis: string, provider?: string) {
  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    { role: 'user', content: `Based on the following synopsis, create a list of 3-5 main characters.\n\nSynopsis:\n${synopsis}\n\nFormat your response EXACTLY as a JSON array of objects with keys: "name", "role", and "description". Do not include Markdown blocks like \`\`\`json, just return the raw array.` }
  ];
  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, 1000, provider);
  try {
    return parseJSONWithRepair(response);
  } catch (e) {
    console.error("Characters JSON parse error:", response);
    throw new Error(`Failed to parse characters JSON. Raw model response:\n${response.substring(0, 500)}...`);
  }
}

export async function generateOutline(apiUrl: string, model: string, systemPrompt: string, synopsis: string, characters: any[], targetChapterCount: number, outlineTemplate: string, provider?: string) {
  let templateInstruction = '';
  if (outlineTemplate && outlineTemplate.trim() !== '') {
    templateInstruction = `\n\nCRITICAL STRUCTURAL TEMPLATE to follow:\n${outlineTemplate}\n\n`;
  }

  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    { role: 'user', content: `Given the synopsis and characters, outline the chapters for the novel. You MUST generate exactly ${targetChapterCount} chapters.\n\nSynopsis:\n${synopsis}\n\nCharacters:\n${JSON.stringify(characters)}${templateInstruction}\n\nFormat your response EXACTLY as a JSON array of objects with keys: "chapterNumber" (number), "title" (string), "summary" (string), "pov" (string - the name of the character whose perspective the chapter is from). Just the raw array, no markdown blocks.` }
  ];
  // passing -1 or high token limit if possible, or just omitting to let local model use max
  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, undefined, provider);
  try {
    return parseJSONWithRepair(response);
  } catch (e) {
    console.error("Outline JSON parse error:", response);
    throw new Error(`Failed to parse outline JSON. Raw model response:\n${response.substring(0, 500)}...`);
  }
}

export async function continueOutline(apiUrl: string, model: string, systemPrompt: string, synopsis: string, characters: any[], currentOutline: any[], outlineTemplate: string, provider?: string) {
  const lastChapter = currentOutline.length > 0 ? currentOutline[currentOutline.length - 1].chapterNumber : 0;
  
  let templateInstruction = '';
  if (outlineTemplate && outlineTemplate.trim() !== '') {
    templateInstruction = `\n\nCRITICAL STRUCTURAL TEMPLATE to follow:\n${outlineTemplate}\n\n`;
  }

  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    { role: 'user', content: `Given the synopsis and characters, continue outlining the chapters for the novel starting from Chapter ${lastChapter + 1}. Aim for 5-10 MORE chapters.\n\nSynopsis:\n${synopsis}\n\nCharacters:\n${JSON.stringify(characters)}${templateInstruction}\n\nExisting Outline (Chapters 1 to ${lastChapter}):\n${JSON.stringify(currentOutline)}\n\nFormat your response EXACTLY as a JSON array of objects with keys: "chapterNumber" (number), "title" (string), "summary" (string), "pov" (string - the name of the character whose perspective the chapter is from). Just the raw array, no markdown blocks.` }
  ];
  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, undefined, provider);
  try {
    return parseJSONWithRepair(response);
  } catch (e) {
    console.error("Continue Outline JSON parse error:", response);
    throw new Error(`Failed to parse continuing outline JSON. Raw model response:\n${response.substring(0, 500)}...`);
  }
}

export async function generateChapter(
  apiUrl: string, 
  model: string, 
  systemPrompt: string, 
  synopsis: string, 
  outline: any[], 
  chapterNumber: number, 
  provider?: string, 
  guardrails?: { craft: string; antiSlop: string; antiPatterns: string },
  existingContent?: string,
  povType?: string
) {
  const chapterDef = outline.find(c => c.chapterNumber === chapterNumber);
  if (!chapterDef) throw new Error("Chapter not found in outline");
  
  let userPrompt = '';

  let povInstruction = '';
  if (povType && chapterDef.pov) {
    povInstruction = `\nYou MUST write this chapter in ${povType} from the perspective of ${chapterDef.pov}. We only know what ${chapterDef.pov} knows, sees, and feels.\n\n`;
  } else if (povType) {
    povInstruction = `\nYou MUST write this chapter in ${povType}.\n\n`;
  } else if (chapterDef.pov) {
    povInstruction = `\nYou MUST write this chapter from the perspective of ${chapterDef.pov}. We only know what ${chapterDef.pov} knows, sees, and feels.\n\n`;
  }

  if (povInstruction) {
    userPrompt += `--- NARRATIVE PERSPECTIVE ---${povInstruction}`;
  }

  if (guardrails) {
    userPrompt += `--- CRITICAL WRITING GUARDRAILS ---\nYou MUST strictly adhere to the following rules while writing this chapter:\n\nCRAFT GUIDELINES:\n${guardrails.craft}\n\nBANNED WORDS (DO NOT USE THESE WORDS/PHRASES):\n${guardrails.antiSlop}\n\nANTI-PATTERNS (AVOID THESE STRUCTURES):\n${guardrails.antiPatterns}\n\n---------------------------------------\n\n`;
  }

  if (existingContent && existingContent.trim() !== '') {
    userPrompt += `Please rewrite the following chapter based on the rules above and the summary below.\n\nWrite Chapter ${chapterNumber}: "${chapterDef.title}".\n\nChapter Summary: ${chapterDef.summary}\n\nOverall Novel Synopsis: ${synopsis}\n\nEnsure the chapter is well-written, engaging, and flows naturally. Do not include any out-of-character AI pleasantries. Begin the text immediately.\n\n--- EXISTING CHAPTER DRAFT TO REWRITE ---\n${existingContent}`;
  } else {
    userPrompt += `Write Chapter ${chapterNumber}: "${chapterDef.title}".\n\nChapter Summary: ${chapterDef.summary}\n\nOverall Novel Synopsis: ${synopsis}\n\nEnsure the chapter is well-written, engaging, and flows naturally. Do not include any out-of-character AI pleasantries. Begin the text immediately.`;
  }

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  
  return generateChatCompletion(apiUrl, model, messages, 0.85, undefined, provider);
}
