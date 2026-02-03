import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng, GroundingSource, LensAnalysis, SpatialAnalytics, FlavorGenealogy, MenuItem, FoodAnalysis, FootfallPoint } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const discoveryAgent = async (query: string, location: LatLng) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `SPATIAL DISCOVERY MISSION: Identify approximately 25 legendary street food spots, iconic eateries, and hidden culinary gems within a 5km radius of (${location.lat}, ${location.lng}). 
    
    INSTRUCTIONS:
    1. Scan Google Maps and Search for authentic food nodes and safety intelligence.
    2. For each identified location, provide: Name, precise lat/lng, emoji, cuisine, 1-sentence vivid description, and short address.
    3. SAFETY ANALYSIS: Reason about local safety metrics and identify exactly the top 3 nearest police station names.
    4. URBAN LOGISTICS: Reason about Public Transit, Walkability, and Parking. Identify exactly the top 3 nearest public transport nodes (Bus stops, Metro stations, Railway).
    5. FOOTFALL PREDICTION: Provide a predicted footfall volume (0-100) for 5 periods: "6am-10am", "11am-2pm", "3pm-6pm", "7pm-10pm", "11pm-2am".
    
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
          "safetyMetrics": {
            "crimeSafety": 85, 
            "policeProximity": 70, 
            "footfallIntensity": 90, 
            "lighting": 80, 
            "vibe": 95,
            "nearestPoliceStations": ["Station Name 1", "Station Name 2"]
          },
          "urbanLogistics": {
            "transitAccessibility": 90,
            "walkabilityScore": 85,
            "parkingAvailability": 40,
            "publicTransportNodes": ["Bus Stop A", "Metro Station B"]
          },
          "predictedFootfall": [
            {"period": "6am-10am", "volume": 40},
            {"period": "11am-2pm", "volume": 85},
            {"period": "3pm-6pm", "volume": 55},
            {"period": "7pm-10pm", "volume": 95},
            {"period": "11pm-2am", "volume": 20}
          ]
        }
      ],
      "logs": [
        "Internal step 1 summary...",
        "Internal step 2 summary..."
      ]
    }
    
    CRITICAL: Output ONLY the raw JSON object. Do not include markdown formatting.`,
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
    return { shops: [], logs: ["Discovery signal timeout. Check connectivity."], sources: [] };
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      data = JSON.parse(jsonMatch[0]);
    } else {
      data.logs = [`No structured JSON found in telemetry. Response: ${text.substring(0, 100)}...`];
    }
  } catch (e) {
    console.error("Discovery Parse Error:", e, text);
    data.logs = ["Data corruption in spatial stream. Parsing failed."];
    data.shops = [];
  }

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: GroundingSource[] = groundingChunks.map((c: any) => ({
    title: c.web?.title || c.maps?.title || "Reference Node",
    uri: c.web?.uri || c.maps?.uri || "#"
  }));

  const sanitizedShops = (data.shops || []).map((s: any, idx: number) => ({
    ...s,
    id: s.id && typeof s.id === 'string' && s.id.startsWith('sync-') ? s.id : `sync-${idx}-${Date.now()}`,
    isVendor: false,
    reviews: [],
    safetyMetrics: s.safetyMetrics || { crimeSafety: 70, policeProximity: 70, footfallIntensity: 70, lighting: 70, vibe: 70, nearestPoliceStations: [] },
    urbanLogistics: s.urbanLogistics || { transitAccessibility: 50, walkabilityScore: 50, parkingAvailability: 50, publicTransportNodes: [] },
    predictedFootfall: s.predictedFootfall || [
      { period: "6am-10am", volume: 30 },
      { period: "11am-2pm", volume: 70 },
      { period: "3pm-6pm", volume: 50 },
      { period: "7pm-10pm", volume: 85 },
      { period: "11pm-2am", volume: 15 }
    ]
  }));

  const resultLogs = (data.logs && data.logs.length > 0) ? data.logs : ["Grid scan successful. Visualizing nodes."];

  return { shops: sanitizedShops as Shop[], logs: resultLogs as string[], sources };
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
      "authenticity_score": "number%" 
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
    contents: `EXTRACT ORDER ITEMS FROM USER INPUT.
    
    USER INPUT: "${userInput}"
    SHOP MENU: ${JSON.stringify(menu)}
    
    INSTRUCTIONS:
    1. Identify ONLY the items mentioned in the LATEST USER INPUT provided above. Do NOT include items from previous context.
    2. Support English and Tamil.
    3. Tamil quantity mappings: "onnu/onru" = 1, "rendu" = 2, "moonu" = 3, "naalu" = 4, "anju" = 5, "aaru" = 6, "ezhu" = 7, "ettu" = 8, "onbadhu" = 9, "pathu" = 10.
    4. Map Tamil pronunciations to English menu names (e.g. "biryani" -> "Mutton Biryani" if that's the closest match).
    5. If an item name is vague, pick the best match from the menu.
    6. Return a list of items and their individual counts.
    
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
    contents: `MISSION: 'Lens Mode' Intensive Spatial Intelligence Scrape for "${shopName}" at (${location.lat}, ${location.lng}).
    
    TASK:
    1. Use Google Search to find accurate spatial and visual details for this establishment. 
    2. Specifically, determine if it is a street cart, a rooftop venue (like La Cabana in Nungambakkam), or an indoor eatery.
    3. Analyze the urban integration:
       - If rooftop: Focus on panoramic visibility, structural elevation, and "Sky-Dining" flow.
       - If street stall: Focus on sidewalk proxemics, tree shade integration, and cart efficiency.
       - If indoor: Focus on interior zoning and entrance/boundary management.
    
    Return a JSON object with:
    - "observations": Array of 10-15 detailed LensObservation objects grounding the establishment in its real layout.
    - "extractedFrames": Array of 5-8 LensFrame objects (vivid descriptions of what a camera sees at the location).
    - "recommendation": A synthesized urban planning/spatial strategy.
    - "videoSource": Link to a relevant visual reference (e.g. @RollingSirrr or restaurant's official tour).
    
    IMPORTANT: Provide ONLY high-precision observations. Ground the response in real Google Search data for "${shopName}". Return ONLY raw JSON.`,
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

  return JSON.parse(response.text || "{}");
};

export const getTamilTextSummary = async (shop: Shop) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Write a hyper-local, enthusiastic summary of ${shop.name} (${shop.cuisine}) in both Tamil and English. Focus on the vibe and why people love it. Use street slang like 'Machi' and 'Veralevel'.`,
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
    contents: `Create a punchy, short 2-sentence marketing bio for a street food vendor named "${name}" who sells "${cuisine}".`,
  });
  return (response.text || "").trim();
};

export const spatialAlertAgent = async (vendorName: string, location: LatLng) => {
  const prompt = `A street food vendor named "${vendorName}" has just gone LIVE at lat ${location.lat}, lng ${location.lng}. Create a localized broadcast message in Tamil.`;
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