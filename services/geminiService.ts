import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng, GroundingSource, LensAnalysis, SpatialAnalytics, FlavorGenealogy, MenuItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * SUPERVISOR ORCHESTRATOR
 * Acts as the brain of the app, deciding which specialized sub-agents to trigger.
 */
export const supervisorOrchestrator = async (message: string, location: LatLng, shopCount: number) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `MISSION: Act as the GeoMind SUPERVISOR ORCHESTRATOR. 
    Analyze the user's intent and decide which sub-agents are required to fulfill the request.
    
    USER QUERY: "${message}"
    CURRENT GRID STATE: ${shopCount} shops identified in the local sector.
    LOCATION: (${location.lat}, ${location.lng})
    
    SUB-AGENTS AVAILABLE:
    - DISCOVERY: Scans Google Maps/Search for 25 legends. Trigger if user wants to find places or if grid is empty.
    - ANALYTICS: Generates spatial intelligence cards, cuisine trends, and demographics. Trigger if user asks about area summary, trends, or stats.
    - HISTORY: Deep temporal flavor genealogy (1M token reasoning). Trigger if user asks about migration, historical context, or "old" flavors.
    
    INSTRUCTIONS:
    - If the query is complex, trigger multiple agents.
    - Always provide a synthesize 'response' text that addresses the user immediately.
    
    RETURN RAW JSON matching the responseSchema.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          response: { type: Type.STRING, description: "Direct answer to user." },
          actions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Agents to trigger: DISCOVERY, ANALYTICS, HISTORY"
          },
          thoughtProcess: { type: Type.STRING, description: "Causal reasoning for orchestration plan." }
        },
        required: ["response", "actions", "thoughtProcess"]
      }
    }
  });

  return JSON.parse(response.text || "{\"response\": \"\", \"actions\": [], \"thoughtProcess\": \"\"}");
};

/**
 * SUPERVISOR SELF-HEAL
 * Triggered when a sub-agent returns insufficient or failed data. 
 * Decides whether to retry with different parameters or pivot the strategy.
 */
export const supervisorSelfHeal = async (originalQuery: string, failureReport: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `MISSION: SELF-HEALING SPATIAL REASONING.
    The previous orchestration plan failed to yield sufficient results.
    
    ORIGINAL GOAL: "${originalQuery}"
    FAILURE STATUS: "${failureReport}"
    CURRENT COORDINATES: (${location.lat}, ${location.lng})
    
    RE-PLANNING TASKS:
    1. Diagnose why results were zero or low quality.
    2. Propose a corrective action (e.g., broadening search keywords, shifting discovery radius, or pivoting to historical data if live data is sparse).
    3. Update the user on the roadblock and the new strategy.
    
    RETURN RAW JSON matching the responseSchema.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          newResponse: { type: Type.STRING, description: "Update to the user about the self-healing attempt." },
          retryActions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Corrected agents to trigger: DISCOVERY, ANALYTICS, HISTORY"
          },
          diagnosis: { type: Type.STRING, description: "Reason why the first attempt failed." }
        },
        required: ["newResponse", "retryActions", "diagnosis"]
      }
    }
  });

  return JSON.parse(response.text || "{\"newResponse\": \"\", \"retryActions\": [], \"diagnosis\": \"\"}");
};

export const discoveryAgent = async (query: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `SPATIAL DISCOVERY MISSION: Find EXACTLY 25 legendary street food spots, iconic eateries (like Jannal Kadai or Kalathi Rose Milk), and hidden gems within a 5km radius of (${location.lat}, ${location.lng}). 
    
    INSTRUCTIONS:
    1. Scan Google Maps and search web results for the most authentic local food nodes.
    2. Ensure the list is exactly 25 unique items.
    3. For each item, provide: Name, precise lat/lng, a representative emoji, cuisine type, a 1-sentence vivid description, and a short address.
    
    OUTPUT FORMAT: You MUST return a single JSON object. 
    {
      "shops": [
        { "id": "sync-1", "name": "...", "coords": {"lat": 0.0, "lng": 0.0}, "emoji": "...", "cuisine": "...", "description": "...", "address": "..." },
        ... (repeat for all 25)
      ],
      "logs": [
        "Step 1: Calibrating spatial grid...",
        "Step 2: Scouring local food clusters...",
        "Step 3: Extracting high-sentiment nodes..."
      ]
    }
    
    CRITICAL: Return ONLY the raw JSON. No markdown blocks. No extra text. No preamble about searching.`,
    config: {
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: location.lat,
            longitude: location.lng
          }
        }
      }
    }
  });

  const text = (response.text || "").trim();
  let data: { shops?: any[], logs?: string[] } = { shops: [], logs: [] };
  
  if (!text) {
    return { shops: [], logs: ["Discovery signal timeout. No response from sector."], sources: [] };
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let candidate = jsonMatch[0];
      try {
        data = JSON.parse(candidate);
      } catch (innerE) {
        const cleaned = candidate.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
        data = JSON.parse(cleaned);
      }
    } else {
      const fixedText = text.replace(/```json|```/g, "").trim();
      if (fixedText) {
        data = JSON.parse(fixedText);
      }
    }
  } catch (e) {
    console.error("Failed to parse discovery JSON:", e);
    data.logs = ["Discovery signal received but parsing encountered an anomaly."];
  }

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Spatial Node",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));

  const sanitizedShops = (data.shops || []).map((s: any, idx: number) => ({
    ...s,
    id: s.id?.toString().startsWith('sync-') ? s.id : `sync-${idx}-${Date.now()}`,
    isVendor: false
  }));

  return { shops: sanitizedShops as Shop[], logs: (data.logs || []) as string[], sources };
};

