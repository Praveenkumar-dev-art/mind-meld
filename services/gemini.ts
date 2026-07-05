import { GoogleGenAI, Type } from "@google/genai";
import { TutorResponse, QuizData } from '../types';

const getClient = () => {
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('MINDMELD_USER_API_KEY') : null;
  const envKey = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY;
    
    
  const apiKey = localKey || envKey;
  if (!apiKey) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('open-api-key-modal'));
    }
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey });
};

// HELPER: Robust JSON parsing that handles markdown code blocks
const safeParseJSON = <T>(text: string): T => {
  try {
    // Remove ```json ... ``` or just ``` ... ``` wrappers
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error("JSON Parse Error on text:", text);
    throw e;
  }
};

// HELPER: Automatic Fallback for Rate Limits (429)
const generateWithFallback = async (
  ai: GoogleGenAI, 
  modelName: string, 
  params: any
) => {
  try {
    return await ai.models.generateContent({
      ...params,
      model: modelName
    });
  } catch (error: any) {
    // Check for Rate Limit / Resource Exhausted (429)
    const isRateLimit = error.status === 429 || 
                        (error.message && error.message.includes('429')) ||
                        (error.message && error.message.includes('RESOURCE_EXHAUSTED'));

    const isModelNotFound = error.status === 404 || 
                            (error.message && error.message.includes('not found'));

    const isInvalidKey = error.status === 400 || error.status === 403 || (error.message && error.message.toLowerCase().includes('key'));
    
    if (isInvalidKey) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('open-api-key-modal', { detail: { error: 'Invalid API Key. Please check your key and try again.' } }));
        }
        throw new Error("INVALID_API_KEY");
    }

    if ((isRateLimit || isModelNotFound) && modelName !== "gemini-2.5-flash") {
      console.warn(`Gemini Error (${error.status}) for ${modelName}. Falling back to gemini-2.5-flash.`);
      return await ai.models.generateContent({
        ...params,
        model: "gemini-2.5-flash"
      });
    }
    throw error;
  }
};

export const generateDiarySummary = async (
    text: string, 
    previousContext: string, 
    imageBase64?: string | null,
    mimeType?: string | null
): Promise<{ summary: string; insight: string | null }> => {
  const ai = getClient();
  const primaryModel = "gemini-2.5-flash"; 

  const prompt = [
    "You are 'The Silent Friend', a supportive and passive AI in Diary Mode.",
    "",
    "Task:",
    "1. Organize the user's messy thoughts (and image if provided) into a clean, structured Markdown format. Use headers, bullet points, and bold text for key terms.",
    "2. If an image is provided, describe it briefly and integrate its content into the summary.",
    "3. If the user mentions a topic related to the previous context provided below, generate a short 'Insight' note connecting them.",
    "4. If no connection is found, return null for the insight.",
    "",
    "Previous Context: \"" + previousContext + "\"",
    "",
    "Current User Input: \"" + text + "\""
  ].join("\n");

  const parts: any[] = [{ text: prompt }];
  
  if (imageBase64 && mimeType) {
      parts.push({
          inlineData: {
              mimeType: mimeType,
              data: imageBase64
          }
      });
  }

  try {
    const response = await generateWithFallback(ai, primaryModel, {
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                summary: { type: Type.STRING },
                insight: { type: Type.STRING, nullable: true }
            }
        }
      },
    });

    const result = safeParseJSON<{ summary: string; insight: string | null }>(response.text || "{}");
    return {
      summary: result.summary || "Unable to summarize at the moment.",
      insight: result.insight || null
    };
  } catch (error) {
    console.error("Gemini Diary Error:", error);
    return { summary: "We're having trouble processing your entry right now (High Traffic).", insight: null };
  }
};

