
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng, GroundingSource, LensAnalysis, SpatialAnalytics, FlavorGenealogy, MenuItem, FoodAnalysis, FootfallPoint } from "../types";

// Initialize the Gemini API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Utility to strip grounding citations (e.g. [1], 【source】) from model output.
 */
const cleanGroundingText = (str: any, isTemp: boolean = false): string => {
  if (typeof str !== 'string') return String(str || '');
  let cleaned = str.replace(/\[\d+\]|【.*?】|\(source\)|source|snippet/gi, '').trim();
  if (isTemp) {
    const match = cleaned.match(/^-?\d+°[CF]/i);
    if (match) return match[0];
    cleaned = cleaned.split(/,|\(|\s/)[0].trim();
  }
  return cleaned;
};

/**
 * Climate Grounding Agent
 */
export const fetchLocalWeather = async (location: LatLng) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `SEARCH MISSION: Get current real-time weather for coordinates (${location.lat}, ${location.lng}). 
      Analyze the impact on street food vendors and outdoor dining.
      
      REQUIRED JSON OUTPUT:
      {
        "temp": "numeric value and unit (e.g. 28°C)",
        "condition": "vivid 1-word condition (e.g. Sunny, Rainy, Humid, Cloudy)",
        "impactScore": 85,
        "reasoning": "1-sentence spatial impact statement"
      }

      STRICT RULES:
      - Return ONLY raw JSON. No markdown code blocks.
      - No citations like [1] or 【source】.`,
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
          },
          required: ["temp", "condition", "impactScore", "reasoning"]
        }
      }
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    
    return {
      temp: cleanGroundingText(data.temp, true) || "28°C",
      condition: cleanGroundingText(data.condition) || "Clear",
      impactScore: typeof data.impactScore === 'number' ? data.impactScore : 80,
      reasoning: cleanGroundingText(data.reasoning) || "Local thermal conditions are stable."
    };
  } catch (e) {
    console.warn("Weather extraction failure handled:", e);
    return { temp: "28°C", condition: "Clear", impactScore: 80, reasoning: "Local thermal conditions are stable. (Fallback Active)" };
  }
};

/**
 * Discovery Agent
 */
export const discoveryAgent = async (query: string, location: LatLng) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `SPATIAL DISCOVERY MISSION: Identify approximately 10 real, legendary street food spots within 5km of: ${location.lat}, ${location.lng}. 
      
      REQUIRED JSON STRUCTURE:
      {
        "shops": [
          { 
            "id": "sync-unique-1", 
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
        "logs": ["Step 1: Scanned sector."]
      }`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || "";
    let data: { shops?: any[], logs?: string[] } = { shops: [], logs: [] };
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) data = JSON.parse(jsonMatch[0]);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
      title: c.web?.title || c.maps?.title || "Verification Link",
      uri: c.web?.uri || c.maps?.uri || "#"
    }));

    const sanitizedShops = (data.shops || []).map((s: any, idx: number) => ({
      ...s,
      id: s.id && String(s.id).startsWith('sync-') ? s.id : `sync-${idx}-${Date.now()}`,
      name: cleanGroundingText(s.name),
      description: cleanGroundingText(s.description),
      isVendor: false,
      reviews: [],
      successReasoning: s.successReasoning || { locationGravity: 70, flavorMoat: 70, socialResonance: 70, economicFit: 70 },
      safetyMetrics: s.safetyMetrics || { crimeSafety: 70, policeProximity: 70, footfallIntensity: 70, lighting: 70, vibe: 70, nearestPoliceStations: [] },
      urbanLogistics: s.urbanLogistics || { transitAccessibility: 50, walkabilityScore: 50, parkingAvailability: 50, publicTransportNodes: [] },
      predictedFootfall: s.predictedFootfall || [{ period: "Midday", volume: 70 }]
    }));

    return { shops: sanitizedShops as Shop[], logs: (data.logs || ["Sector scanned."]) as string[], sources };
  } catch (e) {
    console.error("Discovery Agent Failure:", e);
    return { shops: [], logs: ["Discovery tool unavailable. Check grid connectivity."], sources: [] };
  }
};

/**
 * Predictive Footfall Agent
 */
