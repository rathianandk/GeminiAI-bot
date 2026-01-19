
import { GoogleGenAI } from "@google/genai";
import { ModelType, Message, LatLng, GroundingChunk } from "../types";

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

    // Directly access the .text property
    const text = response.text || "I'm sorry, I couldn't process that request.";
    
    // Extract grounding chunks
    const chunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[]) || [];
    
    // Map chunks to our local interface
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