export const generateTutorResponse = async (
  userMessage: string, 
  history: {role: string, text: string}[],
  contextMemory: string,
  contextImage?: string | null,
  contextImageMime?: string | null,
  activeTutorMemory?: string | null,
  isQuickMode: boolean = false,
  isWebSearchMode: boolean = false
): Promise<TutorResponse> => {
  const ai = getClient();
  const primaryModel = "gemini-2.5-flash";

  let systemInstructionLines: string[] = [];

  if (isQuickMode) {
    systemInstructionLines = [
      "You are 'The Socratic Teacher' in QUICK ANSWER MODE.",
      "Goal: Provide a fast, text-only response.",
      ...(isWebSearchMode ? ["IMPORTANT: Perform a web search to gather up-to-date facts before answering."] : []),
      "",
      "Instructions:",
      "1. Answer the user's question directly and concisely.",
      "2. Do NOT generate any SVG code or Mindmaps.",
      "3. Do NOT ask follow-up questions unless necessary for clarification.",
      "4. Keep the tone helpful but speedy."
    ];
  } else {
    systemInstructionLines = [
      "You are 'The Socratic Teacher' in Tutor Mode.",
      "Goal: Teach using Sweller's Cognitive Load Theory (Worked Examples -> Scaffolding -> Fading).",
      ...(isWebSearchMode ? ["IMPORTANT: Perform a web search to gather up-to-date facts before answering and incorporate the real-world data into your response."] : []),
      ""
    ];

    if (activeTutorMemory) {
      systemInstructionLines.push(
        "CRITICAL INSTRUCTION - FOCUSED MEMORY MODE:",
        "The user has explicitly loaded specific content into their 'Active Memory' for you to teach.",
        "ACTIVE MEMORY CONTENT: \"" + activeTutorMemory + "\"",
        "",
        "Your primary goal is to teach the concepts found in the Active Memory above.",
        "Use the visuals and explanation to reinforce THIS specific content.",
        "If the user asks questions, relate them back to this memory."
      );
    } else {
      systemInstructionLines.push(
        "Context Memory from Diary Mode: \"" + contextMemory + "\""
      );
      if (contextImage) {
        systemInstructionLines.push(
          "The user also has an image loaded in context (e.g. a textbook page). Use this to inform your explanations if relevant."
        );
      }
    }

    systemInstructionLines.push(
      "",
      "Rules for VISUALS:",
      "1. 'svg_code': Create a rich, illustrative SVG diagram (XML string) to visualize the concept.",
      "   - ViewBox: \"0 0 800 600\".",
      "   - BOUNDARY RULE: ALL elements MUST be strictly contained within the 0 to 800 (x) and 0 to 600 (y) coordinate space. Do NOT draw anything outside these coordinates (e.g. keep x between 20 and 780) to prevent clipping.",
      "   - Style: Use soft pastel colors, rounded corners, and clear labels. Make it look like a textbook diagram.",
      "   - Content: Draw the actual object/system (e.g., if explaining a heart, draw a heart shape; if a cycle, draw a cycle). NOT just boxes.",
      "   - STRICT ALIGNMENT RULES: All text elements MUST have 'text-anchor=\"middle\"' and 'dominant-baseline=\"middle\"' to be perfectly centered in their containers.",
      "   - IMPORTANT: Return ONLY the <svg>...</svg> code string. No markdown blocks.",
      "",
      "DO NOT GENERATE A MINDMAP CODE. The user will ask for it separately if needed.",
      "",
      "The Teaching Loop:",
      "- Step A: Provide a CLEAR, DEEP EXPLANATION of the concept (Worked Example).",
      "- Step B: Use the visual to reinforce the explanation.",
      "- IMPORTANT: Do NOT end with a question unless the user explicitly asks to be tested or says \"Ask me a question\".",
      "  Your priority is to ensure they understand the \"What\" and \"Why\" first.",
      "  Only transition to questioning if the user signals readiness.",
      "",
      "Output Rules:",
      "- Output strictly valid JSON.",
      "- \"speech_response\": What you SAY. Keep it encouraging but rigorous.",
      "- \"question\": Optional. Only provide a specific follow-up question if the user asked for a challenge. Otherwise, leave null or empty."
    );
  }

  const systemInstruction = systemInstructionLines.join("\n");

  // Construct contents
  const contents = history.map(h => ({
    role: h.role,
    parts: [{ text: h.text }]
  }));

  // Create the new message content
  const currentParts: any[] = [{ text: userMessage }];
  
  if (contextImage && contextImageMime) {
      currentParts.push({
          inlineData: {
              mimeType: contextImageMime,
              data: contextImage
          }
      });
  }

  contents.push({
    role: 'user',
    parts: currentParts
  });

  try {
    const options: any = {
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
         responseSchema: {
          type: Type.OBJECT,
          properties: {
            svg_code: { type: Type.STRING, nullable: true, description: "Raw SVG XML string. Null in Quick Mode." },
            speech_response: { type: Type.STRING, description: "The verbal explanation. Analyze and include web search facts if enabled." },
            question: { type: Type.STRING, nullable: true, description: "A specific follow-up question, ONLY if requested." },
            scaffolding_state: { type: Type.STRING, enum: ["example", "problem", "fading"] }
          },
          required: isQuickMode ? ["speech_response"] : ["svg_code", "speech_response", "scaffolding_state"]
        }
      },
    };

    if (isWebSearchMode) {
      options.config.tools = [{ googleSearch: {} }];
    }

    const response = await generateWithFallback(ai, primaryModel, options);

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return safeParseJSON<TutorResponse>(text);
  } catch (error) {
    console.error("Gemini Tutor Error:", error);
    return {
      svg_code: isQuickMode ? null : "<svg viewBox=\"0 0 800 600\" xmlns=\"http://www.w3.org/2000/svg\"><text x=\"400\" y=\"300\" dominant-baseline=\"middle\" text-anchor=\"middle\" fill=\"#f87171\" font-family=\"sans-serif\" font-size=\"24\">Busy server. Retrying...</text></svg>",
      speech_response: "My brain is a bit overcrowded right now (Rate Limit). Let's try that again in a moment.",
      question: "Could you rephrase that?",
      scaffolding_state: 'example'
    };
  }
};

