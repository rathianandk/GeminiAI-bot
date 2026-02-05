
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng, GroundingSource, LensAnalysis, SpatialAnalytics, FlavorGenealogy, MenuItem, FoodAnalysis, FootfallPoint } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Intelligently extracts and repairs a JSON object from a string.
 * Terminating exactly at the root object's closure prevents "Unexpected non-whitespace character" errors
 * caused by search grounding citations or model conversational filler appearing after the JSON.
 */
const repairJson = (json: string): string => {
  const startIdx = json.indexOf('{');
  if (startIdx === -1) return "{}";
  
  let openQuote = false;
  let braceCount = 0;
  let repaired = "";
  
  for (let i = startIdx; i < json.length; i++) {
    const char = json[i];
    const isEscaped = i > startIdx && json[i - 1] === '\\';
    
    // Track string state to avoid counting braces inside strings
    if (char === '"' && !isEscaped) {
      openQuote = !openQuote;
    }
    
    repaired += char;
    
    // Track brace nesting outside of strings
    if (!openQuote) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      
      // CRITICAL: Stop immediately when the root object is closed.
      // Any text after this point is what causes "Unexpected non-whitespace character" errors.
      if (braceCount === 0 && repaired.length > 0) {
        return repaired;
      }
    }
  }
  
  // Truncation fallback: if we reached the end of the string without closing the root object
  if (openQuote) repaired += '"';
  while (braceCount > 0) {
    repaired += '}';
    braceCount--;
  }
  
  return repaired;
};

/**
 * Climate Grounding Agent
 */
export const fetchLocalWeather = async (location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `SEARCH MISSION: Get current real-time weather for coordinates (${location.lat}, ${location.lng}). 
    Analyze the impact on street food vendors and outdoor dining.
    
    REQUIRED JSON OUTPUT:
    {
      "temp": "numeric value + unit only (e.g. 28°C)",
      "condition": "1-word condition (e.g. Sunny)",
      "impactScore": 85,
      "reasoning": "MAX 10 WORDS spatial impact statement"
    }`,
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

  const cleanField = (val: any, isTemp: boolean = false) => {
    if (typeof val !== 'string') return val;
    let cleaned = val.replace(/\[\d+\]|【.*?】|\(\s*Source\s*\d*\s*\)|source|snippet/gi, '').trim();
    if (isTemp) {
      const tempMatch = cleaned.match(/-?\d+\s*°[CF]/i);
      if (tempMatch) return tempMatch[0].replace(/\s+/g, '');
      cleaned = cleaned.split(/,|\(|\s/)[0];
    }
    return cleaned.trim();
  };

  try {
    const text = response.text || "{}";
    const data = JSON.parse(repairJson(text));
    
    return {
      temp: cleanField(data.temp, true) || "28°C",
      condition: cleanField(data.condition) || "Clear",
      impactScore: typeof data.impactScore === 'number' ? data.impactScore : 80,
      reasoning: cleanField(data.reasoning) || "Local thermal conditions are stable."
    };
  } catch (e) {
    console.error("Weather parsing failure:", e);
    return { temp: "28°C", condition: "Clear", impactScore: 80, reasoning: "Local thermal conditions are stable." };
  }
};

export const predictFootfallAgent = async (shop: Shop, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `MISSION: SPATIAL PREDICTION. REASON about the expected footfall and wait time for: ${shop.name} at (${location.lat}, ${location.lng}). Return 1 sentence.`,
  });
  return (response.text || "Grid analysis inconclusive.").trim();
};

export const discoveryAgent = async (query: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `SPATIAL DISCOVERY MISSION: Identify approximately 15 real, legendary street food spots within 5km of (${location.lat}, ${location.lng}). Use Google Search. Return JSON: { "shops": [...], "logs": [...] }`,
    config: { tools: [{ googleSearch: {} }] }
  });

  const text = (response.text || "").trim();
  let data: any = { shops: [], logs: [] };
  
  try {
    data = JSON.parse(repairJson(text));
  } catch (e) {
    console.error("Discovery Parse Error:", e);
  }

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Verification Link",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));

  const sanitizedShops = (data.shops || []).map((s: any, idx: number) => ({
    ...s,
    id: s.id || `sync-${idx}-${Date.now()}`,
    isVendor: false,
    reviews: Array.isArray(s.reviews) ? s.reviews : [],
    successReasoning: s.successReasoning || { locationGravity: 70, flavorMoat: 70, socialResonance: 70, economicFit: 70 },
    safetyMetrics: s.safetyMetrics || { crimeSafety: 70, policeProximity: 70, footfallIntensity: 70, lighting: 70, vibe: 70, nearestPoliceStations: [] },
    urbanLogistics: s.urbanLogistics || { transitAccessibility: 50, walkabilityScore: 50, parkingAvailability: 50, publicTransportNodes: [] },
    predictedFootfall: Array.isArray(s.predictedFootfall) ? s.predictedFootfall : [{ period: "Lunch", volume: 70 }]
  }));

  return { shops: sanitizedShops as Shop[], logs: (Array.isArray(data.logs) ? data.logs : ["Sector scanned via Search Grounding."]) as string[], sources };
};

