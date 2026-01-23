
import { GoogleGenAI, Type, FunctionDeclaration, Modality } from "@google/genai";
import { ModelType, Message, LatLng, GroundingChunk, Shop, MenuItem } from "../types";

const cleanJsonString = (str: string): string => {
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const askGemini = async (
  prompt: string,
  modelType: ModelType,
  location?: LatLng,
  featuredShopsContext?: string
): Promise<Partial<Message>> => {
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

/**
 * Uses gemini-2.5-flash to process Tamil voice commands for adding menu items.
 */
export const processTamilVoiceMenu = async (base64Audio: string): Promise<{ name: string; price: string } | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const addMenuItemFunction: FunctionDeclaration = {
    name: "add_menu_item",
    parameters: {
      type: Type.OBJECT,
      description: "Extract the dish name and price from the user's speech.",
      properties: {
        name: { type: Type.STRING, description: "The name of the dish in English or Transliterated Tamil." },
        price: { type: Type.STRING, description: "The price with currency symbol, e.g. ₹50." }
      },
      required: ["name", "price"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "audio/wav", data: base64Audio } },
            { text: "The user is a food vendor speaking in Tamil. They are trying to add a dish to their menu. Extract the dish name and the price. Use the add_menu_item function." }
          ]
        }
      ],
      config: {
        tools: [{ functionDeclarations: [addMenuItemFunction] }]
      }
    });

    const calls = response.functionCalls;
    if (calls && calls.length > 0) {
      const args = calls[0].args as any;
      return { name: args.name, price: args.price };
    }
    return null;
  } catch (error) {
    console.error("Voice Processing Error:", error);
    return null;
  }
};

/**
 * Generates an audio commentary explaining landmarks near a vendor's live broadcast.
 */
export const generateVoiceCommentary = async (vendor: Shop): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `You are a friendly local food guide. A street vendor named ${vendor.name} is broadcasting live from coordinates ${vendor.coords.lat}, ${vendor.coords.lng}. 
  Briefly explain (15-20 words) where this is by mentioning 2-3 nearby landmarks or famous spots in this part of town. 
  Make it sound exciting for a hungry explorer. Use a cheerful tone.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Zephyr' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio || null;
  } catch (error) {
    console.error("Voice Commentary Error:", error);
    return null;
  }
};