export const generateSpatialAnalytics = async (shops: Shop[]): Promise<SpatialAnalytics> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this dataset of local food nodes: ${JSON.stringify(shops)}. 
    Generate a high-level spatial intelligence dashboard dataset. 
    1. cuisineDistribution: Count and percentage for each cuisine category.
    2. priceSpectrum: Group nodes into "Street (Cheap)", "Mid-Range", and "Premium" based on their descriptions/cuisine.
    3. legendaryIndex: Pick the top 5 most "legendary" nodes and give them a score (1-100) with a brief causal reasoning.
    4. customerSegmentation: Identify the top 4 demographic segments for this specific food grid.
    5. sectorSummary: A 2-sentence synthesis of the food culture in this grid sector.
    
    RETURN ONLY RAW JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cuisineDistribution: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                count: { type: Type.NUMBER },
                percentage: { type: Type.NUMBER }
              },
              required: ["label", "count", "percentage"]
            }
          },
          priceSpectrum: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                range: { type: Type.STRING },
                nodes: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["range", "nodes"]
            }
          },
          legendaryIndex: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                score: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
              },
              required: ["name", "score", "reasoning"]
            }
          },
          customerSegmentation: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                segment: { type: Type.STRING },
                description: { type: Type.STRING },
                volume: { type: Type.NUMBER }
              },
              required: ["segment", "description", "volume"]
            }
          },
          sectorSummary: { type: Type.STRING }
        },
        required: ["cuisineDistribution", "priceSpectrum", "legendaryIndex", "customerSegmentation", "sectorSummary"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const getPredictiveFootfall = async (shop: Shop, location: LatLng) => {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Reason over predictive footfall and wait times for "${shop.name}" (${shop.cuisine}) at coordinates (${shop.coords.lat}, ${shop.coords.lng}).
    
    CURRENT CONTEXT:
    - Time: ${time}
    - Day: ${day}
    - Location Sector: Near (${location.lat}, ${location.lng})
    
    INSTRUCTIONS:
    1. Search for real-time weather and traffic data in this area using available tools.
    2. Analyze the 'Cause and Effect' of these factors on this specific shop. (e.g., if it's raining, hot bajjis/tea will have higher demand).
    3. Predict the crowding level and wait time.
    
    OUTPUT FORMAT: You MUST return a single JSON object.
    {
      "crowdingLevel": "Low" | "Medium" | "High" | "Extreme",
      "waitTime": number (in minutes),
      "reasoning": "A 1-sentence explanation including temporal and environmental context."
    }
    
    Example Reasoning: "It's Friday at 7 PM and it's raining in Mylapore; expect the Bajjis at Jannal Kadai to have a 20-minute wait due to high demand for hot snacks in this weather."
    
    CRITICAL: Return ONLY the raw JSON. No markdown blocks. No extra text.`,
    config: {
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: location.lat,
            longitude: location.lng
          }
        }
      }
    }
  });

  const text = (response.text || "").trim();
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse predictive footfall JSON:", e);
    return { 
      crowdingLevel: "Unknown", 
      waitTime: 0, 
      reasoning: "Spatial reasoning signal interrupted. Using baseline estimates." 
    };
  }
};

export const getFlavorGenealogy = async (location: LatLng): Promise<FlavorGenealogy> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `MISSION: CROSS-TEMPORAL FLAVOR REASONING for location (${location.lat}, ${location.lng}).
    
    SIMULATE DEEP REASONING OVER 1M+ TOKENS OF HISTORICAL ARCHIVES:
    - Pre-colonial staples (fermented batter, steamed foods).
    - 18th-century spice trade records and colonial manifests.
    - 20th-century post-war culinary migration and displacement recipes.
    - Modern 21st-century tech-sector globalized fusion data.
    
    ANALYZE:
    1. How dominant flavors (Spicy, Tangy, Sweet, Pungent) evolved over centuries in this exact neighborhood.
    2. Local favorites and the "Soul" of the area's food history.
    3. CRITICAL: For Chennai-based coordinates, prioritize foundational staples like IDLY (fermented steamed food) and coastal seafood/fish culture (e.g. Marina Beach influence).
    4. Distinct eras with specific flavor profiles and context.
    5. For each era, identify EXACTLY 3 iconic popular food items that define that period in this location.
    
    RETURN RAW JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          neighborhood: { type: Type.STRING },
          summary: { type: Type.STRING },
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                period: { type: Type.STRING },
                profile: { type: Type.STRING },
                description: { type: Type.STRING },
                notableIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                popularItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                historicalContext: { type: Type.STRING }
              },
              required: ["period", "profile", "description", "notableIngredients", "popularItems", "historicalContext"]
            }
          }
        },
        required: ["neighborhood", "summary", "timeline"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const parseOrderAgent = async (userInput: string, menu: MenuItem[]) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `EXTRACT ORDER ITEMS FROM USER INPUT AND IDENTIFY MISSING ITEMS.
    
    USER INPUT: "${userInput}"
    SHOP MENU: ${JSON.stringify(menu)}
    
    INSTRUCTIONS:
    1. Identify items mentioned in the input that ARE in the menu.
    2. Identify items mentioned in the input that are NOT in the menu (unmatched).
    3. For each unmatched item, find the 'closest' similar item available in the menu provided.
    4. Handle Tamil (onnu, rendu, etc.) and English.
    5. Return exactly the matched items and any missing item reports.
    
    RETURN RAW JSON matching the responseSchema.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          orderItems: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                price: { type: Type.NUMBER }
              },
              required: ["name", "quantity", "price"]
            }
          },
          unmatchedItems: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                inputName: { type: Type.STRING },
                suggestion: { type: Type.STRING, nullable: true }
              },
              required: ["inputName"]
            }
          },
          totalPrice: { type: Type.NUMBER }
        },
        required: ["orderItems", "unmatchedItems", "totalPrice"]
      }
    }
  });
  return JSON.parse(response.text || "{\"orderItems\":[], \"unmatchedItems\":[], \"totalPrice\":0}");
};

export const spatialLensAnalysis = async (location: LatLng, shopName: string): Promise<LensAnalysis> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `Perform an intensive 'Lens Mode' spatial intelligence scrape for the urban sector around "${shopName}" at (${location.lat}, ${location.lng}). 
    Analyze simulated visual metadata for this specific street segment.
    
    Each item must include:
    - type: one of 'bottleneck', 'flow', 'friction', 'opportunity'
    - detail: A specific observation
    - causalBottleneck: A deep causal analysis.
    
    Return a JSON object with:
    - "observations": An array of EXACTLY 25 LensObservation objects.
    - "recommendation": A synthesized urban planning strategy.
    - "videoSource": A plausible YouTube URL relating to this area.
    
    IMPORTANT: Return ONLY raw JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          observations: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING },
                detail: { type: Type.STRING },
                causalBottleneck: { type: Type.STRING }
              },
              required: ["id", "type", "detail", "causalBottleneck"]
            } 
          },
          recommendation: { type: Type.STRING },
          videoSource: { type: Type.STRING }
        },
        required: ["observations", "recommendation", "videoSource"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const getTamilTextSummary = async (shop: Shop) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Describe ${shop.name} (${shop.cuisine}) in exactly ONE short sentence that combines Tamil and English. Use slang like 'Machi' or 'Veralevel'.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tamil: { type: Type.STRING },
          english: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const getTamilAudioSummary = async (shop: Shop) => {
  const summary = await getTamilTextSummary(shop);
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Cheerfully: ${summary.tamil}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
    }
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

export const generateVendorBio = async (name: string, cuisine: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a short ONE sentence marketing bio for a street food vendor named "${name}" selling "${cuisine}".`,
  });
  return (response.text || "").trim();
};

export const spatialAlertAgent = async (vendorName: string, location: LatLng) => {
  const prompt = `A street food vendor named "${vendorName}" has just gone LIVE at lat ${location.lat}, lng ${location.lng}. Create a localized broadcast message in Tamil. KEEP IT TO ONE SHORT SENTENCE.`;
  const textResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  const audioResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say excitedly: ${textResponse.text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
    }
  });
  return {
    tamilSummary: textResponse.text || "",
    audioData: audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  };
};

export const spatialChatAgent = async (message: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `User location: ${location.lat}, ${location.lng}. Inquiry: ${message}. Respond based on real-time spatial data.`,
    config: { 
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: location.lat,
            longitude: location.lng
          }
        }
      }
    }
  });
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Spatial Node",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));
  return { text: response.text || "", sources };
};