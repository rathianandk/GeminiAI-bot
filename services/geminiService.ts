
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Shop, LatLng } from "../types";

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

export const discoveryAgent = async (query: string): Promise<{ shops: Shop[], logs: string[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const logs: string[] = ["Initiating Web-Scale Scraping for 'Rolling Sirrr' recommendations...", "Deep-scanning transcripts for location markers..."];

  const prompt = `
    ORCHESTRATION TASK: MASSIVE DATA MINING
    TARGET: "Rolling Sirrr" (YouTube Vlogger) street food catalog in Chennai.
    
    1. Identify at least 30-50 specific street food locations mentioned by Rolling Sirrr.
    2. Focus on iconic spots: Sowcarpet, Mylapore, Parrys, Triplicane, etc.
    3. For each: Name, Lat/Lng (precise or approximate center of area), Cuisine Type, a short juicy description, AND the specific Address or Locality.
    
    Return a structured JSON with a "shops" array. Be as comprehensive as possible.
    {
      "shops": [{
        "name": "string",
        "lat": number,
        "lng": number,
        "cuisine": "string",
        "description": "string",
        "address": "string",
        "sourceUrl": "string"
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

    const data = JSON.parse(response.text || '{"shops": []}');
    const shops: Shop[] = data.shops.map((s: any, i: number) => ({
      id: `sync-${i}-${Date.now()}`,
      name: s.name,
      coords: { lat: s.lat, lng: s.lng },
      isVendor: false,
      emoji: s.cuisine?.toLowerCase().includes('biryani') ? "🍗" : s.cuisine?.toLowerCase().includes('juice') ? "🥤" : "🥘",
      cuisine: s.cuisine,
      description: s.description,
      address: s.address,
      sourceUrl: s.sourceUrl
    }));

    return { shops, logs: [...logs, `Successfully mined ${shops.length} legendary food nodes.`] };
  } catch (error) {
    console.error("Discovery Error:", error);
    return { shops: [], logs: [...logs, "Discovery Agent hit a rate limit or logic error."] };
  }
};

export const summarizeInTamil = async (shop: Shop): Promise<{ tamilText: string; englishText: string; audioData: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    You are a passionate food expert who speaks colloquial "Madras Tamil" just like the vlogger Rolling Sirrr. 
    Tell me about "${shop.name}" which serves "${shop.cuisine}" at "${shop.address || 'Chennai'}".
    Context: ${shop.description}
    
    Your style MUST be extremely friendly, using words like "Machan", "Nanba", "Vera Level". 
    Provide a mouth-watering summary in 2 sentences in TAMIL. 
    
    Return a JSON object:
    {
      "tamil": "Your summary in colloquial Tamil script",
      "english": "Exact translation of that summary in English"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 2000 }
      }
    });

    const result = JSON.parse(response.text || '{"tamil": "", "english": ""}');
    const tamilText = result.tamil || "மச்சான், இந்த கடை வேற லெவல், கண்டிப்பா ட்ரை பண்ணு நண்பா!";
    const englishText = result.english || "Buddy, this place is next level, definitely try it friend!";

    const ttsResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Speak enthusiastically in colloquial Tamil: ${tamilText}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      }
    });

    const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    return { tamilText, englishText, audioData };
  } catch (error) {
    return { tamilText: "மன்னிக்கவும், எங்களால் இப்போது பேச முடியவில்லை.", englishText: "Sorry, we can't speak right now.", audioData: "" };
  }
};

export const spatialAlertAgent = async (vendorName: string, coords: LatLng): Promise<{ tamilSummary: string; englishSummary: string; audioData: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const spatialPrompt = `
    Locate landmarks within 200m of (${coords.lat}, ${coords.lng}). 
    Synthesize a short, 1-sentence landmark-based arrival guide for ${vendorName}. 
    Use local Chennai landmarks if possible.
    Return a JSON object:
    {
      "tamil": "Your guide in Tamil",
      "english": "Your guide in English"
    }
  `;

  const spatialResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: spatialPrompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json"
    }
  });

  const result = JSON.parse(spatialResponse.text || '{"tamil": "", "english": ""}');
  const tamilSummary = result.tamil || "கடைக்கு அருகில் உள்ள முக்கிய அடையாளத்தை தேடுகிறேன்!";
  const englishSummary = result.english || "Looking for a key landmark near the shop!";

  const ttsResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Speak in a clear notification voice in Tamil: ${tamilSummary}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
      }
    }
  });

  const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  return { tamilSummary, englishSummary, audioData };
};
