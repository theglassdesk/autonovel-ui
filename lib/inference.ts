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
    const content = data.choices[0]?.message?.content || '';

    // Log request & response together
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        model,
        provider,
        messages,
        response: content
      })
    }).catch(e => console.error("Logging error", e));

    return content;
  } catch (error: any) {
    console.error("Local Inference Error:", error);
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error(`Failed to connect to ${apiUrl}. Check that your local AI server (e.g., LM Studio, Ollama) is running, and that CORS is enabled. Note: Some browsers block mixed content; try using http://127.0.0.1 instead of localhost.`);
    }
    throw error;
  }
}

// Helpers for specific tasks

function unescapeRawString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function cleanEndQuotesAndBraces(str: string): string {
  let s = str.trim();
  if (s.endsWith('}')) {
    s = s.substring(0, s.length - 1).trim();
  }
  if (s.endsWith('"') || s.endsWith("'")) {
    s = s.substring(0, s.length - 1);
  }
  return s;
}

function recoverManuscriptAnalysis(jsonStr: string) {
  const reportStartPattern = /"report"\s*:\s*"/;
  const matchStart = jsonStr.match(reportStartPattern);
  if (!matchStart) {
    throw new Error("Could not find 'report' field");
  }
  const startIdx = matchStart.index! + matchStart[0].length;

  const suggestedEditsIdx = jsonStr.indexOf('suggestedEdits');
  if (suggestedEditsIdx === -1) {
    let rawReport = jsonStr.substring(startIdx);
    rawReport = cleanEndQuotesAndBraces(rawReport);
    return { report: unescapeRawString(rawReport), suggestedEdits: [] };
  }

  const contextBefore = jsonStr.substring(Math.max(0, suggestedEditsIdx - 10), suggestedEditsIdx);
  const isEscaped = contextBefore.includes('\\"');

  let report = "";
  let suggestedEdits: any[] = [];

  if (isEscaped) {
    const backslashIdx = jsonStr.lastIndexOf('\\', suggestedEditsIdx);
    const splitIdx = backslashIdx !== -1 ? backslashIdx : suggestedEditsIdx - 1;
    
    const rawReport = jsonStr.substring(startIdx, splitIdx);
    report = unescapeRawString(rawReport);

    const arrayStartIdx = jsonStr.indexOf('[', suggestedEditsIdx);
    if (arrayStartIdx !== -1) {
      let rawSuggested = jsonStr.substring(arrayStartIdx);
      rawSuggested = cleanEndQuotesAndBraces(rawSuggested);
      const unescapedSuggested = unescapeRawString(rawSuggested);
      try {
        suggestedEdits = JSON5.parse(unescapedSuggested);
      } catch (e: any) {
        console.error("Failed to parse unescaped suggestedEdits:", e.message);
      }
    }
  } else {
    const reportEndPattern = /["']?\s*,\s*["']?suggestedEdits["']?\s*:/;
    const matchEnd = jsonStr.match(reportEndPattern);
    if (matchEnd) {
      const endIdx = matchEnd.index!;
      const rawReport = jsonStr.substring(startIdx, endIdx);
      report = unescapeRawString(rawReport);

      const suggestedEditsStartIdx = matchEnd.index! + matchEnd[0].length;
      let arrayStr = jsonStr.substring(suggestedEditsStartIdx).trim();
      if (arrayStr.endsWith('}')) {
        arrayStr = arrayStr.substring(0, arrayStr.length - 1).trim();
      }
      try {
        suggestedEdits = JSON5.parse(arrayStr);
      } catch (e: any) {
        if (!arrayStr.startsWith('[')) arrayStr = '[' + arrayStr;
        if (!arrayStr.endsWith(']')) arrayStr = arrayStr + ']';
        try {
          suggestedEdits = JSON5.parse(arrayStr);
        } catch (e2: any) {
          console.error("Failed to parse suggestedEdits:", e2.message);
        }
      }
    } else {
      let rawReport = jsonStr.substring(startIdx);
      rawReport = cleanEndQuotesAndBraces(rawReport);
      report = unescapeRawString(rawReport);
    }
  }

  return { report, suggestedEdits };
}