// ── Web Search Mode ────────────────────────────────────────────────────────────
// IMPORTANT: Google Search grounding (tools: [{ googleSearch: {} }]) is
// INCOMPATIBLE with responseMimeType: "application/json" + responseSchema.
// When both are present, the Gemini API silently drops the search tool and
// answers from training data instead — no error is thrown.
//
// This function solves that with a two-call approach:
//   Call 1 → text/plain + googleSearch tool  → real-time web answer
//   Call 2 → regenerateSVG()                 → SVG diagram of that answer
// ─────────────────────────────────────────────────────────────────────────────

export const generateWebSearchResponse = async (
  userMessage: string,
  history: { role: string; text: string }[],
  contextMemory: string,
  activeTutorMemory?: string | null,
  isQuickMode: boolean = false
): Promise<TutorResponse> => {
  const ai = getClient();
  const primaryModel = "gemini-2.5-flash";

  const memoryBlock = activeTutorMemory
    ? `Active Memory: "${activeTutorMemory}"`
    : `Context from Diary: "${contextMemory}"`;

  const systemPrompt = [
    "You are 'The Socratic Teacher' with LIVE WEB ACCESS.",
    "CRITICAL: You have Google Search enabled. Use it to find current, real-world information before answering.",
    "Always ground your answer in the search results you find.",
    "",
    memoryBlock,
    "",
    "Instructions:",
    "1. Search the web for the most current and accurate information on the user's question.",
    "2. Provide a clear, well-structured explanation using what you found.",
    "3. Mention key facts, statistics, or recent developments from the web where relevant.",
    isQuickMode
      ? "4. Keep the response concise — this is Quick Mode."
      : "4. Teach deeply. Explain the 'what' and 'why'.",
    "5. Do NOT generate SVG code. Only provide the text explanation."
  ].join("\n");

  const contents = [
    ...history.map(h => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: userMessage }] }
  ];

  try {
    // ── Call 1: Web-grounded text response ─────────────────────────────────
    // responseMimeType is intentionally omitted (defaults to text/plain).
    // Adding responseSchema here would silently disable the googleSearch tool.
    const searchResponse = await ai.models.generateContent({
      model: primaryModel,
      contents,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
      }
    });

    const speechText = searchResponse.text?.trim()
      || "I found some information but had trouble formatting it. Please try again.";

    // In Quick Mode, skip SVG generation entirely (same behaviour as normal Quick Mode)
    if (isQuickMode) {
      return {
        svg_code: null,
        speech_response: speechText,
        question: null,
        scaffolding_state: "example"
      };
    }

    // ── Call 2: Generate SVG from the web-researched answer ────────────────
    // regenerateSVG() uses text/plain — no conflict.
    // SVG failure is non-fatal: return the answer without a visual.
    let svgCode: string | null = null;
    try {
      svgCode = await regenerateSVG(speechText);
    } catch {
      svgCode = null;
    }

    return {
      svg_code: svgCode,
      speech_response: speechText,
      question: null,
      scaffolding_state: "example"
    };

  } catch (error: any) {
    const isInvalidKey = error.status === 400 || error.status === 403;
    if (isInvalidKey && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-api-key-modal", {
        detail: { error: "Invalid API Key. Please check your key and try again." }
      }));
    }
    console.error("Web Search Response Error:", error);
    return {
      svg_code: null,
      speech_response: "I had trouble searching the web right now. Please try again in a moment.",
      question: null,
      scaffolding_state: "example"
    };
  }
};

