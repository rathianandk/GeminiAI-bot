
import React, { useState, useEffect, useRef } from 'react';
import FoodMap from './components/Map';
import { discoveryAgent, spatialAlertAgent, getTamilTextSummary, getTamilAudioSummary, generateVendorBio, spatialChatAgent, spatialLensAnalysis, generateSpatialAnalytics } from './services/geminiService';
import { Shop, LatLng, AgentLog, VendorStatus, VendorProfile, MenuItem, ChatMessage, GroundingSource, LensAnalysis, SpatialAnalytics } from './types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

const SEED_SHOPS: Shop[] = [
  { id: 'seed-1', name: 'Jannal Kadai', coords: { lat: 13.0336, lng: 80.2697 }, isVendor: false, emoji: '🥘', cuisine: 'Bajjis', description: 'Legendary window-service spot in Mylapore.', address: 'Mylapore, Chennai' },
  { id: 'seed-2', name: 'Kalathi Rose Milk', coords: { lat: 13.0333, lng: 80.2685 }, isVendor: false, emoji: '🥤', cuisine: 'Drinks', description: 'The most iconic Rose Milk in the city.', address: 'South Mada St, Chennai' }
];

const SEED_PROFILES: VendorProfile[] = [
  { 
    id: 'profile-1', 
    name: "Mamu's Biryani", 
    emoji: '🍗', 
    cuisine: 'Biryani', 
    description: 'Triplicane wood-fired legacy.', 
    lastLocation: { lat: 13.0585, lng: 80.2730 }, 
    menu: [{ name: 'Mutton Biryani', price: 250 }, { name: 'Chicken 65', price: 120 }],
    hours: '12:00 - 23:00'
  }
];

// --- Global Audio/Live Helpers ---
let persistentAudioCtx: AudioContext | null = null;
let activeVoiceSource: AudioBufferSourceNode | null = null;
let liveNextStartTime = 0;
const liveSources = new Set<AudioBufferSourceNode>();

