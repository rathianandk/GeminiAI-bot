
import { GoogleGenAI, Type } from "@google/genai";
import { ModelType, Message, LatLng, GroundingChunk, Shop } from "../types";

/**
 * Helper to strip markdown code blocks from JSON strings.
 */
const cleanJsonString = (str: string): string => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const askGemini = async (
  prompt: string,
  modelType: ModelType,
  location?: LatLng,
  featuredShopsContext?: string
): Promise<Partial<Message>> => {
  // Initialize AI client inside the function to ensure current context/key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const config: any = {
      systemInstruction: `You are GeoMind, an expert travel and food guide. 
      You have specific knowledge about "Rolling Sirrr" YouTube channel food recommendations. 
      Here are some featured shops you know about: ${featuredShopsContext}.
      When asked about these shops, provide details from this list.
      Always try to use Google Maps grounding to provide real-time information and links if relevant.`,
      tools: [],
    };

    if (modelType === ModelType.MAPS) {
      config.tools.push({ googleMaps: {} });
      if (location) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: location.lat,
              longitude: location.lng,
            }
          }
        };
      }
    } else if (modelType === ModelType.SEARCH) {
      config.tools.push({ googleSearch: {} });
    }

    const response = await ai.models.generateContent({
      model: modelType,
      contents: prompt,
      config: config
    });

    const text = response.text || "I'm sorry, I couldn't process that request.";
    const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[]) || [];
    
    const groundingLinks: GroundingChunk[] = chunks.map(chunk => ({
      web: chunk.web ? { uri: chunk.web.uri, title: chunk.web.title } : undefined,
      maps: chunk.maps ? { uri: chunk.maps.uri, title: chunk.maps.title } : undefined
    }));

    return {
      content: text,
      groundingLinks: groundingLinks,
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      content: `Error: ${error instanceof Error ? error.message : "An unexpected error occurred."}`,
    };
  }
};

/**
 * Specifically uses Gemini 3 Pro and Google Search to fetch legendary food spots.
 * Optimizes the prompt to focus on actionable extraction and handles JSON cleaning.
 */
export const fetchLegendarySpots = async (count: number = 10): Promise<{ spots: Shop[], sources: GroundingChunk[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Perform a deep web search for street food recommendations from the YouTube channel 'Rolling Sirrr'.
  Focus on their most popular and recently featured spots in Chennai and Tamil Nadu.
  Extract exactly ${count} unique legendary street food shops that are not commonly listed in basic directories.
  
  For each shop, you MUST provide:
  - name: Full name of the shop
  - address: Area/Locality in Chennai or Tamil Nadu
  - cuisine: Specific food type (e.g., Atho, Briyani, Mess food)
  - description: A short, catchy reason why it is considered legendary or what specifically they are famous for.
  - lat: Approximate Latitude (numeric)
  - lng: Approximate Longitude (numeric)

  Return the data ONLY as a JSON object with a 'shops' array property.`;

  try {
    const response = await ai.models.generateContent({
      model: ModelType.PRO,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shops: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  address: { type: Type.STRING },
                  cuisine: { type: Type.STRING },
                  description: { type: Type.STRING },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ["name", "address", "cuisine", "description", "lat", "lng"]
              }
            }
          },
          required: ["shops"]
        }
      }
    });

    const rawText = response.text || '{"shops": []}';
    const cleanedText = cleanJsonString(rawText);
    const result = JSON.parse(cleanedText);
    
    const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[]) || [];
    
    const groundingLinks: GroundingChunk[] = chunks.map(chunk => ({
      web: chunk.web ? { uri: chunk.web.uri, title: chunk.web.title } : undefined,
      maps: chunk.maps ? { uri: chunk.maps.uri, title: chunk.maps.title } : undefined
    }));

    const parsedSpots: Shop[] = (result.shops || []).map((s: any, index: number) => ({
      id: `sync-${Date.now()}-${index}`,
      name: s.name,
      address: s.address,
      cuisine: s.cuisine,
      description: s.description,
      coords: { lat: s.lat, lng: s.lng },
      emoji: '🎬',
      rating: 4.8,
      reviews: [],
      isVendor: false
    }));

    return { spots: parsedSpots, sources: groundingLinks };
  } catch (error) {
    console.error("Deep Sync Error:", error);
    return { spots: [], sources: [] };
  }
};