export const regenerateSVG = async (explanationText: string, userSuggestion?: string): Promise<string> => {
    const ai = getClient();
    const primaryModel = "gemini-2.5-pro"; 

    const promptLines = [
        "You are a Master Scientific Illustrator and Pedagogical Designer.",
        "The user is dissatisfied with the previous visual for the explanation below.",
        "",
        "YOUR TASK:",
        "1. Analyze the Explanation Text deeply. Identify the core processes, relationships, or objects being described.",
        "2. Reason about why a standard diagram might fail (e.g., too abstract, missing labels, poor layout).",
        "3. Create a NEW, SUPERIOR SVG diagram that specifically addresses the explanation.",
        "",
        "Explanation Text to Visualize:",
        "\"" + explanationText + "\""
    ];

    if (userSuggestion) {
        promptLines.push(
            "",
            "CRITICAL USER CUSTOMIZATION REQUEST:",
            "The user explicitly wants the diagram to follow this style, constraint, or modification: \"" + userSuggestion + "\"",
            "You MUST adjust the visual complexity, metaphors, layout, or style to match this request exactly."
        );
    }

    promptLines.push(
        "",
        "SVG Rules:",
        "- Return ONLY the raw XML string starting with <svg> and ending with </svg>.",
        "- ViewBox=\"0 0 800 600\".",
        "- BOUNDARY RULE: ALL elements MUST be strictly contained within the 0 to 800 (x) and 0 to 600 (y) coordinate space. Keep x between 20 and 780 to prevent clipping.",
        "- Use professional styling: soft shadows, rounded strokes, clear sans-serif typography (Inter/Arial).",
        "- Ensure text is legible: use 'dominant-baseline=\"middle\"' and 'text-anchor=\"middle\"' for center alignment.",
        "- Do NOT simply draw boxes and arrows unless it's a flowchart. Draw the *actual* concept (e.g., a neuron, a gear system, a chemical bond) if possible using SVG shapes."
    );

    try {
        const response = await generateWithFallback(ai, primaryModel, {
            contents: promptLines.join("\n"),
            config: {
                responseMimeType: "text/plain"
            }
        });

        let text = response.text || "";
        const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/);
        if (svgMatch) {
            text = svgMatch[0];
        }
        return text;
    } catch (e) {
        console.error("Regenerate SVG Error", e);
        return "<svg viewBox=\"0 0 800 600\" xmlns=\"http://www.w3.org/2000/svg\"><text x=\"400\" y=\"300\" text-anchor=\"middle\" font-family=\"sans-serif\" fill=\"#ef4444\">Could not regenerate diagram (Rate Limit).</text></svg>";
    }
};

export const generateAnimatedSVG = async (explanationText: string): Promise<string> => {
    const ai = getClient();
    const primaryModel = "gemini-2.5-pro"; 

    const prompt = [
        "You are an Expert Motion Graphics Designer for Educational Content.",
        "",
        "TASK:",
        "Convert the concept explained below into a DYNAMIC, ANIMATED SVG.",
        "The goal is to help a student understand the 'Process' or 'Motion' involved (e.g., gravity, flow of electrons, chemical reaction, data transfer).",
        "",
        "Explanation Text:",
        "\"" + explanationText + "\"",
        "",
        "ANIMATION RULES (STRICT):",
        "1. PREFERRED METHOD: Use CSS @keyframes inside a <style> tag for continuous, smooth looping.",
        "2. Make sure animations have 'animation-iteration-count: infinite'.",
        "3. If showing flow (e.g., blood, current), use 'stroke-dasharray' and animate 'stroke-dashoffset'.",
        "4. DO NOT use external scripts or images.",
        "5. Ensure the <svg> tag includes xmlns=\"http://www.w3.org/2000/svg\".",
        "",
        "SVG Requirements:",
        "- Return ONLY the raw XML string starting with <svg> and ending with </svg>.",
        "- ViewBox=\"0 0 800 600\".",
        "- BOUNDARY RULE: ALL elements MUST be strictly contained within the 0 to 800 (x) and 0 to 600 (y) coordinate space. Keep x between 20 and 780 to prevent clipping."
    ].join("\n");

    try {
        const response = await generateWithFallback(ai, primaryModel, {
            contents: prompt,
            config: {
                responseMimeType: "text/plain"
            }
        });

        let text = response.text || "";
        const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/);
        if (svgMatch) {
            text = svgMatch[0];
        }
        return text;
    } catch (e) {
        console.error("Generate Animated SVG Error", e);
        // Return an animated fallback so user knows the engine works even if API failed
        return `
        <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
          <style>
            @keyframes pulse { 0% { opacity: 0.5; r: 20; } 50% { opacity: 1; r: 30; } 100% { opacity: 0.5; r: 20; } }
          </style>
          <rect width="800" height="600" fill="#fef2f2" />
          <circle cx="400" cy="300" r="20" fill="#ef4444" style="animation: pulse 1.5s infinite ease-in-out;" />
          <text x="400" y="360" text-anchor="middle" font-family="sans-serif" fill="#ef4444" font-size="16">High Traffic - Animation Skipped</text>
        </svg>`;
    }
};

