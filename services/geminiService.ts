
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng, GroundingSource, LensAnalysis, SpatialAnalytics, FlavorGenealogy, MenuItem, FoodAnalysis, FootfallPoint } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Order Management Engine
 * Processes orders and returns virtual queue data with haptic configurations.
 */
export const initializeQueueAgent = async (orderItems: any[], shopName: string) => {
  const orderString = orderItems.map(it => `${it.quantity}x ${it.name}`).join(", ");
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `**CONTEXT**: You are the order management engine for a street food app.
**TASK**: Process the user's order and return a JSON object that initializes a virtual queue and sets a haptic alert.

**INPUT**: 
- Order: "${orderString}"
- Location: "${shopName}"

**OUTPUT JSON STRUCTURE**:
{
  "queueStatus": {
    "queueID": "Q-{{RANDOM_NUMBER}}",
    "position": 1,
    "status": "confirmed"
  },
  "orderSummary": {
    "items": [],
    "total": 0
  },
  "hapticConfiguration": {
    "type": "PANERA_PAGER",
    "pattern": [1000, 500, 1000, 500, 1000],
    "trigger": "ON_READY"
  },
  "textNotification": "Order placed! You are Q-{{NUMBER}}. Your phone will buzz like a pager when it's ready."
}`,
    config: {
      responseMimeType: "application/json",
    }
  });

  try {
    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    const rand = Math.floor(Math.random() * 999);
    return {
      queueStatus: { queueID: `Q-${rand}`, position: Math.ceil(Math.random() * 5), status: "confirmed" },
      hapticConfiguration: { type: "PANERA_PAGER", pattern: [1000, 500, 1000, 500, 1000], trigger: "ON_READY" },
      textNotification: `Order placed! You are Q-${rand}. Your phone will buzz when it's ready.`
    };
  }
};

/**
 * Climate Grounding Agent
 * Fetches real-time weather and calculates a "Street Food Synergy Score"
 */
export const fetchLocalWeather = async (location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `SEARCH MISSION: Get current real-time weather for coordinates (${location.lat}, ${location.lng}). 
    Analyze the impact on street food vendors and outdoor dining.
    
    REQUIRED JSON OUTPUT:
    {
      "temp": "concise temperature, only numeric value and unit (e.g. 28°C)",
      "condition": "vivid 1-word condition (e.g. Sunny, Rainy, Humid, Cloudy)",
      "impactScore": 85,
      "reasoning": "1-sentence spatial impact statement"
    }

    STRICT RULES:
    - Do NOT include any source citations, footnotes, or bracketed numbers like [1], [2], or 【source】.
    - The 'temp' field must be a simple string like '29°C'. Do not add RealFeel or other stats.
    - The 'condition' field must be exactly one or two words.
    - Return ONLY valid raw JSON. No preamble.`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          temp: { type: Type.STRING },
          condition: { type: Type.STRING },
          impactScore: { type: Type.NUMBER },
          reasoning: { type: Type.STRING }
        }
      }
    }
  });

  const clean = (str: any, isTemp: boolean = false) => {
    if (typeof str !== 'string') return str;
    let cleaned = str.replace(/\[\d+\]|【.*?】|\(source\)|source|snippet/gi, '').trim();
    if (isTemp) {
      const match = cleaned.match(/^\d+°[CF]/i);
      if (match) return match[0];
      cleaned = cleaned.split(/,|\(|\s/)[0].trim();
    }
    return cleaned;
  };

  try {
    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const rawJson = jsonMatch ? jsonMatch[0] : text;
    const data = JSON.parse(rawJson);
    return {
      temp: clean(data.temp, true) || "28°C",
      condition: clean(data.condition) || "Clear",
      impactScore: typeof data.impactScore === 'number' ? data.impactScore : 80,
      reasoning: clean(data.reasoning) || "Local thermal conditions are stable."
    };
  } catch (e) {
    return { temp: "28°C", condition: "Clear", impactScore: 80, reasoning: "Local thermal conditions are stable." };
  }
};