function parseJSONWithRepair(text: string) {
  let jsonStr = text;
  
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
      jsonStr = text.substring(firstBrace, lastBrace + 1);
    }
  } else if (firstBracket !== -1) {
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket !== -1) {
      jsonStr = text.substring(firstBracket, lastBracket + 1);
    }
  } else {
    jsonStr = text.replace(/```(?:json)?/gi, '').trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    try {
      return JSON5.parse(jsonStr);
    } catch (err2) {
      // Try to recover manually
      try {
        return recoverManuscriptAnalysis(jsonStr);
      } catch (recoveryErr) {
        console.error("Manuscript analysis custom recovery failed:", recoveryErr);
      }

      // Repair truncated array (model cut off before finishing)
      const firstBracketIdx = jsonStr.indexOf('[');
      const lastBraceIdx = jsonStr.lastIndexOf('}');
      if (lastBraceIdx !== -1) {
        let chopped = jsonStr.substring(firstBracketIdx !== -1 ? firstBracketIdx : 0, lastBraceIdx + 1) + ']';
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
  previousBooksSummary?: string;
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
  if (seriesContext.previousBooksSummary) {
    str += `\n\n--- PREVIOUS BOOKS SUMMARY ---\nHere is a summary of what happened in previous books in this series:\n${seriesContext.previousBooksSummary}\n------------------------\n`;
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

export async function generateCharacters(apiUrl: string, model: string, systemPrompt: string, synopsis: string, provider?: string, seriesContext?: SeriesContext, isFromBible?: boolean) {
  const sourceType = isFromBible ? 'series bible (premise, lore, and world details)' : 'synopsis';
  const sourceLabel = isFromBible ? 'Series Bible' : 'Synopsis';
  const messages: Message[] = [
    { role: 'system', content: PLANNING_SYSTEM_PROMPT },
    {
      role: 'user', content: `Based on the following ${sourceType}, create a list of EXACTLY 8 to 10 main and supporting characters.

Since the source text might only mention a few characters by name, you MUST invent additional characters (such as rivals, associates, townspeople, or family members) to build out the story world and bring the total character count to between 8 and 10.${buildSeriesContextString(seriesContext)}

${sourceLabel}:
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
  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, undefined, provider);
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

export async function generateChapterBeats(
  apiUrl: string,
  model: string,
  systemPrompt: string,
  synopsis: string,
  outline: any[],
  chapterNumber: number,
  provider?: string,
  guardrails?: { craft: string; antiSlop: string; antiPatterns: string },
  povType?: string,
  characters?: any[],
  previousChapterData?: { title?: string; summary?: string; content?: string },
  seriesContext?: SeriesContext,
  storySoFar?: string,
  sampleProse?: string,
  reservedLocations?: string
) {
  const chapterDef = outline.find(c => c.chapterNumber === chapterNumber);
  if (!chapterDef) throw new Error("Chapter not found in outline");

  let userPrompt = '';
  
  const seriesString = buildSeriesContextString(seriesContext);
  if (seriesString) {
    userPrompt += `${seriesString}\n\n`;
  }

  if (storySoFar && storySoFar.trim() !== '') {
    userPrompt += `--- THE STORY SO FAR (ESTABLISHED FACTS) ---\n${storySoFar}\nCRITICAL INSTRUCTION: Do NOT re-introduce these facts, characters, or physical traits as if they are new. The reader already knows these facts.\n\n`;
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

  // Forward Boundary (lookahead up to 3 chapters)
  const nextChapters = [];
  for (let i = 1; i <= 3; i++) {
    const nextCh = outline.find(c => c.chapterNumber === chapterNumber + i);
    if (nextCh) {
      nextChapters.push(nextCh);
    }
  }

  if (nextChapters.length > 0 || (reservedLocations && reservedLocations.trim() !== '')) {
    userPrompt += `--- FORWARD BOUNDARY (DO NOT WRITE ANY OF THIS) ---\n`;
    userPrompt += `The following chapters have NOT happened yet. Do not write, foreshadow-as-action, or partially stage any of these events. If your draft is trending toward any of them, stop the chapter short instead.\n\n`;
    
    nextChapters.forEach(ch => {
      userPrompt += `Chapter ${ch.chapterNumber}: "${ch.title}" — ${ch.summary}\n`;
    });
    
    if (reservedLocations && reservedLocations.trim() !== '') {
      userPrompt += `\nSPECIFIC LOCATIONS/OBJECTS RESERVED FOR LATER (do not have characters reach or interact with these yet): ${reservedLocations}\n`;
    }
    userPrompt += `\n`;
  }

  if (guardrails) {
    userPrompt += `--- CRITICAL WRITING GUARDRAILS ---\nYou MUST strictly adhere to the following rules while writing this chapter:\n\nCRAFT GUIDELINES:\n${guardrails.craft}\n\nBANNED WORDS (DO NOT USE THESE WORDS/PHRASES):\n${guardrails.antiSlop}\n\nANTI-PATTERNS (AVOID THESE STRUCTURES):\n${guardrails.antiPatterns}\n\n---------------------------------------\n\n`;
  }

  if (sampleProse && sampleProse.trim() !== '') {
    userPrompt += `--- STYLE REFERENCE (SAMPLE PROSE) ---\nYou MUST write this chapter to strictly match the voice, tone, style, pacing, vocabulary, and sentence structures of the following sample prose:\n\n${sampleProse}\n\n---------------------------------------\n\n`;
  }

  // Content Discipline
  userPrompt += `--- CONTENT DISCIPLINE ---\n` +
    `Only include plot events explicitly named in this chapter's outline summary, or direct, small-scale consequences of them. ` +
    `Do not introduce new plot devices, discoveries, injuries, or escalations that aren't implied by the summary or established worldbuilding rules. ` +
    `If you're unsure whether something is invention or a reasonable extrapolation, default to leaving it out.\n\n`;

  // Instructions for beats only
  userPrompt += `Write a sequential list of the specific beats (bullet points) you plan to cover in Chapter ${chapterNumber}: "${chapterDef.title}".\n\n` +
    `Chapter Summary: ${chapterDef.summary}\n\n` +
    `Overall Novel Synopsis: ${synopsis}\n\n` +
    `Your beats list must strictly focus on events inside this chapter summary. Do NOT include any events from the Forward Boundary or the reserved locations.\n\n` +
    `You MUST end your output with this exact confirmation statement:\n` +
    `CONFIRM: none of these beats appear in the Forward Boundary list above. [yes/no]\n\n` +
    `Return ONLY the bulleted list of beats and the confirmation statement. Do not write any prose, pleasantries, or wrapping markdown blocks. Begin immediately.`;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  return generateChatCompletion(apiUrl, model, messages, 0.6, undefined, provider);
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
  seriesContext?: SeriesContext,
  storySoFar?: string,
  sampleProse?: string,
  reservedLocations?: string,
  approvedBeats?: string
) {
  const chapterDef = outline.find(c => c.chapterNumber === chapterNumber);
  if (!chapterDef) throw new Error("Chapter not found in outline");

  let userPrompt = '';
  
  const seriesString = buildSeriesContextString(seriesContext);
  if (seriesString) {
    userPrompt += `${seriesString}\n\n`;
  }

  if (storySoFar && storySoFar.trim() !== '') {
    userPrompt += `--- THE STORY SO FAR (ESTABLISHED FACTS) ---\n${storySoFar}\nCRITICAL INSTRUCTION: Do NOT re-introduce these facts, characters, or physical traits as if they are new. The reader already knows these facts.\n\n`;
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

  // Forward Boundary (lookahead up to 3 chapters)
  const nextChapters = [];
  for (let i = 1; i <= 3; i++) {
    const nextCh = outline.find(c => c.chapterNumber === chapterNumber + i);
    if (nextCh) {
      nextChapters.push(nextCh);
    }
  }

  if (nextChapters.length > 0 || (reservedLocations && reservedLocations.trim() !== '')) {
    userPrompt += `--- FORWARD BOUNDARY (DO NOT WRITE ANY OF THIS) ---\n`;
    userPrompt += `The following chapters have NOT happened yet. Do not write, foreshadow-as-action, or partially stage any of these events. If your draft is trending toward any of them, stop the chapter short instead.\n\n`;
    
    nextChapters.forEach(ch => {
      userPrompt += `Chapter ${ch.chapterNumber}: "${ch.title}" — ${ch.summary}\n`;
    });
    
    if (reservedLocations && reservedLocations.trim() !== '') {
      userPrompt += `\nSPECIFIC LOCATIONS/OBJECTS RESERVED FOR LATER (do not have characters reach or interact with these yet): ${reservedLocations}\n`;
    }
    userPrompt += `\n`;
  }

  if (guardrails) {
    userPrompt += `--- CRITICAL WRITING GUARDRAILS ---\nYou MUST strictly adhere to the following rules while writing this chapter:\n\nCRAFT GUIDELINES:\n${guardrails.craft}\n\nBANNED WORDS (DO NOT USE THESE WORDS/PHRASES):\n${guardrails.antiSlop}\n\nANTI-PATTERNS (AVOID THESE STRUCTURES):\n${guardrails.antiPatterns}\n\n---------------------------------------\n\n`;
  }

  if (sampleProse && sampleProse.trim() !== '') {
    userPrompt += `--- STYLE REFERENCE (SAMPLE PROSE) ---\nYou MUST write this chapter to strictly match the voice, tone, style, pacing, vocabulary, and sentence structures of the following sample prose:\n\n${sampleProse}\n\n---------------------------------------\n\n`;
  }

  // Length Policy
  userPrompt += `--- LENGTH POLICY ---\n` +
    `Target length: 2500–3500 words. If you reach the end of this chapter's outlined events before hitting the target, DO NOT invent new plot beats or advance toward future chapters to fill space. Expand instead through:\n\n` +
    `interiority (the POV character's unresolved thoughts, physical sensations,\n` +
    `memories triggered by the scene)\n\n` +
    `sensory grounding (the specific texture of this location, this weather, this hour)\n` +
    `secondary-character presence and reaction\n` +
    `dialogue subtext and things characters almost say but don't\n\n` +
    `Running short is an acceptable outcome. Advancing the plot to compensate is not.\n\n`;

  // Content Discipline
  userPrompt += `--- CONTENT DISCIPLINE ---\n` +
    `Only include plot events explicitly named in this chapter's outline summary, or direct, small-scale consequences of them. ` +
    `Do not introduce new plot devices, discoveries, injuries, or escalations that aren't implied by the summary or established worldbuilding rules. ` +
    `If you're unsure whether something is invention or a reasonable extrapolation, default to leaving it out.\n\n`;

  if (approvedBeats && approvedBeats.trim() !== '') {
    userPrompt += `--- APPROVED BEATS TO COVER ---\nYou MUST write the chapter prose by strictly following this sequential plan (approved by the editor):\n\n${approvedBeats}\n\nCRITICAL DIRECTION: Do NOT invent new plot beats, discoveries, injuries, or escalations. Only expand on the beats listed above.\n\n`;
  }

  const hasBeats = approvedBeats && approvedBeats.trim() !== '';

  const beatCheckInstruction = hasBeats ? '' : `\n\nBefore beginning the chapter prose, you MUST output a pre-draft beat check in this exact format:\n\n` +
    `BEATS I INTEND TO COVER (in order):\n` +
    `- [Brief description of beat 1]\n` +
    `- [Brief description of beat 2]\n` +
    `- ...\n` +
    `CONFIRM: none of these beats appear in the Forward Boundary list above. [yes/no]\n\n` +
    `Begin outputting the beat check immediately, then start the chapter content directly below it. Do not include any out-of-character AI pleasantries.`;

  if (existingContent && existingContent.trim() !== '') {
    userPrompt += `Please rewrite the following chapter based on the rules, length policy, and content discipline above and the summary below.${beatCheckInstruction}\n\nWrite Chapter ${chapterNumber}: "${chapterDef.title}".\n\nChapter Summary: ${chapterDef.summary}\n\nOverall Novel Synopsis: ${synopsis}\n\n--- EXISTING CHAPTER DRAFT TO REWRITE ---\n${existingContent}`;
  } else {
    userPrompt += `Write Chapter ${chapterNumber}: "${chapterDef.title}".\n\nChapter Summary: ${chapterDef.summary}\n\nOverall Novel Synopsis: ${synopsis}.${beatCheckInstruction}`;
    if (hasBeats) {
      userPrompt += `\n\nEnsure the chapter is well-written, engaging, and flows naturally. Do not include any out-of-character AI pleasantries. Begin the text immediately.`;
    }
  }

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  return generateChatCompletion(apiUrl, model, messages, 0.85, undefined, provider);
}

export async function generateInlineEdit(
  apiUrl: string,
  model: string,
  systemPrompt: string,
  selectedText: string,
  instruction: string,
  fullChapterText: string,
  previousChapters: { chapterNumber: number; title: string; summary: string; content?: string }[],
  synopsis: string,
  characters: any[],
  provider?: string,
  seriesContext?: SeriesContext,
  storySoFar?: string
) {
  let userPrompt = '';
  const seriesString = buildSeriesContextString(seriesContext);
  if (seriesString) {
    userPrompt += `${seriesString}\n\n`;
  }

  if (storySoFar && storySoFar.trim() !== '') {
    userPrompt += `--- THE STORY SO FAR (ESTABLISHED FACTS) ---\n${storySoFar}\nCRITICAL INSTRUCTION: Do NOT re-introduce these facts, characters, or physical traits as if they are new. The reader already knows these facts.\n\n`;
  }

  userPrompt += `--- OVERALL NOVEL SYNOPSIS ---\n${synopsis}\n\n`;

  if (characters && characters.length > 0) {
    userPrompt += `--- CHARACTER PROFILES ---\n${JSON.stringify(characters, null, 2)}\n\n`;
  }

  if (previousChapters && previousChapters.length > 0) {
    userPrompt += `--- PREVIOUS CHAPTERS CONTEXT ---\n`;
    const includeFullText = previousChapters.length <= 5;
    if (includeFullText) {
      userPrompt += `Note: Including full text for all ${previousChapters.length} previous chapters.\n\n`;
    } else {
      userPrompt += `Note: Including summaries for ${previousChapters.length} previous chapters to preserve context space.\n\n`;
    }

    for (const ch of previousChapters) {
      userPrompt += `Chapter ${ch.chapterNumber}: ${ch.title}\nSummary: ${ch.summary}\n`;
      if (includeFullText && ch.content) {
        userPrompt += `Content:\n${ch.content}\n`;
      }
      userPrompt += `\n`;
    }
  }

  userPrompt += `--- CURRENT CHAPTER FULL TEXT ---\n${fullChapterText}\n\n`;
  
  userPrompt += `--- INLINE EDIT REQUEST ---\n`;
  userPrompt += `The user has highlighted the following exact text from the current chapter to be edited/rewritten:\n\n<selection>\n${selectedText}\n</selection>\n\n`;
  userPrompt += `Here is the user's instruction for this edit:\n<instruction>\n${instruction}\n</instruction>\n\n`;
  userPrompt += `As an expert editor, please rewrite the highlighted text according to the instruction, ensuring it flows naturally back into the surrounding chapter text. Return ONLY the revised text that should replace the <selection>. Do not include any pleasantries, markdown blocks, or surrounding context—just the raw replacement string.`;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  return generateChatCompletion(apiUrl, model, messages, 0.7, undefined, provider);
}

export async function generateStorySoFarUpdate(
  apiUrl: string,
  model: string,
  systemPrompt: string,
  currentStorySoFar: string,
  newChapterContent: string,
  provider?: string
) {
  const userPrompt = `I have just written a new chapter for my novel. I need you to update the "Story So Far" tracking document.

--- CURRENT STORY SO FAR ---
${currentStorySoFar || "(Empty. This is the first chapter.)"}

--- NEW CHAPTER ---
${newChapterContent}

--- INSTRUCTIONS ---
Extract any major new established facts, character reveals, physical descriptions (e.g., cars they drive, outfits they usually wear), or key plot points from the NEW CHAPTER. 
Combine them with the CURRENT STORY SO FAR into a concise, bulleted list. 
Do NOT summarize the entire plot beat-by-beat. Focus ONLY on permanent "facts" the reader has learned so that future chapters don't re-explain them.
Return ONLY the updated bulleted list. Do not include any pleasantries or markdown blocks.`;

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  return generateChatCompletion(apiUrl, model, messages, 0.5, undefined, provider);
}

export async function analyzeManuscript(
  apiUrl: string,
  model: string,
  systemPrompt: string,
  project: any,
  chapters: any[],
  toolType: string,
  provider?: string,
  seriesContext?: SeriesContext,
  genre?: string,
  antiSlop?: string
) {
  let userPrompt = '';
  
  // Include Series Bible & Story So Far only for Inconsistencies or Full analysis
  if (toolType === 'inconsistencies' || toolType === 'full') {
    const seriesString = buildSeriesContextString(seriesContext);
    if (seriesString) userPrompt += `${seriesString}\n\n`;
    if (project.storySoFar) userPrompt += `--- THE STORY SO FAR (ESTABLISHED FACTS) ---\n${project.storySoFar}\n\n`;
  }

  // Include Anti-Slop (Banned Words) for cliches and AI-isms
  if ((toolType === 'cliches' || toolType === 'aiIsms') && antiSlop) {
    userPrompt += `--- BANNED WORDS & PHRASES (ANTI-SLOP) ---\n${antiSlop}\n\n`;
  }

  // Include Style Reference (Sample Prose) for proseMatch or Full analysis
  if ((toolType === 'proseMatch' || toolType === 'full') && project.sampleProse && project.sampleProse.trim() !== '') {
    userPrompt += `--- STYLE REFERENCE (SAMPLE PROSE) ---\n${project.sampleProse}\n\n`;
  }

  userPrompt += `--- MANUSCRIPT ---\n`;
  for (const ch of chapters) {
    userPrompt += `[CHAPTER ${ch.chapterNumber}]\n${ch.content}\n\n`;
  }
  
  userPrompt += `--- ANALYSIS REQUEST ---\n`;
  
  let toolInstruction = '';
  switch(toolType) {
      case 'readability':
          toolInstruction = 'Analyze the reading level, flow, sentence variety, and word choice. Suggest specific ways to improve readability.';
          break;
      case 'pacing':
          toolInstruction = 'Analyze the narrative pacing. Identify scenes that drag or feel rushed. Suggest edits to improve the speed and rhythm of the story.';
          break;
      case 'dialogue':
          toolInstruction = 'Analyze the balance between dialogue and narrative/action. Identify overly long monologues or "white room" syndrome (dialogue without grounding action).';
          break;
      case 'cliches':
          toolInstruction = 'Identify any overused tropes, cliches, or repetitive AI-like phrasing (comparing against the Anti-Slop list if provided). Suggest fresh, original alternatives.';
          break;
      case 'aiIsms':
          toolInstruction = 'Identify and correct repetitive, formulaic AI writing patterns ("AI-isms"). Specifically highlight and rewrite:\n' +
                            '1. The "not X, not Y, but Z" structural trope (e.g. "not with fear, not with anger, but with resolve").\n' +
                            '2. Double sensory/scent descriptors (e.g. "he smelled of leather and ozone", "scents of pine and old rain").\n' +
                            '3. Excessive or unnecessary em-dashes (—) used as lazy clause separators.\n' +
                            '4. General AI tropes, sentence structures, and banned words from the anti-slop list.\n' +
                            'Suggest natural, human-like rewrites that vary sentence structure.';
          break;
      case 'repetitiveness':
          toolInstruction = 'Identify any repeated reveals, character descriptions, or redundant facts across the chapters.';
          break;
      case 'inconsistencies':
          toolInstruction = 'Check for internal inconsistencies in character logic, physical descriptions, timelines, or plot holes against the Story So Far and Series Context.';
          break;
      case 'grammar':
          toolInstruction = 'Check for spelling, grammar, punctuation errors, and awkward phrasing.';
          break;
      case 'betaReader':
          toolInstruction = `Act as a beta reader matching the target audience for a ${genre || 'fiction'} novel. Provide overall reader feedback and critique. Highlight specific scenes, paragraphs, or character actions where the reader is likely to lose interest, get bored, feel disconnected, or stop reading entirely. Explain why these issues occur and how they affect reader engagement.`;
          break;
      case 'proseMatch':
          toolInstruction = 'Compare the manuscript chapters against the Style Reference (Sample Prose). Analyze how well the manuscript matches the tone, style, sentence length/variation, vocabulary, pacing, and overall voice of the sample prose. Identify areas that deviate from the sample prose style, and suggest specific edits (rewrites) to bring the manuscript in alignment with the style reference.';
          break;
      case 'full':
          toolInstruction = 'Provide a comprehensive developmental and line-editing analysis covering all aspects: pacing, readability, dialogue, cliches, inconsistencies, and grammar.' +
                            (project.sampleProse ? ' Also analyze style alignment against the Style Reference (Sample Prose) and identify where the writing deviates from it.' : '');
          break;
  }

  userPrompt += `Perform the following analysis on the manuscript: ${toolInstruction}\n\n`;
  userPrompt += `You must return your response as a valid JSON object matching this exact schema:
{
  "report": "A detailed markdown-formatted analysis report. Use headings and bullet points.",
  "suggestedEdits": [
    {
      "chapterNumber": 1,
      "originalText": "The exact original text from the manuscript that needs changing (must match character for character).",
      "newText": "The improved replacement text.",
      "explanation": "Why this edit improves the manuscript."
    }
  ]
}
Return ONLY the raw JSON object. Do not wrap it in markdown code blocks.`;

  const editorSystemPrompt = `You are an expert developmental book editor and copyeditor analyzing a manuscript for a ${genre || 'fiction'} novel.`;

  const messages: Message[] = [
    { role: 'system', content: editorSystemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const response = await generateChatCompletion(apiUrl, model, messages, 0.7, undefined, provider);
  
  try {
    return parseJSONWithRepair(response);
  } catch (e) {
    console.error("Analyze Manuscript JSON parse error:", response);
    throw new Error(`Failed to parse analysis JSON. Raw response:\n${response.substring(0, 200)}...`);
  }
}