export const analyzeFoodImage = async (base64Data: string, mimeType: string): Promise<FoodAnalysis> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { 
      parts: [
        { inlineData: { mimeType, data: base64Data } }, 
        { text: "MISSION: LENS MODE SPATIAL FOOD ANALYSIS. Return Narrative and then JSON block: { name, protein, calories, carbs, history_tags: [], recommended_shops: [], authenticity_score }" }
      ] 
    },
  });

  const text = response.text || "";
  const narrative = text.replace(/\{[\s\S]*\}/, "").trim();

  let data: any = {};
  try {
    data = JSON.parse(repairJson(text));
  } catch (e) {
    console.error("Image Analysis JSON error:", e);
  }

  return { 
    name: data.name || "Unknown Dish", 
    protein: data.protein || "N/A", 
    calories: data.calories || "N/A", 
    carbs: data.carbs || "N/A", 
    history_tags: Array.isArray(data.history_tags) ? data.history_tags : [], 
    authenticity_score: data.authenticity_score || "N/A", 
    recommended_shops: Array.isArray(data.recommended_shops) ? data.recommended_shops : [],
    narrative: narrative || "Visual parse complete."
  };
};

export const generateSpatialAnalytics = async (shops: Shop[]): Promise<SpatialAnalytics> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze: ${JSON.stringify(shops)}. Return JSON only.`,
    config: { responseMimeType: "application/json" }
  });
  
  let data: any = {};
  try {
    data = JSON.parse(repairJson(response.text || "{}"));
  } catch (e) {
    console.error("Analytics parse error:", e);
  }

  return {
    cuisineDistribution: Array.isArray(data.cuisineDistribution) ? data.cuisineDistribution : [],
    priceSpectrum: Array.isArray(data.priceSpectrum) ? data.priceSpectrum : [],
    legendaryIndex: Array.isArray(data.legendaryIndex) ? data.legendaryIndex : [],
    customerSegmentation: Array.isArray(data.customerSegmentation) ? data.customerSegmentation : [],
    sectorSummary: data.sectorSummary || "Analysis complete."
  };
};

export const getFlavorGenealogy = async (location: LatLng): Promise<FlavorGenealogy> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `MISSION: CROSS-TEMPORAL FLAVOR REASONING for location (${location.lat}, ${location.lng}). Return JSON: { neighborhood, timeline: [], summary }`,
    config: { responseMimeType: "application/json" }
  });
  
  let data: any = {};
  try {
    data = JSON.parse(repairJson(response.text || "{}"));
  } catch (e) {
    console.error("Genealogy parse error:", e);
  }

  return {
    neighborhood: data.neighborhood || "Unknown Sector",
    timeline: Array.isArray(data.timeline) ? data.timeline : [],
    summary: data.summary || "Archival records synchronized."
  };
};

export const parseOrderAgent = async (userInput: string, menu: MenuItem[]) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract order: "${userInput}" from Menu: ${JSON.stringify(menu)}. JSON: { "orderItems": [{ "name": "...", "quantity": 1 }] }`,
    config: { responseMimeType: "application/json" }
  });
  
  try {
    const data = JSON.parse(repairJson(response.text || "{}"));
    return { orderItems: Array.isArray(data.orderItems) ? data.orderItems : [] };
  } catch (e) {
    return { orderItems: [] };
  }
};

export const spatialLensAnalysis = async (location: LatLng, shopName: string): Promise<LensAnalysis> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `MISSION: 'Lens Mode' Scrape for "${shopName}" at (${location.lat}, ${location.lng}). Return JSON: { observations: [{ type, detail, causalBottleneck }], recommendation }`,
    config: { tools: [{ googleSearch: {} }] }
  });

  const text = response.text || "{}";
  let data: any = {};
  try {
    data = JSON.parse(repairJson(text));
  } catch (e) {
    console.error("Lens parse error:", e);
  }

  return {
    observations: Array.isArray(data.observations) ? data.observations : [],
    extractedFrames: [],
    recommendation: data.recommendation || "Structural analysis finalized.",
    videoSource: ""
  };
};

export const getTamilTextSummary = async (shop: Shop) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Write a summary of ${shop.name} in Tamil and English as JSON { "tamil": "...", "english": "..." }.`,
    config: { responseMimeType: "application/json" }
  });
  try {
    const data = JSON.parse(repairJson(response.text || "{}"));
    return { tamil: data.tamil || "தகவல் இல்லை", english: data.english || "No data available." };
  } catch (e) {
    return { tamil: "தகவல் இல்லை", english: "No data available." };
  }
};

export const getTamilAudioSummary = async (shop: Shop) => {
  const summary = await getTamilTextSummary(shop);
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Friendly Tamil voice: ${summary.tamil}` }] }],
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
    contents: `Vivid bio for ${name} selling ${cuisine}. 1-2 sentences.`,
  });
  return (response.text || "").trim();
};

export const spatialAlertAgent = async (vendorName: string, location: LatLng) => {
  const textResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Vendor ${vendorName} live at ${location.lat}, ${location.lng}. Create short alert.`,
  });
  return { tamilSummary: textResponse.text || "New node live in sector." };
};

export const spatialChatAgent = async (message: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `User near ${location.lat}, ${location.lng}. Question: ${message}. Use Maps/Search Grounding.`,
    config: { 
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
      toolConfig: {
        retrievalConfig: { latLng: { latitude: location.lat, longitude: location.lng } }
      }
    }
  });
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Verification Source",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));
  return { text: response.text || "Neural search inconclusive.", sources };
};