export const generateMindmapOnly = async (
    contextText: string,
    history: {role: string, text: string}[]
): Promise<string> => {
    const ai = getClient();
    const primaryModel = "gemini-2.5-flash"; 

    const recentDiscussion = history.slice(-2).map(m => m.text).join(" ");
    
    const prompt = [
      "Based on the following context, create a Mermaid.js 'mindmap' diagram code.",
      "",
      "Topic/Context: \"" + contextText + "\"",
      "RecentDiscussion: \"" + recentDiscussion + "\"",
      "",
      "Rules:",
      "1. Return ONLY the raw Mermaid code string starting with 'mindmap'.",
      "2. Do not use markdown backticks.",
      "3. CRITICAL SYNTAX RULES:",
      "   - Do NOT use parentheses ( ) or colons : inside node text labels.",
      "     Incorrect: root((Main: Topic))",
      "     Correct: root((Main Topic))",
      "   - Keep labels short (max 4 words).",
      "   - Use 2-space indentation.",
      "4. Syntax Example:",
      "   mindmap",
      "     root((Main Topic))",
      "       Branch A",
      "         Leaf 1",
      "         Leaf 2",
      "       Branch B",
      "         Leaf 3"
    ].join("\n");

    try {
        const response = await generateWithFallback(ai, primaryModel, {
            contents: prompt,
            config: {
                responseMimeType: "text/plain"
            }
        });
        
        const text = response.text || "";
        return text.replace(/```mermaid/g, '').replace(/```/g, '').trim();
    } catch (e) {
        console.error("Mindmap gen error", e);
        return "mindmap\n root((High Traffic))\n   Could not generate map";
    }
};

export const generateQuiz = async (
  contextMemory: string,
  history: {role: string, text: string}[]
): Promise<QuizData> => {
  const ai = getClient();
  const primaryModel = "gemini-2.5-pro";

  const recentHistory = history.slice(-3).map(m => m.text).join(" ");
  const combinedContext = "Main Topic: " + contextMemory + ". Recent Discussion: " + recentHistory;

  const prompt = [
    "Create a short, dynamic quiz to test the user's understanding of the current topic.",
    "",
    "Context: \"" + combinedContext + "\"",
    "",
    "Requirements:",
    "1. Generate strictly valid JSON.",
    "2. Create exactly 3 multiple-choice questions.",
    "3. \"topic\": A 2-4 word title for the quiz.",
    "4. \"options\": Array of 4 strings.",
    "5. \"correctAnswerIndex\": 0-3.",
    "6. \"explanation\": A one-sentence explanation of why the answer is correct."
  ].join("\n");

  try {
    const response = await generateWithFallback(ai, primaryModel, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswerIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswerIndex", "explanation"]
              }
            }
          },
          required: ["topic", "questions"]
        }
      }
    });

    return safeParseJSON<QuizData>(response.text || "{}");
  } catch (error) {
    console.error("Quiz Generation Error:", error);
    return {
      topic: "Server Busy",
      questions: [
        {
          question: "The server is currently experiencing high traffic.",
          options: ["Retry later", "Check connection", "Refresh", "Wait"],
          correctAnswerIndex: 0,
          explanation: "Quotas refresh over time."
        }
      ]
    };
  }
};