export const predictFootfallAgent = async (shop: Shop, location: LatLng) => {
  const now = new Date();
  const currentContext = {
    day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Predict demand for ${shop.name} (${shop.cuisine}) at ${location.lat}, ${location.lng}. Context: ${currentContext.day}, ${currentContext.time}. 1 sentence only.`,
  });
  return cleanGroundingText(response.text || "").trim();
};

/**
 * Lens Analysis for Food Images
 */
export const analyzeFoodImage = async (base64Data: string, mimeType: string): Promise<FoodAnalysis> => {
  const imagePart = { inlineData: { mimeType: mimeType, data: base64Data } };
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: [imagePart, { text: "Analyze food. Return Part A (Narrative) and Part B (JSON)." }] },
  });

  const text = response.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const narrative = text.replace(/\{[\s\S]*\}/, "").trim();

  if (jsonMatch) {
    try {
      return { ...JSON.parse(jsonMatch[0]), narrative: cleanGroundingText(narrative) };
    } catch (e) {}
  }
  return { name: "Unknown", protein: "0g", calories: "0kcal", carbs: "0g", history_tags: [], authenticity_score: "0%", narrative: "Lens analysis failed." };
};

/**
 * Generate Spatial Analytics for a cluster of shops
 */
export const generateSpatialAnalytics = async (shops: Shop[]): Promise<SpatialAnalytics> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze street food dataset for spatial trends: ${JSON.stringify(shops)}. 
    Return ONLY raw JSON matching the SpatialAnalytics interface.`,
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

  try {
    return JSON.parse(response.text.trim());
  } catch (e) {
    throw new Error("Failed to parse spatial analytics JSON");
  }
};

/**
 * Alert Agent for Vendor Activation
 */
export const spatialAlertAgent = async (name: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a high-hype activation alert for vendor ${name} at ${location.lat}, ${location.lng}. 
    Provide a vivid Tamil summary (Madras Bashai style) and an English version.
    
    RETURN JSON: { "tamilSummary": "vibrant text" }`,
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text.trim());
};

/**
 * Linguistic Agent for Shop Summaries
 */
export const getTamilTextSummary = async (shop: Shop) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Summarize this street food spot: ${shop.name} (${shop.cuisine}). 
    Provide a very local Tamil summary and a translation.
    
    RETURN JSON: { "tamil": "text", "english": "text" }`,
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text.trim());
};

/**
 * Audio Synthesis for Local Flavor
 */
export const getTamilAudioSummary = async (shop: Shop) => {
  const prompt = `Say in a friendly, high-energy local Chennai accent: Welcome to ${shop.name}! Today we are serving the best ${shop.cuisine}. Come get it while it is hot!`;
  
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
  
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

/**
 * Bio Generation for Vendors
 */
export const generateVendorBio = async (name: string, cuisine: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Write a punchy, 2-sentence bio for a street food vendor named "${name}" specializing in "${cuisine}". Use local flavor.`,
  });
  return response.text.trim();
};

/**
 * Spatial Reasoning Chat Agent
 */
export const spatialChatAgent = async (query: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Context: User is at ${location.lat}, ${location.lng}. Query: ${query}. 
    Provide spatial insights about street food, culture, or urban flow. Use Search.`,
    config: { tools: [{ googleSearch: {} }] }
  });

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
    title: c.web?.title || "Reference",
    uri: c.web?.uri || "#"
  }));

  return { text: response.text, sources };
};

/**
 * Lens Analysis for Urban Integration
 */
export const spatialLensAnalysis = async (location: LatLng, name: string): Promise<LensAnalysis> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Urban analysis for node "${name}" at ${location.lat}, ${location.lng}. 
    Identify 3-4 spatial observations (bottleneck, flow, opportunity) and extracted frames.
    Return JSON matching LensAnalysis interface.`,
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
          extractedFrames: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                description: { type: Type.STRING },
                category: { type: Type.STRING },
                spatialInsight: { type: Type.STRING }
              },
              required: ["id", "timestamp", "description", "category", "spatialInsight"]
            }
          },
          recommendation: { type: Type.STRING },
          videoSource: { type: Type.STRING }
        },
        required: ["observations", "extractedFrames", "recommendation", "videoSource"]
      }
    }
  });

  return JSON.parse(response.text.trim());
};

/**
 * Historical Flavor Genealogy Agent
 */
export const getFlavorGenealogy = async (location: LatLng): Promise<FlavorGenealogy> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Trace the food history and flavor migration near ${location.lat}, ${location.lng}. 
    Return a detailed JSON of FlavorGenealogy.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          neighborhood: { type: Type.STRING },
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
          },
          summary: { type: Type.STRING }
        },
        required: ["neighborhood", "timeline", "summary"]
      }
    }
  });
  return JSON.parse(response.text.trim());
};

/**
 * Natural Language Order Parsing
 */
export const parseOrderAgent = async (text: string, menu: MenuItem[]) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract order items from this text: "${text}" based on this menu: ${JSON.stringify(menu)}.
    Return JSON: { "orderItems": [{ "name": "string", "quantity": number }] }`,
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text.trim());
};
