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

export type SeriesContext = {
  premise?: string;
  penName?: string;
};

function buildSeriesContextString(seriesContext?: SeriesContext) {
  if (!seriesContext) return '';
  let str = '';
  if (seriesContext.penName) {
    str += `\n\nThe author's pen name is ${seriesContext.penName}. Match their typical style and expectations.`;
  }
  if (seriesContext.premise) {
    str += `\n\n--- SERIES CONTEXT ---\nThis book belongs to a larger series. Here is the series premise/bible:\n${seriesContext.premise}\n------------------------\n`;
  }
  return str;
}

const PLANNING_SYSTEM_PROMPT = `You are an expert fiction planning agent and structural editor. Your job is to help plan, structure, and package commercial fiction. You specialize in genres with strong reader expectations, specifically dark romance, psychological thrillers, and small town contemporary romance/western romance.`;

const TITLE_SYSTEM_PROMPT = `You are an expert fiction planning agent and structural editor. Your job is to help plan, structure, and package commercial fiction. You specialize in genres with strong reader expectations, specifically dark romance, psychological thrillers, and small town contemporary romance/western romance. When you create the book title, you must match the conventions of the requested genre. A small town romance title needs a cozy, community focused feel. A dark romance or thriller requires an intense or ominous tone. Keep titles memorable and under five words.`;

export async function generateSynopsis(apiUrl: string, model: string, systemPrompt: string, title: string, premise: string, provider?: string, seriesContext?: SeriesContext) {
  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    { role: 'user', content: `Write a detailed 2-3 paragraph synopsis for a novel titled "${title}".\n\nPremise: ${premise}${buildSeriesContextString(seriesContext)}\n\nDo not include any pleasantries, just the synopsis text.` }
  ];
  return generateChatCompletion(apiUrl, model, messages, 0.8, 1500, provider);
}

export async function generateTitle(apiUrl: string, model: string, systemPrompt: string, synopsis: string, provider?: string, seriesContext?: SeriesContext) {
  const messages: Message[] = [
    { role: 'system', content: TITLE_SYSTEM_PROMPT },
    { role: 'user', content: `Based on the following synopsis, suggest a single, compelling title for the novel. Return ONLY the title text, nothing else. No quotes.${buildSeriesContextString(seriesContext)}\n\nSynopsis:\n${synopsis}` }
  ];
  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, 50, provider);
  return response.replace(/["']/g, '').trim();
}

export async function generateCharacters(apiUrl: string, model: string, systemPrompt: string, synopsis: string, provider?: string, seriesContext?: SeriesContext) {
  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    {
      role: 'user', content: `Based on the following synopsis, create a list of EXACTLY 8 to 10 main and supporting characters.

Since the synopsis only mentions a few characters by name, you MUST invent additional characters (such as Wyatt's unnamed brothers, ranch hands, Mariposa townspeople, or local rivals) to build out the story world and bring the total character count to between 8 and 10.${buildSeriesContextString(seriesContext)}

Synopsis:
${synopsis}

For each character, you must provide the following details:
- name: The character's full name. (If a nickname is included, enclose it in single quotes, e.g. Tucker 'Bull' McAllister. NEVER use unescaped double quotes inside the JSON string).
- role: Narrative role (e.g., Protagonist, Antagonist, Love Interest, Supporting).
- description: A general 1-2 sentence summary of who they are.
- identity: Core occupation, background, or social role.
- physicalDescription: Age, height, hair, build, and overall style.
- distinctFeatures: Distinct physical markers, scars, mannerisms, or voice traits.
- coreValues: Guiding principles and what they stand for.
- flaws: Main psychological or behavioral flaws.
- fears: Deepest core fears or phobias.
- want: The Want (External Goal - what they consciously strive for).
- need: The Need (Internal Growth - what they must learn or accept to grow emotionally).
- lie: The Lie (The false belief they hold about themselves or the world that holds them back).

Format your response EXACTLY as a JSON array of 8 to 10 objects with the exact keys: "name", "role", "description", "identity", "physicalDescription", "distinctFeatures", "coreValues", "flaws", "fears", "want", "need", "lie". Do not include Markdown blocks like \`\`\`json, just return the raw array.

IMPORTANT: Make sure all JSON strings are valid. If you need to write quotation marks inside any string value, use single quotes (e.g. 'Bull') instead of unescaped double quotes.` }
  ];
  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, 4000, provider);
  try {
    return parseJSONWithRepair(response);
  } catch (e) {
    console.error("Characters JSON parse error:", response);
    throw new Error(`Failed to parse characters JSON. Raw model response:\n${response.substring(0, 500)}...`);
  }
}

