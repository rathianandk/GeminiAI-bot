
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng, GroundingSource, LensAnalysis, SpatialAnalytics, FlavorGenealogy, MenuItem, FoodAnalysis, FootfallPoint } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

  // Aggressive cleaning to strip grounding citations and truncate extra verbiage
  const clean = (str: any, isTemp: boolean = false) => {
    if (typeof str !== 'string') return str;
    // Remove all forms of citations common in grounding
    let cleaned = str.replace(/\[\d+\]|【.*?】|\(source\)|source|snippet/gi, '').trim();
    
    // For temperature, truncate after the first unit to avoid "29°C, 84°F (RealFeel...)"
    if (isTemp) {
      const match = cleaned.match(/^\d+°[CF]/i);
      if (match) return match[0];
      // Fallback: take part before first comma, paren or space
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
    console.error("Weather extraction failure:", e);
    return { temp: "28°C", condition: "Clear", impactScore: 80, reasoning: "Local thermal conditions are stable." };
  }
};

/**
 * Predictive Footfall Agent
 * Uses Gemini 3 to reason about expected wait times and demand based on 
 * shop type, neighborhood, and current time context.
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
    Consider the type of food (snack vs meal), the neighborhood's typical patterns (e.g., Mylapore is busy during temple hours, Triplicane is busy for Biryani at night), and current timing. 
    
    EXAMPLE STYLE: "It's Friday at 7 PM and it's raining in Mylapore; expect the Bajjis at Jannal Kadai to have a 20-minute wait due to high demand for hot snacks in this weather."
    
    Be specific, use local flavor, and return ONLY the sentence. Do not include introductory text.`,
  });
  return (response.text || "").trim();
};

/**
 * Discovery Agent
 * Refined to use Gemini 3 Flash Preview with Google Search Grounding to find local nodes.
 */
export const discoveryAgent = async (query: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `SPATIAL DISCOVERY MISSION: Identify approximately 10 real, legendary street food spots, iconic eateries, and hidden culinary gems within a 5km radius of the coordinates: Latitude ${location.lat}, Longitude ${location.lng}. 
    
    INSTRUCTIONS:
    1. Use Google Search to find high-accuracy, real-world data about food spots near this location.
    2. For each identified location, provide: Name, precise lat/lng coordinates, emoji, cuisine type, a 1-sentence vivid description, and a short address.
    3. SUCCESS REASONING:
       - locationGravity: Score (0-100) based on transit flow.
       - flavorMoat: Score (0-100) based on dish uniqueness.
       - socialResonance: Score (0-100) based on local legend status.
       - economicFit: Score (0-100) based on neighborhood demographic match.
    4. SAFETY & LOGISTICS: Identify the nearest 1 police stations and nearest 1 public transport nodes.
    5. FOOTFALL PREDICTION: Predicted volume (0-100) for 5 time windows.
    
    REQUIRED JSON STRUCTURE (Output ONLY this raw JSON object):
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
      "logs": ["Step 1: Scanned coordinates.", "Step 2: Filtered for flavor legend status."]
    }`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  const text = (response.text || "").trim();
  let data: { shops?: any[], logs?: string[] } = { shops: [], logs: [] };
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      data = JSON.parse(jsonMatch[0]);
    } else {
      data.logs = ["Search grounding active but failed to return structured results."];
    }
  } catch (e) {
    console.error("Discovery Parse Error:", e);
    data.logs = ["Telemetry corruption detected in search result stream."];
  }

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Verification Link",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));

  const sanitizedShops = (data.shops || []).map((s: any, idx: number) => ({
    ...s,
    id: s.id && typeof s.id === 'string' && s.id.startsWith('sync-') ? s.id : `sync-${idx}-${Date.now()}`,
    isVendor: false,
    reviews: [],
    successReasoning: s.successReasoning || { locationGravity: 70, flavorMoat: 70, socialResonance: 70, economicFit: 70 },
    safetyMetrics: s.safetyMetrics || { crimeSafety: 70, policeProximity: 70, footfallIntensity: 70, lighting: 70, vibe: 70, nearestPoliceStations: [] },
    urbanLogistics: s.urbanLogistics || { transitAccessibility: 50, walkabilityScore: 50, parkingAvailability: 50, publicTransportNodes: [] },
    predictedFootfall: s.predictedFootfall || [{ period: "Lunch", volume: 70 }]
  }));

  return { shops: sanitizedShops as Shop[], logs: (data.logs || ["Sector scanned via Search Grounding."]) as string[], sources };
};