const getAudioCtx = () => {
  if (!persistentAudioCtx) {
    persistentAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return persistentAudioCtx;
};

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodePCM(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  let workingBuffer = data.buffer;
  let offset = data.byteOffset;
  if (offset % 2 !== 0) {
    const aligned = new Uint8Array(data.length);
    aligned.set(data);
    workingBuffer = aligned.buffer;
    offset = 0;
  }
  const dataInt16 = new Int16Array(workingBuffer, offset, data.length / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const VoiceWave = ({ isActive, isSpeaking }: { isActive: boolean; isSpeaking: boolean }) => {
  if (!isActive) return null;
  const palette = isSpeaking 
    ? ["from-rose-500 via-amber-400 to-emerald-400", "from-emerald-400 via-cyan-400 to-pink-500", "from-yellow-300 via-white to-orange-400"]
    : ["from-indigo-600 via-purple-600 to-blue-400", "from-purple-500 via-blue-600 to-indigo-400", "from-blue-400 via-white to-purple-400"];
  const glow = isSpeaking ? "bg-emerald-500/20" : "bg-indigo-500/20";
  return (
    <div className="relative flex items-center justify-center w-16 h-16 overflow-visible animate-in fade-in zoom-in-95 duration-1000">
      <div className={`absolute inset-[-4px] ${glow} rounded-full blur-3xl animate-pulse transition-colors duration-700`}></div>
      <div className={`absolute inset-0 bg-gradient-to-tr ${palette[0]} opacity-90 blur-xl animate-siri-liquid mix-blend-screen transition-all duration-700`}></div>
      <div className={`absolute inset-1 bg-gradient-to-bl ${palette[1]} opacity-90 blur-lg animate-siri-liquid-alt mix-blend-screen transition-all duration-700`}></div>
      <div className={`absolute inset-2 bg-gradient-to-r ${palette[2]} opacity-60 blur-md animate-siri-liquid-fast mix-blend-screen transition-all duration-700`}></div>
      <div className="relative w-5 h-5 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,1)] border border-white/40 animate-pulse"></div>
    </div>
  );
};

const SetupAnimation = () => (
  <div className="flex items-center justify-center gap-2">
    <div className="flex gap-1 items-center">
      <span className="animate-bounce delay-75 duration-700">🥘</span>
      <span className="animate-bounce delay-200 duration-700">🍳</span>
      <span className="animate-bounce delay-500 duration-700">🚚</span>
    </div>
    <span className="text-[7px] font-black uppercase tracking-widest animate-pulse">Scanning Grid...</span>
  </div>
);

export default function App() {
  const [shops, setShops] = useState<Shop[]>(SEED_SHOPS);
  const [logs, setLogs] = useState<AgentLog[]>([{
    id: 'init-1',
    agent: 'Linguistic',
    message: 'Vanakkam! GeoMind initialized with street-level accuracy.',
    status: 'resolved'
  }]);
  const [lastSources, setLastSources] = useState<GroundingSource[]>([]);
  const [isMining, setIsMining] = useState(false);
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [location, setLocation] = useState<LatLng>({ lat: 13.0827, lng: 80.2707 });
  const [userMode, setUserMode] = useState<'explorer' | 'vendor'>('explorer');
  const [explorerTab, setExplorerTab] = useState<'logs' | 'discovery' | 'analytics'>('discovery');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatLang, setChatLang] = useState<'en-US' | 'ta-IN'>('en-US');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ id: '1', role: 'model', text: 'Vanakkam! Ask me anything about street food or landmarks.' }]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Analytics States
  const [analytics, setAnalytics] = useState<SpatialAnalytics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Lens Mode States
  const [isLensMode, setIsLensMode] = useState(false);
  const [isLensAnalyzing, setIsLensAnalyzing] = useState(false);
  const [lensAnalysis, setLensAnalysis] = useState<LensAnalysis | null>(null);
  const [lensTab, setLensTab] = useState<'observations' | 'synthesis'>('observations');

  const [myProfiles, setMyProfiles] = useState<VendorProfile[]>(() => {
    const saved = localStorage.getItem('geomind_profiles');
    return saved ? JSON.parse(saved) : SEED_PROFILES;
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isSettingUpLive, setIsSettingUpLive] = useState(false);
  const [isUpdatingGPS, setIsUpdatingGPS] = useState(false);
  const [regForm, setRegForm] = useState({ 
    name: '', 
    cuisine: '', 
    emoji: '🥘', 
    description: '', 
    startHour: 9, 
    endHour: 22, 
    menu: [] as MenuItem[] 
  });
  const [newItem, setNewItem] = useState({ name: '', price: '' });

  // Live API Refs
  const liveSessionRef = useRef<any>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    localStorage.setItem('geomind_profiles', JSON.stringify(myProfiles));
    setShops(prev => {
      const baseShops = prev.filter(s => !s.isVendor);
      const vendorShops = myProfiles.map(p => {
        const liveId = `live-${p.id}`;
        const prevLiveInstance = prev.find(s => s.id === liveId && s.status === VendorStatus.ONLINE);
        return {
          id: prevLiveInstance ? liveId : p.id,
          name: p.name,
          coords: prevLiveInstance ? prevLiveInstance.coords : (p.lastLocation || location),
          isVendor: true,
          status: prevLiveInstance ? VendorStatus.ONLINE : VendorStatus.OFFLINE,
          emoji: p.emoji,
          cuisine: p.cuisine,
          description: p.description,
          menu: p.menu,
          hours: p.hours
        };
      });
      return [...baseShops, ...vendorShops];
    });
  }, [myProfiles]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const addLog = (agent: AgentLog['agent'], message: string, status: AgentLog['status'] = 'processing') => {
    setLogs(prev => [{ id: Math.random().toString(), agent, message, status }, ...prev.slice(0, 50)]);
  };

  const playVoice = async (base64: string) => {
    if (!base64) { setIsVoiceActive(false); return; }
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      if (activeVoiceSource) { try { activeVoiceSource.stop(); } catch(e) {} }
      const bytes = decode(base64);
      const audioBuffer = await decodePCM(bytes, ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => { setIsSpeaking(false); setIsVoiceActive(false); if (activeVoiceSource === source) activeVoiceSource = null; };
      activeVoiceSource = source;
      setIsSpeaking(true);
      source.start();
    } catch (err) { setIsSpeaking(false); setIsVoiceActive(false); }
  };

  const stopLiveSession = () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    for (const source of liveSources) {
      try { source.stop(); } catch (e) {}
    }
    liveSources.clear();
    setIsVoiceActive(false);
    setIsSpeaking(false);
  };

  const handleBroadcastLive = async () => {
    const profile = myProfiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    setIsSettingUpLive(true);

    try {
      const alert = await spatialAlertAgent(profile.name, location);
      if (alert.audioData) await playVoice(alert.audioData);

      // Initialize Gemini Live Session for real-time voice bot interaction
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const outCtx = getAudioCtx();
      if (outCtx.state === 'suspended') await outCtx.resume();

      const inCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioCtxRef.current = inCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inCtx.createMediaStreamSource(stream);
            const scriptProcessor = inCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) int16[i] = inputData[i] * 32768;
              const b64 = encode(new Uint8Array(int16.buffer));
              sessionPromise.then(s => s.sendRealtimeInput({ 
                media: { data: b64, mimeType: 'audio/pcm;rate=16000' } 
              }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inCtx.destination);
            addLog('Spatial', `Live voice link established for ${profile.name}.`, 'resolved');
          },
          onmessage: async (msg: LiveServerMessage) => {
            const b64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (b64) {
              setIsVoiceActive(true);
              setIsSpeaking(true);
              liveNextStartTime = Math.max(liveNextStartTime, outCtx.currentTime);
              const buf = await decodePCM(decode(b64), outCtx, 24000, 1);
              const src = outCtx.createBufferSource();
              src.buffer = buf;
              src.connect(outCtx.destination);
              src.onended = () => {
                liveSources.delete(src);
                if (liveSources.size === 0) setIsSpeaking(false);
              };
              src.start(liveNextStartTime);
              liveNextStartTime += buf.duration;
              liveSources.add(src);
            }
            if (msg.serverContent?.interrupted) {
              for (const s of liveSources) { s.stop(); liveSources.delete(s); }
              liveNextStartTime = 0;
            }
          },
          onclose: () => {
            setIsVoiceActive(false);
            setIsSpeaking(false);
          },
          onerror: (e) => {
            console.error("Live session error:", e);
            stopLiveSession();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are the voice of GeoMind AI, supporting the vendor "${profile.name}" at their street food stall. Be helpful, enthusiastic, and provide spatial insights about their location (${location.lat}, ${location.lng}). Help them manage the crowd or describe their menu: ${JSON.stringify(profile.menu)}.`,
        }
      });

      liveSessionRef.current = await sessionPromise;
      setIsVoiceActive(true);

      const liveShop: Shop = { 
        id: `live-${profile.id}`, 
        name: profile.name, 
        coords: location, 
        isVendor: true, 
        status: VendorStatus.ONLINE, 
        emoji: profile.emoji, 
        cuisine: profile.cuisine, 
        description: alert.tamilSummary, 
        hours: profile.hours, 
        menu: profile.menu 
      };
      setShops(prev => [liveShop, ...prev.filter(s => s.id !== liveShop.id && s.id !== profile.id)]);
      addLog('Spatial', `Broadcasting ${profile.name} live signal. Voice bot active.`, 'resolved');
    } catch (err) { 
      setIsVoiceActive(false); 
      stopLiveSession();
      addLog('Spatial', 'Failed to establish voice bot signal.', 'failed');
    } finally { 
      setIsSettingUpLive(false); 
    }
  };

  const handleShopSelect = async (shop: Shop) => {
    setActiveShop(shop);
    setLocation(shop.coords);
    setIsVoiceActive(true);
    getTamilAudioSummary(shop).then(data => data ? playVoice(data) : setIsVoiceActive(false));
    getTamilTextSummary(shop).then(summary => addLog('Linguistic', `Spatial Insight: ${summary.tamil}\n\n${summary.english}`, 'resolved'));
  };

  const startLensAnalysis = async () => {
    if (!activeShop) return;
    setIsLensAnalyzing(true);
    setIsLensMode(true);
    setLensAnalysis(null);
    setLensTab('observations');
    addLog('Lens', `Performing intensive 25-point spatial scrape around ${activeShop.name}...`, 'processing');
    try {
      const analysis = await spatialLensAnalysis(activeShop.coords, activeShop.name);
      setLensAnalysis(analysis);
      addLog('Lens', `25 spatial causalities identified for urban sector.`, 'resolved');
    } catch (err) {
      addLog('Lens', `Visual node interference detected. Scraping failed.`, 'failed');
    } finally {
      setIsLensAnalyzing(false);
    }
  };

  // Improved computeAnalytics to accept optional shop data to bypass state race conditions
  const computeAnalytics = async (shopData?: Shop[]) => {
    const targetShops = shopData || shops;
    if (targetShops.filter(s => s.id.startsWith('sync')).length === 0) {
      addLog('Analytics', 'Insufficient spatial nodes for analytics. Discovery required.', 'failed');
      return;
    }
    setIsAnalyzing(true);
    setExplorerTab('analytics');
    addLog('Analytics', 'Processing food grid metrics and customer segmentation...', 'processing');
    try {
      const res = await generateSpatialAnalytics(targetShops.filter(s => !s.isVendor));
      setAnalytics(res);
      addLog('Analytics', 'Spatial intelligence dashboard synchronized.', 'resolved');
    } catch (err) {
      addLog('Analytics', 'Telemetry parsing failed. Visual subsystem offline.', 'failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const syncGPS = () => {
    setIsUpdatingGPS(true);
    setTimeout(() => {
      setIsUpdatingGPS(false);
      addLog('Spatial', `High-precision GPS sync complete at ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}.`, 'resolved');
    }, 1200);
  };

  const startEditHub = (profile: VendorProfile) => {
    const [start, end] = (profile.hours || "9:00 - 22:00").split(' - ').map(h => parseInt(h));
    setRegForm({
      name: profile.name,
      cuisine: profile.cuisine,
      emoji: profile.emoji,
      description: profile.description,
      startHour: start || 9,
      endHour: end || 22,
      menu: [...(profile.menu || [])]
    });
    setIsEditing(true);
    setIsRegistering(true);
  };

  const handleSaveHub = () => {
    if (!regForm.name || !regForm.cuisine) {
      alert("Name and Cuisine are required to establish a node.");
      return;
    }
    let targetId = activeProfileId;
    if (isEditing && activeProfileId) {
      setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? {
        ...p,
        name: regForm.name,
        cuisine: regForm.cuisine,
        emoji: regForm.emoji,
        description: regForm.description,
        hours: `${regForm.startHour}:00 - ${regForm.endHour}:00`,
        menu: regForm.menu
      } : p));
      addLog('Spatial', `Node "${regForm.name}" updated in central registry.`, 'resolved');
    } else {
      const newId = Date.now().toString();
      const newProfile: VendorProfile = {
        id: newId,
        name: regForm.name,
        cuisine: regForm.cuisine,
        emoji: regForm.emoji,
        description: regForm.description,
        lastLocation: location,
        hours: `${regForm.startHour}:00 - ${regForm.endHour}:00`,
        menu: regForm.menu
      };
      setMyProfiles(prev => [...prev, newProfile]);
      addLog('Spatial', `Initial signal for "${regForm.name}" established.`, 'resolved');
      targetId = newId;
    }
    setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] });
    setIsRegistering(false);
    setIsEditing(false);
    if (targetId) setActiveProfileId(targetId);
  };

  const deleteHub = (id: string) => {
    if (!confirm("Confirm decommissioning? All spatial history will be purged.")) return;
    setMyProfiles(prev => prev.filter(p => p.id !== id));
    setShops(prev => prev.filter(s => s.id !== id && s.id !== `live-${id}`));
    setActiveProfileId(null);
    addLog('Spatial', `Node decommissioned. Signal severed from the grid.`, 'failed');
  };

  const addMenuItem = () => {
    if (!newItem.name || !newItem.price) return;
    setRegForm(prev => ({
      ...prev,
      menu: [...prev.menu, { name: newItem.name, price: parseInt(newItem.price) }]
    }));
    setNewItem({ name: '', price: '' });
  };

  const removeMenuItem = (index: number) => {
    setRegForm(prev => ({
      ...prev,
      menu: prev.menu.filter((_, i) => i !== index)
    }));
  };

  const generateBio = async () => {
    if (!regForm.name || !regForm.cuisine) return;
    setIsGeneratingBio(true);
    const bio = await generateVendorBio(regForm.name, regForm.cuisine);
    setRegForm(prev => ({ ...prev, description: bio }));
    setIsGeneratingBio(false);
  };

  const startDiscovery = async () => {
    setIsMining(true);
    setExplorerTab('logs');
    addLog('Discovery', 'Initiating wide-band 25-point spatial scrape...', 'processing');
    try {
      const result = await discoveryAgent("Legendary street food and hidden gems", location);
      
      // Update shops locally for immediate use in analytics
      const updatedShops = [...shops.filter(s => !s.id.startsWith('sync-')), ...result.shops];
      setShops(updatedShops);
      setLastSources(result.sources);
      
      let logIndex = 0;
      const interval = setInterval(() => {
        if (logIndex < result.logs.length) {
          addLog('Discovery', result.logs[logIndex], 'resolved');
          logIndex++;
        } else {
          clearInterval(interval);
          addLog('Discovery', `Discovery Complete: Identified 25 legends in this sector.`, 'resolved');
          setIsMining(false);
          // LOOP AUTOMATION: Automatically trigger analytics without manual click
          computeAnalytics(updatedShops);
        }
      }, 400);
    } catch (err) {
      addLog('Discovery', 'Discovery node timeout. Atmospheric interference suspected.', 'failed');
      setIsMining(false);
    }
  };

  const activeProfile = myProfiles.find(p => p.id === activeProfileId);
  const discoveredShops = shops.filter(s => s.id.startsWith('sync-'));
  const isCurrentlyLive = activeProfileId && shops.some(s => s.id === `live-${activeProfileId}` && s.status === VendorStatus.ONLINE);

  return (
    <div className="flex h-screen w-screen bg-[#020202] text-slate-300 font-mono overflow-hidden selection:bg-indigo-500/30">
      <style>{`
        @keyframes siri-liquid { 0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(0deg) scale(1); } 33% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(120deg) scale(1.1); } 66% { border-radius: 100% 60% 60% 100% / 100% 100% 60% 60%; transform: rotate(240deg) scale(0.9); } 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(360deg) scale(1); } }
        @keyframes siri-liquid-alt { 0% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(360deg) scale(1.1); } 50% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(180deg) scale(0.9); } 100% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(0deg) scale(1.1); } }
        @keyframes siri-liquid-fast { 0% { border-radius: 50%; transform: scale(1) rotate(0deg); } 50% { border-radius: 40% 60% 40% 60%; transform: scale(1.2) rotate(180deg); } 100% { border-radius: 50%; transform: scale(1) rotate(360deg); } }
        @keyframes scanline { 0% { top: 0; } 100% { top: 100%; } }
        @keyframes lensPulse { 0% { border-color: rgba(99, 102, 241, 0.1); } 50% { border-color: rgba(99, 102, 241, 0.5); } 100% { border-color: rgba(99, 102, 241, 0.1); } }
        @keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .animate-siri-liquid { animation: siri-liquid 8s linear infinite; }
        .animate-siri-liquid-alt { animation: siri-liquid-alt 12s ease-in-out infinite; }
        .animate-siri-liquid-fast { animation: siri-liquid-fast 4s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .animate-scanline { animation: scanline 4s linear infinite; }
        .animate-lens-pulse { animation: lensPulse 2.5s ease-in-out infinite; }
        .animate-grow { animation: grow 0.8s ease-out forwards; transform-origin: bottom; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

      {/* Sidebar Navigation */}
      <div className="w-[450px] border-r border-white/5 bg-[#080808] flex flex-col z-20 shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5 shrink-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-sm font-black tracking-[0.4em] text-white">GEOMIND AI</h1>
            <div className="flex gap-2">
              <button onClick={() => setUserMode('explorer')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'explorer' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 text-white/40'}`}>Explorer</button>
              <button onClick={() => setUserMode('vendor')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'vendor' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-white/5 text-white/40'}`}>Partner Hub</button>
            </div>
          </div>
          
          {userMode === 'explorer' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={startDiscovery} disabled={isMining} className="py-4 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20">
                  {isMining ? <SetupAnimation /> : 'Run Food Scrape'}
                </button>
                <button onClick={() => computeAnalytics()} disabled={isAnalyzing || discoveredShops.length === 0} className="py-4 bg-pink-600/20 text-pink-500 border border-pink-500/20 text-[9px] font-black uppercase rounded-xl transition-all active:scale-[0.98] disabled:opacity-30">
                  {isAnalyzing ? 'Computing...' : 'Grid Analytics'}
                </button>
              </div>
              <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                <button onClick={() => setExplorerTab('logs')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${explorerTab === 'logs' ? 'bg-white/10 text-white shadow-inner' : 'text-white/20 hover:text-white/40'}`}>Intel Feed</button>
                <button onClick={() => setExplorerTab('discovery')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${explorerTab === 'discovery' ? 'bg-white/10 text-white shadow-inner' : 'text-white/20 hover:text-white/40'}`}>Legends ({discoveredShops.length})</button>
                <button onClick={() => setExplorerTab('analytics')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${explorerTab === 'analytics' ? 'bg-white/10 text-white shadow-inner' : 'text-white/20 hover:text-white/40'}`}>Visualization</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeProfileId ? (
                <div className="p-5 rounded-3xl bg-[#0a0a0a] border border-white/10 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 blur-[40px] rounded-full -mr-16 -mt-16"></div>
                  <div className="flex items-center gap-4 relative z-10">
                    <span className="text-3xl bg-white/5 p-3 rounded-2xl border border-white/5 shadow-inner">{activeProfile?.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white uppercase truncate tracking-tight">{activeProfile?.name}</p>
                      <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest">{activeProfile?.cuisine} Expertise</p>
                    </div>
                    <button onClick={() => setActiveProfileId(null)} className="text-[10px] text-white/20 hover:text-white transition-colors p-2">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 relative z-10">
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <p className="text-[7px] font-black text-white/30 uppercase mb-1">Spatial Health</p>
                      <p className="text-[10px] font-black text-white uppercase tracking-tighter">98.4% Precision</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                      <p className="text-[7px] font-black text-white/30 uppercase mb-1">Grid Impact</p>
                      <p className="text-[10px] font-black text-white uppercase tracking-tighter">1.2k Local Scans</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 relative z-10">
                    {isCurrentlyLive ? (
                      <button onClick={stopLiveSession} className="py-4 bg-rose-600 text-white text-[10px] font-black rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2">
                        STOP LIVE VOICE SESSION
                      </button>
                    ) : (
                      <button onClick={handleBroadcastLive} disabled={isSettingUpLive} className="py-4 bg-emerald-600 text-white text-[10px] font-black rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2">
                        {isSettingUpLive ? <SetupAnimation /> : 'GO LIVE ON SPATIAL GRID'}
                      </button>
                    )}
                    <div className="flex gap-2">
                       <button onClick={() => syncGPS()} disabled={isUpdatingGPS} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white text-[9px] font-black uppercase rounded-2xl border border-white/5 transition-all">
                         {isUpdatingGPS ? 'Syncing...' : '🛰️ Sync GPS'}
                       </button>
                       <button onClick={() => activeProfile && startEditHub(activeProfile)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white text-[9px] font-black uppercase rounded-2xl border border-white/5 transition-all">Edit Node</button>
                    </div>
                    <button onClick={() => deleteHub(activeProfileId)} className="w-full py-2.5 text-rose-500/40 hover:text-rose-500 text-[8px] font-black uppercase tracking-widest transition-colors">Sever Node Transmission</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { 
                  setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] });
                  setIsEditing(false); 
                  setIsRegistering(true); 
                }} className="w-full py-12 border border-dashed border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 text-indigo-400/60 hover:text-indigo-400 text-[10px] font-black uppercase rounded-[3rem] transition-all group overflow-hidden relative shadow-inner">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <span className="flex flex-col items-center gap-3 relative z-10">
                    <span className="text-4xl opacity-40 group-hover:opacity-100 group-hover:scale-125 transition-all duration-700 ease-out">🏬</span>
                    <span className="tracking-[0.3em]">Initialize Partner Node</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {userMode === 'explorer' ? (
            explorerTab === 'logs' ? (
              <div className="space-y-4">
                {logs.map(l => (
                  <div key={l.id} className="p-4 rounded-xl border border-white/5 bg-[#0a0a0a] animate-in slide-in-from-left-4 duration-300 shadow-sm">
                    <span className={`text-[7px] font-black px-2 py-0.5 rounded border uppercase ${l.agent === 'Linguistic' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : l.agent === 'Discovery' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : l.agent === 'Lens' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>{l.agent}</span>
                    <p className="text-[10px] font-bold text-slate-400 leading-relaxed mt-2 whitespace-pre-line tracking-tight">{l.message}</p>
                  </div>
                ))}
              </div>
            ) : explorerTab === 'discovery' ? (
              <div className="space-y-3">
                {discoveredShops.map((s, i) => (
                  <button key={s.id} onClick={() => handleShopSelect(s)} className="w-full p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-left transition-all group shadow-sm flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="shrink-0 w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-all">{s.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-white uppercase group-hover:text-indigo-400 transition-colors truncate">{s.name}</p>
                      <p className="text-[8px] text-indigo-400/60 font-black uppercase mt-1 truncate">{s.cuisine} • {s.address || 'Street Hub'}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-700">
                {isAnalyzing ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-pink-500/20 border-t-pink-500 rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase text-pink-500/60 animate-pulse tracking-widest">Synthesizing Visual Grid...</p>
                  </div>
                ) : analytics ? (
                  <div className="space-y-8 pb-10">
                    {/* Customer Segmentation Section */}
                    <div className="space-y-4">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em]">Customer Segmentation</p>
                      <div className="grid grid-cols-1 gap-3">
                        {analytics.customerSegmentation?.map((seg, i) => (
                          <div key={i} className="p-4 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl space-y-2">
                             <div className="flex justify-between items-center">
                                <span className="text-[11px] font-black text-white uppercase tracking-tight">{seg.segment}</span>
                                <span className="text-[11px] font-black text-emerald-400">{seg.volume}%</span>
                             </div>
                             <p className="text-[9px] text-slate-400 leading-tight">"{seg.description}"</p>
                             <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                               <div className="h-full bg-emerald-500" style={{ width: `${seg.volume}%` }}></div>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em]">Cuisine Diversity Heatmap</p>
                      <div className="space-y-3">
                        {analytics.cuisineDistribution?.map((item, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                              <span>{item.label}</span>
                              <span className="text-indigo-400">{item.percentage.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 animate-grow" style={{ width: `${item.percentage}%`, animationDelay: `${i * 100}ms` }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.4em]">Legendary Sentiment Index</p>
                      <div className="space-y-3">
                        {analytics.legendaryIndex?.map((item, i) => (
                          <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-pink-500/30 transition-all">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[11px] font-black text-white uppercase">{item.name}</span>
                              <span className="text-[14px] font-black text-pink-500">{item.score}</span>
                            </div>
                            <p className="text-[9px] text-slate-400 leading-relaxed italic">"{item.reasoning}"</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl space-y-3">
                       <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Master Grid Summary</p>
                       <p className="text-[11px] font-bold text-slate-200 leading-relaxed">"{analytics.sectorSummary}"</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center opacity-20">
                    <p className="text-[10px] font-black uppercase">Grid Visualization Offline.</p>
                    <p className="text-[8px] mt-2">Run food discovery and compute analytics.</p>
                  </div>
                )}
              </div>
            )
          ) : (
            !activeProfileId && myProfiles.map(p => (
              <div key={p.id} className="w-full p-5 rounded-[2rem] bg-[#0a0a0a] border border-white/10 hover:border-white/20 flex justify-between items-center transition-all group shadow-lg">
                <div className="flex items-center gap-4">
                  <span className="text-3xl bg-white/5 p-3 rounded-2xl border border-white/5 shadow-inner">{p.emoji}</span>
                  <div>
                    <p className="text-[12px] font-black text-white uppercase leading-none">{p.name}</p>
                    <p className="text-[9px] text-white/40 font-black uppercase mt-1">{p.cuisine}</p>
                  </div>
                </div>
                <button onClick={() => setActiveProfileId(p.id)} className="px-6 py-3 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white text-[9px] font-black uppercase rounded-2xl transition-all shadow-inner">Manage Node</button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 relative bg-[#020202]">
        <FoodMap center={location} shops={shops} onLocationChange={setLocation} onShopClick={handleShopSelect} />
        
        {/* Lens Overlay - Intensive Spatial Intelligence (25 Items) */}
        {isLensMode && (
          <div className="absolute inset-0 z-[2000] bg-indigo-950/20 backdrop-blur-[3px] pointer-events-none overflow-hidden">
            <div className="absolute inset-0 border-[40px] border-indigo-500/5 animate-lens-pulse pointer-events-none"></div>
            <div className="absolute left-0 w-full h-px bg-indigo-400/40 animate-scanline shadow-[0_0_20px_rgba(99,102,241,0.6)]"></div>
            
            <div className="absolute top-10 left-10 h-[calc(100%-80px)] pointer-events-auto">
              <div className="bg-[#080808]/90 backdrop-blur-2xl border border-white/10 p-8 rounded-[3rem] w-[460px] h-full flex flex-col space-y-6 animate-in slide-in-from-left-6 duration-700 shadow-3xl border-t-white/20">
                <div className="flex items-center justify-between shrink-0">
                  <div className="space-y-1">
                    <span className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.4em]">Sector Lens // Intel</span>
                    <p className="text-[9px] text-white/30 font-black uppercase tracking-widest">Scraping @RollingSirrr Visual Feed</p>
                  </div>
                  <button onClick={() => setIsLensMode(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white/40 transition-all hover:rotate-90">✕</button>
                </div>

                <div className="flex gap-1 bg-white/5 p-1 rounded-xl shrink-0">
                  <button onClick={() => setLensTab('observations')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${lensTab === 'observations' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>Observations</button>
                  <button onClick={() => setLensTab('synthesis')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${lensTab === 'synthesis' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>Master Synthesis</button>
                </div>
                
                {isLensAnalyzing ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                    <div className="relative w-24 h-24">
                       <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full animate-ping"></div>
                       <div className="absolute inset-2 border-2 border-indigo-500/40 rounded-full animate-pulse"></div>
                       <div className="absolute inset-0 flex items-center justify-center text-4xl animate-bounce">📡</div>
                    </div>
                    <div className="space-y-3 w-full px-12">
                      <div className="h-2 bg-indigo-500/20 rounded-full w-full overflow-hidden">
                        <div className="h-full bg-indigo-500 animate-[loading_2s_ease-in-out_infinite]"></div>
                      </div>
                      <p className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.3em] text-center">Processing 25-Point Urban Scrape...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {lensTab === 'observations' ? (
                      <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-4">
                        {lensAnalysis?.observations?.map((obs, i) => (
                          <div key={i} className={`p-5 rounded-[1.5rem] bg-white/2 border border-white/5 space-y-2 group transition-all hover:bg-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500`} style={{ animationDelay: `${i * 30}ms` }}>
                            <div className="flex justify-between items-center">
                              <span className={`text-[7px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                                obs.type === 'bottleneck' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                                obs.type === 'flow' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                                obs.type === 'friction' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                              }`}>{i + 1}. {obs.type}</span>
                              <span className="text-[9px] text-white/10 font-black">NODE_{obs.id}</span>
                            </div>
                            <h5 className="text-[12px] font-black text-white uppercase group-hover:text-indigo-400 transition-colors">{obs.detail}</h5>
                            <p className="text-[10px] text-slate-400 leading-relaxed italic border-l-2 border-indigo-500/20 pl-3">"{obs.causalBottleneck}"</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-center animate-in zoom-in-95 duration-500">
                        <div className="p-10 bg-indigo-600/5 border border-indigo-500/20 rounded-[3rem] space-y-8 shadow-2xl relative overflow-hidden">
                           <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-600/10 blur-[80px] rounded-full"></div>
                           <div className="space-y-4 relative z-10">
                             <div className="flex items-center gap-4">
                               <span className="text-4xl">📐</span>
                               <p className="text-[12px] font-black text-indigo-400 uppercase tracking-[0.3em]">Master Spatial Strategy</p>
                             </div>
                             <p className="text-[15px] font-bold text-slate-100 leading-relaxed bg-black/40 p-6 rounded-2xl border border-white/5">
                               "{lensAnalysis?.recommendation}"
                             </p>
                           </div>

                           <div className="pt-8 border-t border-white/5 space-y-4 relative z-10">
                             <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Visual Evidence Node</p>
                             <div className="p-6 bg-white/5 rounded-2xl border border-white/5 flex flex-col gap-4">
                               <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 bg-rose-600 rounded-full flex items-center justify-center text-xl shadow-lg shadow-rose-600/20">🎥</div>
                                 <div className="flex-1">
                                    <p className="text-[11px] font-black text-white uppercase truncate">Sector Visual Log: @RollingSirrr</p>
                                    <p className="text-[9px] text-rose-500 font-black uppercase tracking-widest mt-1">Live Feed Analysis</p>
                                 </div>
                               </div>
                               <a href={lensAnalysis?.videoSource} target="_blank" className="w-full py-4 bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white text-[10px] font-black uppercase rounded-xl border border-rose-500/20 transition-all text-center flex items-center justify-center gap-2">
                                 View Source Video ↗
                               </a>
                             </div>
                           </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Hub Registration & Management Modal */}
        {isRegistering && (
          <div className="absolute inset-0 z-[3000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl w-full bg-[#080808] border border-white/10 rounded-[3.5rem] p-12 space-y-10 shadow-[0_50px_150px_rgba(0,0,0,1)] border-t-white/20 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                    {isEditing ? 'Modify Node Data' : 'Establish Node Signal'}
                  </h2>
                  <p className="text-[11px] text-white/30 font-black uppercase tracking-[0.3em] mt-1">
                    {isEditing ? 'Updating live manifest for the spatial grid' : 'Onboarding legend to the Street Intelligence Network'}
                  </p>
                </div>
                <button onClick={() => { setIsRegistering(false); setIsEditing(false); }} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/40 transition-all hover:rotate-90">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div className="grid grid-cols-4 gap-6">
                    <div className="col-span-1 space-y-2">
                      <label className="text-[9px] font-black uppercase text-white/20 tracking-widest px-1">Symbol</label>
                      <input value={regForm.emoji} onChange={e => setRegForm({...regForm, emoji: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-5 text-center text-2xl shadow-inner focus:border-indigo-500 transition-all outline-none" />
                    </div>
                    <div className="col-span-3 space-y-2">
                      <label className="text-[9px] font-black uppercase text-white/20 tracking-widest px-1">Hub Alias</label>
                      <input placeholder="E.g. Murali's Snacks" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-[15px] outline-none focus:border-indigo-500 shadow-inner transition-all font-bold text-white placeholder:text-white/5" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-white/20 tracking-widest px-1">Cuisine Specialty</label>
                    <input placeholder="E.g. Authentic Rose Milk" value={regForm.cuisine} onChange={e => setRegForm({...regForm, cuisine: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-[12px] shadow-inner focus:border-indigo-500 outline-none transition-all text-white placeholder:text-white/5" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black uppercase text-white/20 tracking-widest">Broadcast Bio</label>
                      <button onClick={generateBio} disabled={isGeneratingBio} className="text-[9px] font-black uppercase text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-2">
                        {isGeneratingBio ? <span className="animate-pulse">Mining Bio...</span> : <>✨ Gemini Bio</>}
                      </button>
                    </div>
                    <textarea rows={4} value={regForm.description} onChange={e => setRegForm({...regForm, description: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 text-[12px] resize-none shadow-inner focus:border-indigo-500 outline-none transition-all leading-relaxed text-white placeholder:text-white/5" placeholder="Narrate your legend..." />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-white/20 px-1">Activation Hour</label>
                      <input type="number" value={regForm.startHour} onChange={e => setRegForm({...regForm, startHour: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-[12px] shadow-inner focus:border-indigo-500 outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-white/20 px-1">Deactivation Hour</label>
                      <input type="number" value={regForm.endHour} onChange={e => setRegForm({...regForm, endHour: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-[12px] shadow-inner focus:border-indigo-500 outline-none" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col h-full space-y-8">
                  <div className="space-y-4 flex-1">
                    <label className="text-[9px] font-black uppercase text-white/20 tracking-widest px-1">Inventory Manifest (Menu)</label>
                    <div className="bg-white/2 border border-white/10 rounded-[2.5rem] p-6 min-h-[250px] flex flex-col gap-3 shadow-inner custom-scrollbar overflow-y-auto max-h-[350px]">
                      {regForm.menu.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5 animate-in slide-in-from-right-2 duration-300 group">
                          <span className="text-[12px] font-black text-white uppercase tracking-tight">
                            {item.name} <span className="text-emerald-400 ml-2">₹{item.price}</span>
                          </span>
                          <button onClick={() => removeMenuItem(idx)} className="text-white/5 group-hover:text-rose-500 transition-colors p-1">✕</button>
                        </div>
                      ))}
                      {regForm.menu.length === 0 && <div className="h-full flex flex-col items-center justify-center py-10 opacity-10"><span className="text-4xl mb-2">📋</span><p className="text-[10px] font-black uppercase">Inventory Empty</p></div>}
                    </div>
                  </div>

                  <div className="space-y-4 bg-white/5 p-6 rounded-[2.5rem] border border-white/5 shadow-2xl">
                    <div className="grid grid-cols-3 gap-3">
                      <input placeholder="Item" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="col-span-2 bg-black/60 border border-white/10 rounded-xl px-4 py-4 text-[12px] text-white outline-none focus:border-emerald-500/50" />
                      <input placeholder="Price" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="bg-black/60 border border-white/10 rounded-xl px-4 py-4 text-[12px] text-white outline-none focus:border-emerald-500/50" />
                    </div>
                    <button onClick={addMenuItem} className="w-full py-4 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white text-[10px] font-black uppercase rounded-xl border border-emerald-500/20 transition-all active:scale-[0.98]">+ Add to Manifest</button>
                  </div>
                </div>
              </div>

              <div className="pt-10 flex gap-6 border-t border-white/5">
                <button onClick={() => { setIsRegistering(false); setIsEditing(false); }} className="flex-1 py-6 text-[12px] font-black uppercase text-white/20 hover:text-white/40 bg-white/2 rounded-2xl transition-all">Cancel Onboarding</button>
                <button onClick={handleSaveHub} className="flex-1 py-6 text-[12px] font-black uppercase text-white bg-indigo-600 rounded-2xl shadow-2xl shadow-indigo-600/40 transition-all active:scale-[0.97] hover:bg-indigo-500">
                  {isEditing ? 'UPDATE SPATIAL NODE' : 'ACTIVATE PARTNER NODE'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Shop Detail Overlay */}
        {activeShop && (
          <div className={`absolute bottom-10 left-10 right-10 z-[1000] animate-in slide-in-from-bottom-10 duration-700 transition-all ${isLensMode ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
            <div className="max-w-4xl mx-auto bg-black/95 backdrop-blur-3xl p-10 rounded-[4rem] border border-white/10 shadow-[0_25px_100px_rgba(0,0,0,0.8)] flex flex-col gap-10 max-h-[85vh] overflow-y-auto custom-scrollbar relative border-t-white/20">
              <button onClick={() => setActiveShop(null)} className="absolute top-10 right-10 w-14 h-14 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white/40 transition-colors shadow-xl">✕</button>
              <div className="flex gap-12">
                <div className="text-9xl bg-white/5 p-10 rounded-[3rem] border border-white/5 h-fit shadow-2xl group transition-all duration-700">
                   <div className="group-hover:scale-110 transition-transform cursor-default">{activeShop.emoji}</div>
                </div>
                <div className="flex-1 space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <h3 className="text-5xl font-black text-white uppercase tracking-tight leading-none">{activeShop.name}</h3>
                      <p className="text-[14px] font-black text-indigo-400 uppercase tracking-[0.5em] mt-4">{activeShop.cuisine}</p>
                    </div>
                    <VoiceWave isActive={isVoiceActive} isSpeaking={isSpeaking} />
                  </div>
                  <div className="bg-white/2 border border-white/5 p-8 rounded-[2.5rem] italic relative overflow-hidden shadow-inner">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
                    <p className="text-xl text-slate-300 leading-relaxed font-medium">"{activeShop.description}"</p>
                  </div>
                  
                  <div className="pt-8 flex gap-8">
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeShop.coords.lat},${activeShop.coords.lng}`} target="_blank" className="px-16 py-7 bg-white text-black text-[14px] font-black uppercase rounded-[2.25rem] shadow-2xl transition-all active:scale-[0.95] hover:shadow-white/40 flex items-center gap-4">
                       🛰️ Initiate Navigation
                    </a>
                    <button onClick={startLensAnalysis} className="px-12 py-7 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white text-[12px] font-black uppercase rounded-[2.25rem] border border-indigo-500/20 flex items-center gap-5 transition-all shadow-xl group overflow-hidden relative">
                      <div className="absolute inset-0 bg-indigo-400/10 scale-0 group-hover:scale-100 transition-transform duration-700 rounded-full"></div>
                      <span className="relative z-10">🔍 Intensive Spatial Scrape</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* GeoMind Multimodal Voice Chatbot */}
        <div className={`fixed bottom-10 right-10 z-[4000] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isChatOpen ? 'w-[480px] h-[720px]' : 'w-24 h-24'}`}>
          {!isChatOpen ? (
            <button onClick={() => setIsChatOpen(true)} className="w-full h-full bg-indigo-600 rounded-[3rem] flex items-center justify-center text-white text-4xl shadow-[0_25px_60px_rgba(79,70,229,0.5)] hover:scale-110 active:scale-90 transition-all hover:shadow-[0_30px_80px_rgba(79,70,229,0.8)] group relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
               <span className="group-hover:rotate-12 transition-transform relative z-10">💬</span>
            </button>
          ) : (
            <div className="w-full h-full bg-[#080808]/98 backdrop-blur-3xl border border-white/10 rounded-[4rem] flex flex-col overflow-hidden shadow-[0_60px_180px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-500 border-t-white/20">
              <div className="p-12 bg-white/5 border-b border-white/5 flex justify-between items-center">
                <div className="flex flex-col">
                  <h3 className="text-[14px] font-black text-white tracking-[0.6em] uppercase leading-none">GeoMind Voice</h3>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-3 opacity-60">Spatial Reasoning Engine v2.5</p>
                </div>
                <div className="flex items-center gap-5">
                  <div className="bg-black/50 p-2 rounded-2xl flex border border-white/10 shadow-inner">
                    <button onClick={() => setChatLang('en-US')} className={`px-5 py-2 text-[10px] font-black rounded-xl transition-all ${chatLang === 'en-US' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>EN</button>
                    <button onClick={() => setChatLang('ta-IN')} className={`px-5 py-2 text-[10px] font-black rounded-xl transition-all ${chatLang === 'ta-IN' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>TA</button>
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/40 transition-all hover:scale-110">✕</button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar">
                {chatHistory.map(m => (
                  <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                    <div className={`max-w-[92%] p-8 rounded-[2.5rem] text-[15px] font-bold leading-relaxed shadow-2xl ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white/5 text-slate-200 border border-white/10 rounded-bl-none'}`}>
                      {m.isThinking ? (
                        <div className="flex gap-2.5 py-1.5">
                          <div className="w-3 h-3 bg-white/30 rounded-full animate-bounce"></div>
                          <div className="w-3 h-3 bg-white/30 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-3 h-3 bg-white/30 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p>{m.text}</p>
                          {m.sources && m.sources.length > 0 && (
                            <div className="pt-4 border-t border-white/5 mt-4 flex flex-wrap gap-2">
                              {m.sources.map((s, idx) => (
                                <a key={idx} href={s.uri} target="_blank" className="text-[9px] font-black bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all max-w-[140px] truncate">
                                  🔗 {s.title}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="h-36 flex items-center justify-center p-4 border-t border-white/5 bg-white/2 text-center relative overflow-hidden">
                <VoiceWave isActive={isVoiceActive || isListening} isSpeaking={isSpeaking} />
                {isListening && <p className="absolute bottom-6 text-[11px] font-black uppercase text-rose-500 animate-pulse tracking-[0.5em]">Transmitting Spatial Feed...</p>}
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault(); if (!chatInput.trim()) return;
                const i = chatInput; setChatInput(''); 
                setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'user', text: i }, { id: (Date.now()+1).toString(), role: 'model', text: '', isThinking: true }]);
                setIsVoiceActive(true);
                const res = await spatialChatAgent(i, location);
                setChatHistory(prev => prev.map(m => m.isThinking ? { ...m, text: res.text, sources: res.sources, isThinking: false } : m));
                setIsVoiceActive(false);
              }} className="p-10 bg-black/50 border-t border-white/5 flex gap-5">
                <button type="button" onClick={() => {
                  const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                  if (R) {
                    const r = new R();
                    r.lang = chatLang;
                    r.onstart = () => setIsListening(true);
                    r.onend = () => setIsListening(false);
                    r.onresult = (e: any) => setChatInput(e.results[0][0].transcript);
                    r.start();
                  }
                }} className={`p-6 rounded-3xl transition-all shadow-2xl active:scale-90 border ${isListening ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/40' : 'bg-white/5 text-white/40 border-white/5 hover:text-white/60'}`}>
                  {isListening ? '🔴' : '🎤'}
                </button>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Inquire about spatial grid..." className="flex-1 bg-white/5 border border-white/10 rounded-3xl px-8 py-6 text-[15px] text-white outline-none focus:border-indigo-500 transition-all placeholder:text-white/10 shadow-inner" />
                <button type="submit" className="px-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-black text-[14px] uppercase shadow-2xl shadow-indigo-600/40 active:scale-[0.95] transition-all">Send</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}