/**
 * Predictive Footfall Agent
 */
export const predictFootfallAgent = async (shop: Shop, location: LatLng) => {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentContext = {
    day: days[now.getDay()],
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `MISSION: SPATIAL PREDICTION. 
    REASON about the expected footfall and wait time for this food node:
    NAME: ${shop.name}
    CUISINE: ${shop.cuisine}
    LOCATION: ${location.lat}, ${location.lng}
    CONTEXT: Today is ${currentContext.day}, current time is ${currentContext.time}.
    
    TASK: Provide a 1-sentence predictive reasoning statement about the current demand. 
    Consider the type of food (snack vs meal), the neighborhood's typical patterns, and current timing. 
    Be specific, use local flavor, and return ONLY the sentence.`,
  });
  return (response.text || "").trim();
};

/**
 * Discovery Agent
 * Identifies legendary street food spots near coordinates using Search Grounding.
 */
export const discoveryAgent = async (query: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `SPATIAL DISCOVERY MISSION: Identify approximately 10 real, legendary street food spots near coordinates: Latitude ${location.lat}, Longitude ${location.lng}. Query: ${query}.
    
    REQUIRED JSON STRUCTURE:
    {
      "shops": [
        { 
          "id": "sync-unique-id", 
          "name": "Name", 
          "coords": {"lat": 13.0, "lng": 80.0}, 
          "emoji": "🥘", 
          "cuisine": "Type", 
          "description": "Story", 
          "address": "Address",
          "successReasoning": { "locationGravity": 85, "flavorMoat": 90, "socialResonance": 75, "economicFit": 80 },
          "safetyMetrics": { "crimeSafety": 85, "policeProximity": 70, "footfallIntensity": 90, "lighting": 80, "vibe": 95, "nearestPoliceStations": ["Name 1"] },
          "urbanLogistics": { "transitAccessibility": 90, "walkabilityScore": 85, "parkingAvailability": 40, "publicTransportNodes": ["Stop A"] },
          "predictedFootfall": [ {"period": "6am-10am", "volume": 40}, {"period": "11am-2pm", "volume": 85}, {"period": "3pm-6pm", "volume": 55}, {"period": "7pm-10pm", "volume": 95}, {"period": "11pm-2am", "volume": 20} ]
        }
      ],
      "logs": ["Step 1: Scanned coordinates."]
    }`,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
    }
  });

  const text = (response.text || "").trim();
  let data: { shops: Shop[], logs: string[] } = { shops: [], logs: [] };
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) data = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("Discovery Parse Error:", e);
  }

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = (Array.isArray(groundingChunks) ? groundingChunks : []).map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Verification Link",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));

  return {
    shops: (data.shops || []).map((s, idx) => ({ ...s, id: `sync-${idx}-${Date.now()}` })),
    logs: data.logs || [],
    sources
  };
};

/**
 * Spatial Alert Agent
 * Generates a localized Tamil summary for a vendor activation.
 */
export const spatialAlertAgent = async (vendorName: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate a short, hype-filled Tamil announcement for vendor "${vendorName}" activating their live signal at ${location.lat}, ${location.lng}. 
    Include English translation. Keep it under 2 sentences.`,
  });
  return { tamilSummary: response.text || "" };
};

/**
 * Tamil Text Summary Agent
 */
export const getTamilTextSummary = async (shop: Shop) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Summarize the legendary status of "${shop.name}" (${shop.cuisine}) in both Tamil and English. 
    Make it feel like a local food explorer sharing a secret.`,
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
  return JSON.parse(response.text || '{"tamil": "", "english": ""}');
};

/**
 * Tamil Audio Summary Agent (TTS)
 */
export const getTamilAudioSummary = async (shop: Shop) => {
  const prompt = `Say cheerfully in Tamil: Vanakkam! You must try the ${shop.cuisine} at ${shop.name}. It is a local legend in the grid!`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
};