export const analyzeFoodImage = async (base64Data: string, mimeType: string): Promise<FoodAnalysis> => {
  const imagePart = {
    inlineData: {
      mimeType: mimeType,
      data: base64Data,
    },
  };
  const textPart = {
    text: `MISSION: LENS MODE SPATIAL FOOD ANALYSIS.
    FIRST: Determine if this image contains food or a street-food stall.
    
    IF NOT FOOD: 
    Return PART A (Narrative): "Spatial Error: My lens is tuned for the flavor grid, but I don't see any street-food here. Point me toward a stall or a plate to unlock the genealogy."
    Return PART B (JSON): { "error": "NOT_FOOD_DETECTED" }
    
    IF FOOD:
    1. Identification: Identify the primary dish and any visible sides.
    2. Flavour Genealogy: Trace the historical spice migration and cultural origin of this dish to the modern street corner using your 1M token context of culinary history.
    3. Nutritional Inference: Estimate Protein (g), Calories (kcal), and Carbs (g).
    4. Spatial Vibe: Detect the "Authenticity Level" (0-100%) based on environment/plating.
    5. Recommendations: List 2 real legendary shops in Chennai famous for this specific dish.
    
    Return the response in two strictly separated parts:
    
    PART A (Narrative): 
    A 3-sentence "Local Fixer" story about the food's history and soul.
    
    PART B (JSON): 
    { 
      "name": "Dish Name", 
      "protein": "number + g", 
      "calories": "number + kcal", 
      "carbs": "number + g",
      "history_tags": ["tag1", "tag2"], 
      "authenticity_score": "number%",
      "recommended_shops": ["Legendary Shop 1", "Legendary Shop 2"]
    }
    
    STRICT FORMAT: Provide PART A and then PART B as a JSON block.`,
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: [imagePart, textPart] },
  });

  const text = response.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  const narrative = text
    .replace(/\{[\s\S]*\}/, "") 
    .replace(/PART\s*[AB]/gi, "") 
    .replace(/\(?Narrative\)?[:\-]?/gi, "") 
    .replace(/\(?JSON\)?[:\-]?/gi, "") 
    .replace(/```[a-z]*/gi, "") 
    .replace(/```/gi, "") 
    .trim();

  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[0]);
      return { ...data, narrative };
    } catch (e) {
      console.error("Image Analysis JSON error:", e);
    }
  }

  return { 
    name: "Unknown Entity", 
    protein: "0g", 
    calories: "0kcal", 
    carbs: "0g", 
    history_tags: [], 
    authenticity_score: "0%", 
    recommended_shops: [],
    narrative: narrative || "Analysis failed to produce structured data."
  };
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

export const getFlavorGenealogy = async (location: LatLng): Promise<FlavorGenealogy> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `MISSION: CROSS-TEMPORAL FLAVOR REASONING for location (${location.lat}, ${location.lng}). Trace the historical staples, spice migration, and icons across eras.`,
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
    contents: `Extract order: "${userInput}" from Menu: ${JSON.stringify(menu)}. Map Tamil counts to numbers.`,
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
          totalPrice: { type: Type.NUMBER }
        },
        required: ["orderItems", "totalPrice"]
      }
    }
  });
  return JSON.parse(response.text || "{\"orderItems\":[], \"totalPrice\":0}");
};

export const spatialLensAnalysis = async (location: LatLng, shopName: string): Promise<LensAnalysis> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `MISSION: 'Lens Mode' Intensive Spatial Intelligence Scrape for "${shopName}" at (${location.lat}, ${location.lng}). Ground observations in real visual layout details.`,
    config: {
      tools: [{ googleSearch: {} }],
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
              }
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

export const getTamilTextSummary = async (shop: Shop) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Write a summary of ${shop.name} in Tamil and English as JSON { "tamil": "...", "english": "..." }.`,
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
    contents: [{ parts: [{ text: `Cheerfully in Tamil: ${summary.tamil}` }] }],
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
    contents: `Bio for ${name} selling ${cuisine}.`,
  });
  return (response.text || "").trim();
};

export const spatialAlertAgent = async (vendorName: string, location: LatLng) => {
  const textResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Vendor ${vendorName} live at ${location.lat}, ${location.lng}.`,
  });
  const audioResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Excitedly: ${textResponse.text}` }] }],
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
    contents: `User location: ${location.lat}, ${location.lng}. Inquiry: ${message}.`,
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
    title: c.web?.title || c.maps?.title || "Verification Source",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));
  return { text: response.text || "", sources };
};
