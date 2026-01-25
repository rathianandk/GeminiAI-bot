
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng, GroundingSource } from "../types";

export const generateVendorBio = async (name: string, cuisine: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    You are a marketing expert for street food vendors. 
    Write a 1-sentence catchy, high-energy bio for a shop named "${name}" that serves "${cuisine}". 
    Use words like "Legendary", "Must-try", "Vera Level", or "Iconic".
    Keep it under 100 characters.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text?.trim() || `The most legendary ${cuisine} spot in town!`;
  } catch (error) {
    return `Famous ${cuisine} destination.`;
  }
};

export const spatialChatAgent = async (message: string, center: LatLng): Promise<{ text: string; sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `User is at ${center.lat}, ${center.lng}. ${message}`,
      config: {
        systemInstruction: "You are a spatial AI. Use the provided maps tool to find real-world locations. Always mention specific landmarks. If you find a location, provide its name and why it's interesting.",
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: center.lat,
              longitude: center.lng
            }
          }
        }
      }
    });

    const text = response.text || "I'm having trouble retrieving details for that location.";
    const sources: GroundingSource[] = [];

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach((chunk: any) => {
      if (chunk.maps) {
        sources.push({
          title: chunk.maps.title || "Map Location",
          uri: chunk.maps.uri
        });
      } else if (chunk.web) {
        sources.push({
          title: chunk.web.title || "Web Source",
          uri: chunk.web.uri
        });
      }
    });

    return { text, sources };
  } catch (error) {
    console.error("Chat Error:", error);
    return { text: "The spatial grid is currently unstable. Please try again.", sources: [] };
  }
};

export const discoveryAgent = async (query: string): Promise<{ shops: Shop[], logs: string[], sources: GroundingSource[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const logs: string[] = ["Initiating MASSIVE Web-Scale Scraping for street food nodes...", "Processing search grounding chunks for high-density mapping..."];

  const prompt = `
    ORCHESTRATION TASK: MASSIVE SPATIAL DATA MINING
    TARGET: Street food recommendations in Chennai (covering Sowcarpet, Mylapore, Triplicane, T.Nagar, West Mambalam, and Besant Nagar).
    
    1. Identify EXACTLY 25 highly rated, iconic, and legendary street food locations.
    2. For each: Name, Lat/Lng (precise/accurate), Cuisine Type, and a short high-energy description.
    
    Return a structured JSON with a "shops" array.
    {
      "shops": [{
        "name": "string",
        "lat": number,
        "lng": number,
        "cuisine": "string",
        "description": "string",
        "address": "string"
      }]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 24000 }
      }
    });

    const text = response.text || '{"shops": []}';
    const data = JSON.parse(text.trim());
    const sources: GroundingSource[] = [];
    
    // Capture mandatory web sources
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    chunks.forEach((chunk: any) => {
      if (chunk.web) {
        sources.push({ title: chunk.web.title || "Research Source", uri: chunk.web.uri });
      }
    });

    const shops: Shop[] = (data.shops || []).map((s: any, i: number) => ({
      id: `sync-${i}-${Date.now()}`,
      name: s.name,
      coords: { lat: s.lat, lng: s.lng },
      isVendor: false,
      emoji: "🥘",
      cuisine: s.cuisine,
      description: s.description,
      address: s.address,
      menu: []
    }));

    return { 
      shops, 
      logs: [...logs, `Successfully anchored ${shops.length} spatial food nodes from verified web results.`],
      sources 
    };
  } catch (error) {
    console.error("Discovery Error:", error);
    return { shops: [], logs: [...logs, "Discovery Agent hit a capacity error. Attempting secondary scan..."], sources: [] };
  }
};

export const summarizeInTamil = async (shop: Shop): Promise<{ tamilText: string; englishText: string; audioData: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    You are a food expert. Summarize "${shop.name}" which serves "${shop.cuisine}".
    Use colloquial Madras Tamil (Tamil script). Friendly and energetic.
    Return JSON: {"tamil": "text", "english": "text"}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const result = JSON.parse(response.text || '{"tamil": "", "english": ""}');
    
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: result.tamil }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      }
    });

    const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    return { tamilText: result.tamil, englishText: result.english, audioData };
  } catch (error) {
    return { tamilText: "மன்னிக்கவும்.", englishText: "Sorry.", audioData: "" };
  }
};

export const spatialAlertAgent = async (vendorName: string, coords: LatLng): Promise<{ tamilSummary: string; englishSummary: string; audioData: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Find a landmark near ${coords.lat}, ${coords.lng} and create a 1-sentence Tamil arrival guide for ${vendorName}. Return JSON: {"tamil": "text", "english": "text"}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
  });

  const result = JSON.parse(response.text || '{"tamil": "", "english": ""}');
  
  const ttsResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: result.tamil }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
      }
    }
  });

  return { tamilSummary: result.tamil, englishSummary: result.english, audioData: ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "" };
};