/**
 * Vendor Bio Generator
 */
export const generateVendorBio = async (name: string, cuisine: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Write a 2-sentence marketing bio for a street food vendor named "${name}" specializing in "${cuisine}". Use evocative, sensory language.`,
  });
  return response.text || "";
};

/**
 * Spatial Chat Agent
 * Queries the grid with Google Search grounding.
 */
export const spatialChatAgent = async (query: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `User location is ${location.lat}, ${location.lng}. User query: ${query}`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = (Array.isArray(groundingChunks) ? groundingChunks : []).map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Search Result",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));

  return {
    text: response.text || "No data available.",
    sources
  };
};

/**
 * Spatial Lens Analysis
 */
export const spatialLensAnalysis = async (location: LatLng, shopName: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `MISSION: SPATIAL LENS ANALYSIS. 
    REASON about the urban integration and physical presence of the food node "${shopName}" at coordinates (${location.lat}, ${location.lng}).
    
    TASK:
    1. Provide 3-4 "Spatial Observations" regarding pedestrian flow, structural elevation, and architectural authenticity.
    2. Provide a master "Recommendation" for urban logistics improvement.

    REQUIRED JSON STRUCTURE:
    {
      "observations": [
        { "type": "bottleneck", "detail": "Details here...", "causalBottleneck": "Reason here..." }
      ],
      "recommendation": "Summary recommendation...",
      "videoSource": "Simulation channel active"
    }`,
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
                type: { type: Type.STRING },
                detail: { type: Type.STRING },
                causalBottleneck: { type: Type.STRING }
              }
            }
          },
          recommendation: { type: Type.STRING },
          videoSource: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

/**
 * Spatial Analytics Generator
 */
export const generateSpatialAnalytics = async (shops: Shop[]) => {
  const shopData = JSON.stringify(shops.map(s => ({ name: s.name, cuisine: s.cuisine, price: s.menu?.[0]?.price })));
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Analyze this aggregate street food node data: ${shopData}. Provide distribution, price spectrum, and segmentation.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cuisineDistribution: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { label: { type: Type.STRING }, count: { type: Type.NUMBER }, percentage: { type: Type.NUMBER } }
            }
          },
          priceSpectrum: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { range: { type: Type.STRING }, nodes: { type: Type.ARRAY, items: { type: Type.STRING } } }
            }
          },
          legendaryIndex: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { name: { type: Type.STRING }, score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } }
            }
          },
          customerSegmentation: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { segment: { type: Type.STRING }, description: { type: Type.STRING }, volume: { type: Type.NUMBER } }
            }
          },
          sectorSummary: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

/**
 * Flavor Genealogy Agent
 */
export const getFlavorGenealogy = async (location: LatLng) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Trace the culinary history and flavor genealogy of the neighborhood at ${location.lat}, ${location.lng}.`,
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
              }
            }
          }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

/**
 * Order Parsing Agent
 */
export const parseOrderAgent = async (input: string, menu: MenuItem[]) => {
  const menuStr = JSON.stringify(menu);
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Identify items and quantities from the user input: "${input}". Use this menu: ${menuStr}`,
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
                quantity: { type: Type.NUMBER }
              }
            }
          }
        }
      }
    }
  });
  return JSON.parse(response.text || '{"orderItems": []}');
};

/**
 * Multimodal Food Image Analyzer
 */
export const analyzeFoodImage = async (base64: string, mimeType: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64, mimeType } },
        { text: "Analyze this food image. Provide nutritional estimates and historical narrative. If it's not food, set error." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          protein: { type: Type.STRING },
          calories: { type: Type.STRING },
          carbs: { type: Type.STRING },
          history_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          authenticity_score: { type: Type.STRING },
          narrative: { type: Type.STRING },
          recommended_shops: { type: Type.ARRAY, items: { type: Type.STRING } },
          error: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};