export async function generateOutline(
  apiUrl: string,
  model: string,
  systemPrompt: string,
  synopsis: string,
  characters: any[],
  targetChapterCount: number,
  outlineTemplate: string,
  provider?: string,
  povType?: string,
  dualPov?: boolean,
  seriesContext?: SeriesContext
) {
  let templateInstruction = '';
  if (outlineTemplate && outlineTemplate.trim() !== '') {
    templateInstruction = `\n\nCRITICAL STRUCTURAL TEMPLATE to follow:\n${outlineTemplate}\n\n`;
  }

  let povInstruction = '';
  if (povType) {
    povInstruction += `The novel should be written in: ${povType}.\n`;
  }
  if (dualPov) {
    povInstruction += `The novel MUST use a DUAL POV (Point of View) structure. The chapter POVs MUST alternate between the Protagonist (narrative role: Protagonist) and the Love Interest (narrative role: Love Interest). Ensure that each chapter's "pov" field specifies the exact name of the character whose perspective the chapter is from (either the protagonist or the love interest), alternating in a balanced manner. Do not use any other character POVs.\n`;
  } else {
    povInstruction += `Specify the character name whose perspective the chapter is from in the "pov" field.\n`;
  }

  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    { role: 'user', content: `Given the synopsis and characters, outline the chapters for the novel. You MUST generate exactly ${targetChapterCount} chapters.

${povInstruction}${buildSeriesContextString(seriesContext)}

Synopsis:
${synopsis}

Characters:
${JSON.stringify(characters)}${templateInstruction}

Format your response EXACTLY as a JSON array of objects with keys: "chapterNumber" (number), "title" (string), "summary" (string), "pov" (string - the name of the character whose perspective the chapter is from). Just the raw array, no markdown blocks.` }
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

export async function continueOutline(
  apiUrl: string,
  model: string,
  systemPrompt: string,
  synopsis: string,
  characters: any[],
  currentOutline: any[],
  outlineTemplate: string,
  provider?: string,
  povType?: string,
  dualPov?: boolean,
  seriesContext?: SeriesContext
) {
  const lastChapter = currentOutline.length > 0 ? currentOutline[currentOutline.length - 1].chapterNumber : 0;

  let templateInstruction = '';
  if (outlineTemplate && outlineTemplate.trim() !== '') {
    templateInstruction = `\n\nCRITICAL STRUCTURAL TEMPLATE to follow:\n${outlineTemplate}\n\n`;
  }

  let povInstruction = '';
  if (povType) {
    povInstruction += `The novel should be written in: ${povType}.\n`;
  }
  if (dualPov) {
    povInstruction += `The novel MUST use a DUAL POV (Point of View) structure. The chapter POVs MUST alternate between the Protagonist (narrative role: Protagonist) and the Love Interest (narrative role: Love Interest). Ensure that each chapter's "pov" field specifies the exact name of the character whose perspective the chapter is from (either the protagonist or the love interest), alternating in a balanced manner. Do not use any other character POVs.\n`;
  } else {
    povInstruction += `Specify the character name whose perspective the chapter is from in the "pov" field.\n`;
  }

  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    { role: 'user', content: `Given the synopsis and characters, continue outlining the chapters for the novel starting from Chapter ${lastChapter + 1}. Aim for 5-10 MORE chapters.

${povInstruction}${buildSeriesContextString(seriesContext)}

Synopsis:
${synopsis}

Characters:
${JSON.stringify(characters)}${templateInstruction}

Existing Outline (Chapters 1 to ${lastChapter}):
${JSON.stringify(currentOutline)}

Format your response EXACTLY as a JSON array of objects with keys: "chapterNumber" (number), "title" (string), "summary" (string), "pov" (string - the name of the character whose perspective the chapter is from). Just the raw array, no markdown blocks.` }
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
  povType?: string,
  characters?: any[],
  previousChapterData?: { title?: string; summary?: string; content?: string },
  seriesContext?: SeriesContext
) {
  const chapterDef = outline.find(c => c.chapterNumber === chapterNumber);
  if (!chapterDef) throw new Error("Chapter not found in outline");

  let userPrompt = '';
  
  const seriesString = buildSeriesContextString(seriesContext);
  if (seriesString) {
    userPrompt += `${seriesString}\n\n`;
  }

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

  if (characters && characters.length > 0) {
    userPrompt += `\n--- CHARACTER PROFILES ---\n${JSON.stringify(characters, null, 2)}\n\n`;
  }

  if (previousChapterData) {
    userPrompt += `--- PREVIOUS CHAPTER CONTEXT (For reference to avoid repetition) ---\n`;
    if (previousChapterData.title) userPrompt += `Chapter ${chapterNumber - 1}: ${previousChapterData.title}\n`;
    if (previousChapterData.summary) userPrompt += `Summary: ${previousChapterData.summary}\n`;
    if (previousChapterData.content) {
      userPrompt += `Content:\n${previousChapterData.content}\n`;
    }
    userPrompt += `\n`;
  }

  const nextChapterDef = outline.find(c => c.chapterNumber === chapterNumber + 1);
  if (nextChapterDef) {
    userPrompt += `--- NEXT CHAPTER PREVIEW (DO NOT WRITE THESE EVENTS) ---\n`;
    userPrompt += `Chapter ${chapterNumber + 1}: "${nextChapterDef.title}"\n`;
    userPrompt += `Summary: ${nextChapterDef.summary}\n`;
    userPrompt += `CRITICAL BOUNDARY: Do NOT progress the story into the events of the next chapter. Stop the narrative immediately before these events begin.\n\n`;
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
