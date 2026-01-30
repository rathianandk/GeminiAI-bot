import React, { useState, useEffect, useRef } from 'react';
import FoodMap from './components/Map';
import { 
  discoveryAgent, 
  spatialAlertAgent, 
  getTamilTextSummary, 
  getTamilAudioSummary, 
  generateVendorBio, 
  spatialChatAgent, 
  spatialChatAgent as chatAgent, 
  spatialLensAnalysis, 
  generateSpatialAnalytics,
  getFlavorGenealogy,
  parseOrderAgent
} from './services/geminiService';
import { 
  Shop, 
  LatLng, 
  AgentLog, 
  VendorStatus, 
  VendorProfile, 
  MenuItem, 
  ChatMessage, 
  GroundingSource, 
  LensObservation, 
  LensAnalysis, 
  SpatialAnalytics,
  FlavorGenealogy
} from './types';

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

// --- Global Audio Helpers ---
let persistentAudioCtx: AudioContext | null = null;
let activeVoiceSource: AudioBufferSourceNode | null = null;

const getAudioCtx = () => {
  if (!persistentAudioCtx) {
    persistentAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return persistentAudioCtx;
};

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

const parseDMS = (dmsString: string): LatLng | null => {
  try {
    const regex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)["]?\s*([NSEW])/gi;
    const matches = [...dmsString.matchAll(regex)];
    if (matches.length !== 2) return null;
    const results = matches.map(match => {
      const degrees = parseFloat(match[1]);
      const minutes = parseFloat(match[2]);
      const seconds = parseFloat(match[3]);
      const direction = match[4].toUpperCase();
      let decimal = degrees + minutes / 60 + seconds / 3600;
      if (direction === 'S' || direction === 'W') decimal = decimal * -1;
      return decimal;
    });
    return { lat: results[0], lng: results[1] };
  } catch (e) {
    console.error("DMS Parsing Error:", e);
    return null;
  }
};

const VoiceWave = ({ isActive, isSpeaking, onStop }: { isActive: boolean; isSpeaking: boolean; onStop?: () => void }) => {
  if (!isActive) return null;
  const palette = isSpeaking 
    ? ["from-rose-500 via-amber-400 to-emerald-400", "from-emerald-400 via-cyan-400 to-pink-500", "from-yellow-300 via-white to-orange-400"]
    : ["from-indigo-600 via-purple-600 to-blue-400", "from-purple-500 via-blue-600 to-indigo-400", "from-blue-400 via-white to-purple-400"];
  const glow = isSpeaking ? "bg-emerald-500/20" : "bg-indigo-500/20";
  return (
    <div className="relative flex items-center justify-center w-12 h-12 overflow-visible animate-in fade-in zoom-in-95 duration-1000">
      <div className={`absolute inset-[-4px] ${glow} rounded-full blur-2xl animate-pulse transition-colors duration-700`}></div>
      <div className={`absolute inset-0 bg-gradient-to-tr ${palette[0]} opacity-90 blur-lg animate-siri-liquid mix-blend-screen transition-all duration-700`}></div>
      <div className={`absolute inset-1 bg-gradient-to-bl ${palette[1]} opacity-90 blur-md animate-siri-liquid-alt mix-blend-screen transition-all duration-700`}></div>
      {onStop && isSpeaking ? (
        <button onClick={(e) => { e.stopPropagation(); onStop(); }} className="relative z-10 w-7 h-7 bg-black/60 hover:bg-black rounded-full flex items-center justify-center text-white/80 transition-all border border-white/20 hover:scale-110 active:scale-90" title="Stop Audio">
          <span className="text-[9px]">■</span>
        </button>
      ) : (
        <div className="relative w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,1)] border border-white/40 animate-pulse"></div>
      )}
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
    <span className="text-[7px] font-black uppercase tracking-widest animate-pulse">Establishing Link...</span>
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
  const [userMode, setUserMode] = useState<'explorer' | 'vendor' | 'history'>('explorer');
  const [explorerTab, setExplorerTab] = useState<'logs' | 'discovery' | 'live_vendors' | 'lens' | 'analytics'>('discovery');
  const [discoverySubTab, setDiscoverySubTab] = useState<'nodes' | 'intelligence'>('nodes');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatLang, setChatLang] = useState<'en-US' | 'ta-IN'>('en-US');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([{ id: '1', role: 'model', text: 'Vanakkam! Ask me anything about street food or landmarks.' }]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [analytics, setAnalytics] = useState<SpatialAnalytics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [isLensAnalyzing, setIsLensAnalyzing] = useState(false);
  const [lensAnalysis, setLensAnalysis] = useState<LensAnalysis | null>(null);
  const [lensTab, setLensTab] = useState<'observations' | 'extractedFrames' | 'synthesis'>('extractedFrames');

  const [flavorHistory, setFlavorHistory] = useState<FlavorGenealogy | null>(null);
  const [isHistoryMining, setIsHistoryMining] = useState(false);

  // --- Ordering Flow States ---
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderStep, setOrderStep] = useState<'menu' | 'verifying' | 'placed'>('menu');
  const [orderInput, setOrderInput] = useState('');
  const [parsedOrder, setParsedOrder] = useState<{ orderItems: any[], totalPrice: number } | null>(null);
  const [isParsingOrder, setIsParsingOrder] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});

  const [myProfiles, setMyProfiles] = useState<VendorProfile[]>(() => {
    const saved = localStorage.getItem('geomind_profiles');
    return saved ? JSON.parse(saved) : SEED_PROFILES;
  });
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  
  const activeProfile = myProfiles.find(p => p.id === activeProfileId);

  const [isRegistering, setIsRegistering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [isUpdatingGPS, setIsUpdatingGPS] = useState(false);
  const [regForm, setRegForm] = useState({ 
    name: '', 
    cuisine: '', 
    emoji: '🥘', 
    description: '', 
    startHour: 9, 
    endHour: 22, 
    menu: [] as MenuItem[],
    youtubeLink: '',
    manualDMS: ''
  });
  const [newItem, setNewItem] = useState({ name: '', price: '' });

  useEffect(() => {
    localStorage.setItem('geomind_profiles', JSON.stringify(myProfiles));
    setShops(prev => {
      const baseShops = prev.filter(s => !s.id.startsWith('sync-') && !s.isVendor);
      const syncShops = prev.filter(s => s.id.startsWith('sync-'));
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
          hours: p.hours,
          youtubeLink: p.youtubeLink
        };
      });
      return [...baseShops, ...syncShops, ...vendorShops];
    });
  }, [myProfiles]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const addLog = (agent: AgentLog['agent'], message: string, status: AgentLog['status'] = 'processing') => {
    setLogs(prev => [{ id: Math.random().toString(), agent, message, status }, ...prev.slice(0, 50)]);
  };

  const stopAudio = () => {
    if (activeVoiceSource) {
      try { activeVoiceSource.stop(); } catch (e) { console.warn("Audio stop error:", e); }
      activeVoiceSource = null;
    }
    setIsSpeaking(false);
    setIsVoiceActive(false);
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
      source.onended = () => { 
        if (activeVoiceSource === source) {
           setIsSpeaking(false); 
           setIsVoiceActive(false); 
           activeVoiceSource = null; 
        }
      };
      activeVoiceSource = source;
      setIsSpeaking(true);
      source.start();
    } catch (err) { setIsSpeaking(false); setIsVoiceActive(false); }
  };

  const handleToggleSignal = async () => {
    const profile = myProfiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    const liveId = `live-${profile.id}`;
    const isNowOnline = !shops.some(s => s.id === liveId && s.status === VendorStatus.ONLINE);
    if (isNowOnline) {
      const alert = await spatialAlertAgent(profile.name, location);
      const liveShop: Shop = { 
        id: liveId, 
        name: profile.name, 
        coords: location, 
        isVendor: true, 
        status: VendorStatus.ONLINE, 
        emoji: profile.emoji, 
        cuisine: profile.cuisine, 
        description: alert.tamilSummary, 
        hours: profile.hours, 
        menu: profile.menu,
        youtubeLink: profile.youtubeLink
      };
      setShops(prev => [liveShop, ...prev.filter(s => s.id !== liveShop.id && s.id !== profile.id)]);
      addLog('Spatial', `Signal activated for ${profile.name}. Vendor is now live on grid.`, 'resolved');
    } else {
      setShops(prev => prev.filter(s => s.id !== liveId));
      addLog('Spatial', `Signal deactivated for ${profile.name}. Node is now offline.`, 'failed');
    }
  };

  const handleShopSelect = async (shop: Shop) => {
    setActiveShop(shop);
    setLocation(shop.coords);
    setIsVoiceActive(true);
    getTamilAudioSummary(shop).then(data => data ? playVoice(data) : setIsVoiceActive(false));
    getTamilTextSummary(shop).then(summary => addLog('Linguistic', `Spatial Insight: ${summary.tamil}\n\n${summary.english}`, 'resolved'));
    startLensAnalysisInternal(shop);
  };

  const startLensAnalysisInternal = async (shop: Shop) => {
    setIsLensAnalyzing(true);
    setExplorerTab('lens');
    setLensAnalysis(null);
    setLensTab('extractedFrames');
    addLog('Lens', `Performing intensive visual scrape from @RollingSirrr for ${shop.name}...`, 'processing');
    try {
      const analysis = await spatialLensAnalysis(shop.coords, shop.name);
      setLensAnalysis(analysis);
      addLog('Lens', `Visual frames analysis complete. Urban integration nodes identified.`, 'resolved');
    } catch (err) {
      addLog('Lens', `Visual node interference detected. Scraping failed.`, 'failed');
    } finally {
      setIsLensAnalyzing(false);
    }
  };

  const fetchFlavorHistory = async () => {
    setIsHistoryMining(true);
    setUserMode('history');
    addLog('Historian', 'Scanning 1.2M historical tokens for culinary migration patterns...', 'processing');
    try {
      const result = await getFlavorGenealogy(location);
      setFlavorHistory(result);
      addLog('Historian', `Cross-temporal synthesis complete for ${result.neighborhood}.`, 'resolved');
    } catch (err) {
      addLog('Historian', 'Anomaly detected in historical records. Registry inaccessible.', 'failed');
    } finally {
      setIsHistoryMining(false);
    }
  };

  const computeAnalytics = async (shopData?: Shop[]) => {
    const targetShops = shopData || shops;
    const discoveredOnly = targetShops.filter(s => s.id.startsWith('sync'));
    if (discoveredOnly.length === 0) {
      addLog('Analytics', 'Insufficient spatial nodes for analytics. Discovery required.', 'failed');
      return;
    }
    setIsAnalyzing(true);
    addLog('Analytics', 'Processing food grid metrics and customer segmentation...', 'processing');
    try {
      const res = await generateSpatialAnalytics(discoveredOnly);
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
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setLocation(newLoc);
          setIsUpdatingGPS(false);
          if (activeProfileId) {
            setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, lastLocation: newLoc } : p));
          }
          addLog('Spatial', `High-precision GPS sync complete at ${newLoc.lat.toFixed(6)}, ${newLoc.lng.toFixed(6)}.`, 'resolved');
        },
        (error) => {
          console.error("GPS Sync Error:", error);
          setIsUpdatingGPS(false);
          addLog('Spatial', `GPS sync failed: ${error.message}`, 'failed');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsUpdatingGPS(false);
      addLog('Spatial', `Geolocation API not available in this environment.`, 'failed');
    }
  };

  const handleApplyDMS = () => {
    const coords = parseDMS(regForm.manualDMS);
    if (coords) {
      setLocation(coords);
      addLog('Spatial', `Manual coordinates applied: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}.`, 'resolved');
    } else {
      addLog('Spatial', `Invalid DMS format. Use 13°05'41.5"N 80°10'30.2"E`, 'failed');
    }
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
      menu: [...(profile.menu || [])],
      youtubeLink: profile.youtubeLink || '',
      manualDMS: ''
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
        menu: regForm.menu,
        youtubeLink: regForm.youtubeLink
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
        menu: regForm.menu,
        youtubeLink: regForm.youtubeLink
      };
      setMyProfiles(prev => [...prev, newProfile]);
      addLog('Spatial', `Initial signal for "${regForm.name}" established.`, 'resolved');
      targetId = newId;
    }
    setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] as MenuItem[], youtubeLink: '', manualDMS: '' });
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
    setRegForm(prev => ({ ...prev, menu: prev.menu.filter((_, i) => i !== index) }));
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
    setExplorerTab('discovery');
    setDiscoverySubTab('nodes');
    addLog('Discovery', 'Initiating wide-band 25-point spatial scrape...', 'processing');
    try {
      const result = await discoveryAgent("Legendary street food and hidden gems", location);
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
          computeAnalytics(updatedShops);
        }
      }, 400);
    } catch (err) {
      addLog('Discovery', 'Discovery node timeout. Atmospheric interference suspected.', 'failed');
      setIsMining(false);
    }
  };

  // --- Order Handling Logic ---
  const initiateOrder = () => {
    if (!activeShop?.menu || activeShop.menu.length === 0) {
      alert("This partner node has no menu registered in the grid.");
      return;
    }
    setOrderStep('menu');
    setOrderInput('');
    setParsedOrder(null);
    setCart({}); // Reset cart
    setIsOrdering(true);
  };

  const updateCart = (itemName: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemName] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemName]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemName]: next };
    });
  };

  const processOrderInput = async (input?: string) => {
    const textToParse = input || orderInput;
    if (!textToParse.trim() || !activeShop?.menu) return;
    setIsParsingOrder(true);
    addLog('Linguistic', `Processing signal: "${textToParse}"`, 'processing');
    try {
      const res = await parseOrderAgent(textToParse, activeShop.menu);
      setCart(prev => {
        const next = { ...prev };
        res.orderItems.forEach((item: any) => {
          next[item.name] = (next[item.name] || 0) + item.quantity;
        });
        return next;
      });
      addLog('Linguistic', `Manifest updated from voice grid. Added ${res.orderItems.length} entities.`, 'resolved');
      setOrderInput(''); 
    } catch (e) {
      addLog('Linguistic', `Signal decoding failed. Re-state requirements.`, 'failed');
    } finally {
      setIsParsingOrder(false);
    }
  };

  const proceedToVerify = () => {
    if (Object.keys(cart).length === 0) {
      alert("Cart is empty. Select items or state your order.");
      return;
    }
    const orderItems = Object.entries(cart).map(([name, quantity]) => {
      const menuItem = activeShop?.menu?.find(m => m.name === name);
      return { name, quantity, price: menuItem?.price || 0 };
    });
    const totalPrice = orderItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
    setParsedOrder({ orderItems, totalPrice });
    setOrderStep('verifying');
  };

  const confirmFinalOrder = () => {
    setOrderStep('placed');
    addLog('Spatial', `Order transmitted successfully to ${activeShop?.name}. Signal locked.`, 'resolved');
    setTimeout(() => {
      setIsOrdering(false);
      setParsedOrder(null);
      setOrderInput('');
      setCart({});
      setActiveShop(null); // Return to grid
    }, 4000);
  };

  // --- Chat Logic ---
  const handleChatSubmit = async (text: string) => {
    if (!text.trim()) return;
    const i = text;
    setChatInput(''); 
    setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'user', text: i }, { id: (Date.now()+1).toString(), role: 'model', text: '', isThinking: true }]);
    const res = await chatAgent(i, location);
    setChatHistory(prev => prev.map(m => m.isThinking ? { ...m, text: res.text, sources: res.sources, isThinking: false } : m));
  };

  const handleChatVoice = () => {
    const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!R) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const r = new R();
    r.lang = chatLang;
    r.onstart = () => setIsListening(true);
    r.onend = () => setIsListening(false);
    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      handleChatSubmit(transcript);
    };
    r.start();
  };

  const discoveredShops = shops.filter(s => s.id.startsWith('sync-'));
  const liveVendors = shops.filter(s => s.isVendor && s.status === VendorStatus.ONLINE);
  const isCurrentlyLive = activeProfileId && shops.some(s => s.id === `live-${activeProfileId}` && s.status === VendorStatus.ONLINE);
  const cartTotalItems = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-screen w-screen bg-[#020202] text-slate-300 font-mono overflow-hidden selection:bg-indigo-500/30">
      <style>{`
        @keyframes siri-liquid { 0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(0deg) scale(1); } 33% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(120deg) scale(1.1); } 66% { border-radius: 100% 60% 60% 100% / 100% 100% 60% 60%; transform: rotate(240deg) scale(0.9); } 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(360deg) scale(1); } }
        @keyframes siri-liquid-alt { 0% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(360deg) scale(1.1); } 50% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; transform: rotate(180deg) scale(0.9); } 100% { border-radius: 30% 70% 70% 30% / 50% 60% 30% 60%; transform: rotate(0deg) scale(1.1); } }
        @keyframes siri-liquid-fast { 0% { border-radius: 50%; transform: scale(1) rotate(0deg); } 50% { border-radius: 40% 60% 40% 60%; transform: scale(1.2) rotate(180deg); } 100% { border-radius: 50%; transform: scale(1) rotate(360deg); } }
        @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes neon-pulse { 0% { box-shadow: 0 0 5px rgba(99, 102, 241, 0.2), 0 0 10px rgba(99, 102, 241, 0.1); } 50% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.4), 0 0 40px rgba(99, 102, 241, 0.2); } 100% { box-shadow: 0 0 5px rgba(99, 102, 241, 0.2), 0 0 10px rgba(99, 102, 241, 0.1); } }
        @keyframes lineFlow { 0% { height: 0; } 100% { height: 100%; } }
        @keyframes scan { 0% { top: -10%; opacity: 0; } 50% { opacity: 1; } 100% { top: 110%; opacity: 0; } }
        .animate-siri-liquid { animation: siri-liquid 8s linear infinite; }
        .animate-siri-liquid-alt { animation: siri-liquid-alt 12s ease-in-out infinite; }
        .animate-siri-liquid-fast { animation: siri-liquid-fast 4s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        .animate-grow { animation: grow 0.8s ease-out forwards; transform-origin: bottom; }
        .animate-neon-pulse:hover { animation: neon-pulse 1.5s infinite; }
        .animate-scan { animation: scan 2s linear infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>

      <div className="w-[450px] border-r border-white/5 bg-[#080808] flex flex-col z-20 shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5 shrink-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-sm font-black tracking-[0.4em] text-white">GEOMIND AI</h1>
            <div className="flex gap-2">
              <button onClick={() => setUserMode('explorer')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'explorer' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 text-white/40'}`}>Explorer</button>
              <button onClick={() => setUserMode('vendor')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'vendor' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-white/5 text-white/40'}`}>Partner Hub</button>
              <button onClick={fetchFlavorHistory} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'history' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>Flavor Genealogy</button>
            </div>
          </div>
          
          {(userMode === 'explorer' || userMode === 'history') ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={startDiscovery} disabled={isMining} className="py-4 bg-indigo-600 text-white text-[9px] font-black uppercase rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20">
                  {isMining ? <SetupAnimation /> : 'Run Food Scrape'}
                </button>
                <button onClick={() => setExplorerTab('live_vendors')} className={`py-4 bg-emerald-600/20 text-emerald-500 border border-emerald-500/20 text-[9px] font-black uppercase rounded-xl transition-all active:scale-[0.98] ${explorerTab === 'live_vendors' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/20' : ''}`}>
                   Live Partners ({liveVendors.length})
                </button>
              </div>
              <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                <button onClick={() => { setUserMode('explorer'); setExplorerTab('logs'); }} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${userMode === 'explorer' && explorerTab === 'logs' ? 'bg-white/10 text-white shadow-inner' : 'text-white/20 hover:text-white/40'}`}>Intel</button>
                <button onClick={() => { setUserMode('explorer'); setExplorerTab('discovery'); }} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${userMode === 'explorer' && explorerTab === 'discovery' ? 'bg-white/10 text-white shadow-inner' : 'text-white/20 hover:text-white/40'}`}>Legends</button>
                <button onClick={() => { setUserMode('explorer'); setExplorerTab('lens'); }} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${userMode === 'explorer' && explorerTab === 'lens' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>Lens</button>
                <button onClick={() => { setUserMode('explorer'); setExplorerTab('live_vendors'); }} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${userMode === 'explorer' && explorerTab === 'live_vendors' ? 'bg-white/10 text-white shadow-inner' : 'text-white/20 hover:text-white/40'}`}>Partners</button>
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
                    <div className="bg-white/5 p-3 rounded-2xl border border-white/5 col-span-2">
                      <p className="text-[7px] font-black text-white/30 uppercase mb-1">Current Coordinates</p>
                      <p className="text-[10px] font-black text-white uppercase tracking-tighter tabular-nums">
                        {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                      </p>
                    </div>
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
                    <button onClick={handleToggleSignal} className={`py-4 text-[10px] font-black rounded-2xl transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 ${isCurrentlyLive ? 'bg-rose-600 text-white shadow-rose-600/30' : 'bg-emerald-600 text-white shadow-emerald-600/30'}`}>
                      {isCurrentlyLive ? 'DEACTIVATE LIVE SIGNAL' : 'ACTIVATE LIVE SIGNAL'}
                    </button>
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
                  setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] as MenuItem[], youtubeLink: '', manualDMS: '' });
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
          {userMode === 'history' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-10 duration-700">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-black text-amber-400 uppercase tracking-[0.3em] drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]">
                  Cross-Temporal Synthesis
                </span>
                <button onClick={() => setUserMode('explorer')} className="text-[9px] font-black text-white hover:text-amber-400 uppercase transition-colors bg-white/10 px-3 py-1.5 rounded-lg border border-white/5">Back to Grid</button>
              </div>

              {isHistoryMining ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-6">
                  <div className="relative w-32 h-32">
                    <div className="absolute inset-0 bg-amber-500/10 rounded-full animate-ping"></div>
                    <div className="absolute inset-4 bg-amber-500/20 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 flex items-center justify-center text-5xl">🕰️</div>
                  </div>
                  <p className="text-[11px] font-black text-amber-400 uppercase tracking-[0.5em] text-center animate-pulse leading-loose drop-shadow-lg">
                    REASONING OVER 1,000,000 HISTORICAL TOKENS...
                  </p>
                </div>
              ) : flavorHistory ? (
                <div className="space-y-12 pb-20">
                  <div className="p-6 bg-amber-950/40 border border-amber-500/40 rounded-3xl relative overflow-hidden group shadow-2xl">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,1)]"></div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-3 group-hover:text-amber-200 transition-colors drop-shadow-md">{flavorHistory.neighborhood} Evolution</h3>
                    <p className="text-[12px] font-black text-white leading-relaxed italic border-l-2 border-amber-500/40 pl-4 py-1">"{flavorHistory.summary}"</p>
                  </div>

                  <div className="relative pl-10 space-y-12">
                    <div className="absolute left-3 top-2 bottom-2 w-1 bg-gradient-to-b from-amber-400 via-amber-400/40 to-transparent rounded-full"></div>
                    {flavorHistory.timeline.map((era, i) => (
                      <div key={i} className="relative group animate-in slide-in-from-left-4" style={{ animationDelay: `${i * 150}ms` }}>
                        <div className="absolute -left-10 top-1.5 w-7 h-7 bg-amber-950 border-4 border-amber-400 rounded-full z-10 group-hover:scale-125 transition-transform shadow-[0_0_15px_rgba(245,158,11,0.8)]"></div>
                        <div className="space-y-4">
                          <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em] block">{era.period}</span>
                          <div className="flex items-center gap-4">
                            <h4 className="text-[16px] font-black text-white uppercase group-hover:text-amber-300 transition-colors tracking-tight">{era.profile}</h4>
                            <div className="h-px flex-1 bg-white/20 group-hover:bg-amber-400/40 transition-all"></div>
                          </div>
                          <p className="text-[11px] font-black text-slate-100 leading-relaxed drop-shadow-sm bg-white/5 p-4 rounded-2xl border border-white/10">{era.description}</p>
                          <div className="bg-amber-950/20 p-5 rounded-3xl border border-amber-500/20 space-y-5 group-hover:bg-amber-900/10 transition-all shadow-inner">
                            {/* Notable Ingredients Section */}
                            <div className="space-y-3">
                              <p className="text-[9px] font-black text-amber-300 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1 h-1 bg-amber-400 rounded-full"></span>
                                Notable Elements
                              </p>
                              <div className="flex flex-wrap gap-2.5">
                                {era.notableIngredients.map((ing, j) => (
                                  <span key={j} className="text-[9px] px-3 py-1.5 rounded-xl bg-amber-400 text-black font-black uppercase shadow-lg transform hover:scale-105 transition-transform cursor-default">
                                    {ing}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Popular Food Items Section */}
                            <div className="space-y-3">
                              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1 h-1 bg-emerald-400 rounded-full"></span>
                                Iconic Food Items
                              </p>
                              <div className="flex flex-wrap gap-2.5">
                                {era.popularItems.map((item, j) => (
                                  <span key={j} className="text-[9px] px-3 py-1.5 rounded-xl bg-amber-400 text-black font-black uppercase shadow-lg transform hover:scale-105 transition-transform cursor-default">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-white/10">
                              <p className="text-[10px] text-amber-100 font-bold italic leading-relaxed">
                                <span className="text-amber-500/80 uppercase tracking-tighter mr-2 not-italic font-black">Context:</span>
                                {era.historicalContext}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center px-1 mb-2 shrink-0">
                <span className="text-[11px] font-black text-cyan-400 uppercase tracking-[0.3em] drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
                  {explorerTab === 'discovery' ? `Legends Discovery Hub` : 
                   explorerTab === 'logs' ? `Total Intel: ${logs.length}` : 
                   explorerTab === 'live_vendors' ? `Live Signals: ${liveVendors.length}` : 
                   explorerTab === 'lens' ? `Visual Observation Nodes` : ''}
                </span>
              </div>

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
                  <div className="space-y-6">
                    {isMining ? (
                      <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-500">
                        <div className="relative w-32 h-32 flex items-center justify-center">
                          <div className="absolute inset-0 bg-indigo-500/10 rounded-full animate-ping"></div>
                          <div className="absolute inset-2 border border-indigo-500/20 rounded-full animate-pulse"></div>
                          <div className="absolute inset-[-10px] border border-indigo-500/5 rounded-full animate-[spin_8s_linear_infinite]"></div>
                          <div className="absolute inset-x-4 top-0 h-0.5 bg-indigo-400/50 blur-sm animate-scan z-20"></div>
                          <div className="relative text-6xl animate-bounce drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">🛰️</div>
                        </div>
                        <div className="text-center space-y-2">
                          <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.5em] animate-pulse leading-loose">
                            CALIBRATING SPATIAL GRID...
                          </p>
                          <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">
                            EXTRACTING HIGH-SENTIMENT NODES
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Tab Toggle */}
                        <div className="flex bg-[#0a0a0a] p-1.5 rounded-2xl border border-white/5 shadow-inner backdrop-blur-md">
                          <button 
                            onClick={() => setDiscoverySubTab('nodes')} 
                            className={`flex-1 py-3 text-[9px] font-black uppercase rounded-xl transition-all duration-500 relative overflow-hidden ${discoverySubTab === 'nodes' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                          >
                            {discoverySubTab === 'nodes' && (
                              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600 to-indigo-700 shadow-[0_0_20px_rgba(79,70,229,0.3)] animate-in fade-in zoom-in-95 duration-500"></div>
                            )}
                            <span className="relative z-10 tracking-[0.1em]">Identified Nodes</span>
                          </button>
                          <button 
                            onClick={() => setDiscoverySubTab('intelligence')} 
                            className={`flex-1 py-3 text-[9px] font-black uppercase rounded-xl transition-all duration-500 relative overflow-hidden ${discoverySubTab === 'intelligence' ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
                          >
                            {discoverySubTab === 'intelligence' && (
                              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600 to-indigo-700 shadow-[0_0_20px_rgba(79,70,229,0.3)] animate-in fade-in zoom-in-95 duration-500"></div>
                            )}
                            <span className="relative z-10 tracking-[0.1em]">Spatial Intelligence</span>
                          </button>
                        </div>

                        {isAnalyzing ? (
                          <div className="py-12 flex flex-col items-center justify-center gap-4 bg-white/2 rounded-3xl border border-white/5 animate-pulse">
                            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black uppercase text-indigo-500/60 tracking-widest">Synthesizing Visual Grid...</p>
                          </div>
                        ) : discoverySubTab === 'intelligence' ? (
                          analytics ? (
                            <div className="space-y-8 animate-in fade-in duration-700">
                              <div className="p-6 bg-indigo-950/40 border border-indigo-500/40 rounded-3xl space-y-3 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,1)]"></div>
                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Sector Synthesis</p>
                                <p className="text-[11px] font-bold text-slate-100 leading-relaxed group-hover:text-indigo-50 transition-colors">"{analytics.sectorSummary}"</p>
                              </div>

                              {/* Cuisine Distribution */}
                              <div className="space-y-4">
                                <p className="text-[10px] font-black text-indigo-400/80 uppercase tracking-[0.4em] drop-shadow-md">Cuisine Proliferation</p>
                                <div className="space-y-3">
                                  {analytics.cuisineDistribution?.map((c, i) => (
                                    <div key={i} className="space-y-1.5">
                                      <div className="flex justify-between text-[9px] font-black uppercase tracking-tighter">
                                        <span className="text-white">{c.label}</span>
                                        <span className="text-indigo-400">{c.percentage}%</span>
                                      </div>
                                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-grow" style={{ width: `${c.percentage}%` }}></div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Price Spectrum */}
                              <div className="space-y-4">
                                <p className="text-[10px] font-black text-emerald-400/80 uppercase tracking-[0.4em] drop-shadow-md">Energy Cost Spectrum</p>
                                <div className="grid grid-cols-1 gap-3">
                                  {analytics.priceSpectrum?.map((p, i) => (
                                    <div key={i} className="p-4 bg-emerald-600/5 border border-emerald-500/10 rounded-2xl space-y-2 group hover:bg-emerald-600/10 transition-all">
                                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{p.range} Tier</span>
                                      <div className="flex flex-wrap gap-2">
                                        {p.nodes.map((node, j) => (
                                          <span key={j} className="text-[8px] bg-white/5 px-2 py-1 rounded-md text-white/60 border border-white/5">{node}</span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Legendary Index */}
                              <div className="space-y-4">
                                <p className="text-[10px] font-black text-amber-400/80 uppercase tracking-[0.4em] drop-shadow-md">High-Sentiment Legends</p>
                                <div className="space-y-3">
                                  {analytics.legendaryIndex?.map((l, i) => (
                                    <div key={i} className="p-4 bg-amber-600/5 border border-amber-500/10 rounded-2xl flex items-center justify-between group hover:bg-amber-600/10 transition-all">
                                      <div className="space-y-1">
                                        <p className="text-[11px] font-black text-white uppercase tracking-tight">{l.name}</p>
                                        <p className="text-[8px] text-amber-200/40 italic">"{l.reasoning}"</p>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-xl font-black text-amber-400 tabular-nums">{l.score}</span>
                                        <span className="text-[7px] block font-black text-amber-600 uppercase">Power</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Segmentation */}
                              <div className="space-y-4">
                                <p className="text-[10px] font-black text-cyan-400/80 uppercase tracking-[0.4em] drop-shadow-md">Grid Segmentation</p>
                                <div className="grid grid-cols-1 gap-3">
                                  {analytics.customerSegmentation?.map((seg, i) => (
                                    <div key={i} className="p-4 bg-cyan-600/5 border border-cyan-500/10 rounded-2xl space-y-2 group hover:bg-cyan-600/10 transition-all border-l-4 border-l-cyan-500/40 hover:border-l-cyan-400">
                                       <div className="flex justify-between items-center">
                                          <span className="text-[11px] font-black text-white uppercase tracking-tight group-hover:text-cyan-300 transition-colors">{seg.segment}</span>
                                          <span className="text-[11px] font-black text-cyan-400">{seg.volume}%</span>
                                       </div>
                                       <p className="text-[9px] text-slate-400 leading-tight">"{seg.description}"</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="py-20 text-center opacity-40 animate-in fade-in duration-700">
                              <p className="text-4xl mb-4">📍</p>
                              <p className="text-[10px] font-black uppercase tracking-widest">No Spatial Data Scraped Yet.</p>
                              <p className="text-[8px] font-bold mt-2 uppercase text-indigo-400/60 leading-relaxed">Run a Food Scrape to populate<br/>sector intelligence cards.</p>
                            </div>
                          )
                        ) : (
                          <div className="space-y-4 pt-4 animate-in fade-in duration-500">
                            <p className="text-[10px] font-black text-cyan-400/80 uppercase tracking-[0.4em] drop-shadow-lg mb-2">Identified Nodes ({discoveredShops.length})</p>
                            <div className="space-y-4 pb-20">
                              {discoveredShops.length > 0 ? (
                                discoveredShops.map((s, i) => (
                                  <button key={s.id} onClick={() => handleShopSelect(s)} className="w-full p-6 rounded-[2.5rem] bg-indigo-950/10 hover:bg-indigo-600/20 border border-indigo-500/10 text-left transition-all group shadow-inner flex items-center gap-5 animate-in slide-in-from-bottom-2 duration-500 active:scale-[0.96] hover:border-cyan-500/50 relative overflow-hidden backdrop-blur-md animate-neon-pulse" style={{ animationDelay: `${i * 30}ms` }}>
                                    <div className="shrink-0 w-16 h-16 bg-gradient-to-br from-indigo-600/20 to-indigo-900/40 rounded-[1.25rem] flex items-center justify-center text-3xl group-hover:scale-110 group-hover:rotate-12 group-hover:bg-cyan-600/30 transition-all duration-500 border border-indigo-500/30 group-hover:border-cyan-400 shadow-2xl relative z-10 overflow-hidden">
                                      <span className="relative z-20 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{s.emoji}</span>
                                    </div>
                                    <div className="flex-1 min-w-0 z-10 space-y-2">
                                      <p className="text-[15px] font-black text-white uppercase group-hover:text-cyan-300 transition-colors truncate tracking-tighter leading-none">{s.name}</p>
                                      <div className="flex items-center gap-3">
                                        <p className="text-[10px] text-indigo-400/60 group-hover:text-cyan-400/80 font-black uppercase truncate tracking-[0.2em] transition-colors">{s.cuisine}</p>
                                      </div>
                                    </div>
                                  </button>
                                ))
                              ) : (
                                <div className="py-20 text-center opacity-40 animate-in fade-in duration-700">
                                  <p className="text-4xl mb-4">🔍</p>
                                  <p className="text-[10px] font-black uppercase tracking-widest">No nodes identified yet.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : explorerTab === 'lens' ? (
                  <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col">
                    {isLensAnalyzing ? (
                      <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-20">
                        <div className="relative w-24 h-24">
                           <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full animate-ping"></div>
                           <div className="absolute inset-0 flex items-center justify-center text-4xl animate-bounce">📡</div>
                        </div>
                        <p className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.3em] text-center">Processing Visual Scrape...</p>
                      </div>
                    ) : lensAnalysis ? (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex gap-1 bg-white/5 p-1 rounded-xl shrink-0 mb-4">
                          <button onClick={() => setLensTab('extractedFrames')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${lensTab === 'extractedFrames' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>Frames</button>
                          <button onClick={() => setLensTab('observations')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${lensTab === 'observations' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>Observations</button>
                          <button onClick={() => setLensTab('synthesis')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${lensTab === 'synthesis' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>Strategy</button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 pb-10">
                          {lensTab === 'extractedFrames' ? (
                            lensAnalysis.extractedFrames.map((frame, i) => (
                              <div key={i} className="p-4 rounded-3xl bg-white/5 border border-white/5 space-y-3 border-l-4 border-l-indigo-600 shadow-sm animate-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 30}ms` }}>
                                 <div className="flex justify-between items-center">
                                    <span className={`text-[7px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                                      frame.category === 'Landscape' ? 'bg-emerald-500/10 text-emerald-400' :
                                      frame.category === 'Sidewalk' ? 'bg-cyan-500/10 text-cyan-400' :
                                      frame.category === 'Boundary' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                                    }`}>{frame.category} Node</span>
                                    <span className="text-white/20 text-[8px] font-black tabular-nums tracking-widest">F:{frame.timestamp}</span>
                                 </div>
                                 <h5 className="text-[11px] font-black text-white uppercase leading-tight tracking-tight">{frame.description}</h5>
                                 <p className="text-[9px] text-slate-400 italic bg-black/20 p-3 rounded-xl border border-white/5">"Insight: {frame.spatialInsight}"</p>
                              </div>
                            ))
                          ) : lensTab === 'observations' ? (
                            lensAnalysis.observations.map((obs, i) => (
                              <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2 group hover:bg-white/10 transition-all animate-in slide-in-from-bottom-4" style={{ animationDelay: `${i * 30}ms` }}>
                                <span className={`text-[7px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${obs.type === 'bottleneck' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : obs.type === 'flow' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}>{obs.type}</span>
                                <h5 className="text-[11px] font-black text-white uppercase tracking-tight leading-relaxed">{obs.detail}</h5>
                                <p className="text-[9px] text-slate-400 leading-relaxed italic border-l border-indigo-500/30 pl-3">"{obs.causalBottleneck}"</p>
                              </div>
                            ))
                          ) : (
                            <div className="space-y-6 p-2">
                               <div className="p-6 bg-indigo-600/5 border border-indigo-500/20 rounded-3xl space-y-3">
                                 <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Master Planning Strategy</p>
                                 <p className="text-[11px] font-bold text-slate-100 leading-relaxed italic">"{lensAnalysis.recommendation}"</p>
                               </div>
                               <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                                  <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Visual Database</span>
                                  <span className="text-[8px] font-black text-indigo-400">@RollingSirrr</span>
                               </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="py-20 text-center opacity-20">
                        <p className="text-[10px] font-black uppercase tracking-widest">Lens System Idle. Select a grid node.</p>
                      </div>
                    )}
                  </div>
                ) : explorerTab === 'live_vendors' ? (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="space-y-3">
                      {liveVendors.map((v, i) => (
                        <button key={v.id} onClick={() => handleShopSelect(v)} className="w-full p-5 rounded-[2rem] bg-emerald-600/5 border border-emerald-500/20 text-left transition-all hover:bg-emerald-600/10 group animate-in slide-in-from-right-4" style={{ animationDelay: `${i * 50}ms` }}>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{v.emoji}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-black text-white uppercase truncate">{v.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                 <p className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">Live Signal</p>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null
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
            </>
          )}
        </div>
      </div>

      <div className="flex-1 relative bg-[#020202]">
        <FoodMap center={location} shops={shops} onLocationChange={setLocation} onShopClick={handleShopSelect} />
        
        {/* Ordering Overlay - Enhanced Cart & Language Interaction */}
        {isOrdering && activeShop && (
          <div className="absolute inset-0 z-[6000] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-700">
            <div className="max-w-3xl w-full bg-[#0a0a0a] border border-white/10 rounded-[4rem] p-16 space-y-12 shadow-[0_50px_150px_rgba(0,0,0,1)] relative border-t-white/20">
              <button onClick={() => setIsOrdering(false)} className="absolute top-12 right-12 w-14 h-14 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-all text-2xl">✕</button>
              
              <div className="flex flex-col items-center gap-6">
                <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center text-5xl shadow-2xl border border-white/10">{activeShop.emoji}</div>
                <div className="text-center space-y-2">
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter">{activeShop.name}</h2>
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={() => setChatLang('en-US')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black border transition-all ${chatLang === 'en-US' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>English Mode</button>
                    <button onClick={() => setChatLang('ta-IN')} className={`px-4 py-1.5 rounded-xl text-[10px] font-black border transition-all ${chatLang === 'ta-IN' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>Tamil Mode (தமிழ்)</button>
                  </div>
                </div>
              </div>

              {orderStep === 'menu' && (
                <div className="space-y-12 animate-in fade-in duration-500">
                  <div className="grid grid-cols-1 gap-4 max-h-[350px] overflow-y-auto custom-scrollbar pr-4">
                    {activeShop.menu?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-6 bg-white/5 border border-white/5 rounded-[2rem] hover:bg-white/10 transition-all group">
                        <div className="flex flex-col">
                          <span className="text-[16px] font-black text-white uppercase tracking-tight">{item.name}</span>
                          <span className="text-[13px] font-black text-emerald-400 tracking-tighter">₹{item.price}</span>
                        </div>
                        <div className="flex items-center gap-6">
                          <button onClick={() => updateCart(item.name, -1)} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-rose-500/20 border border-white/10 flex items-center justify-center text-xl text-white hover:text-rose-500 transition-all">-</button>
                          <span className={`text-xl font-black w-8 text-center ${cart[item.name] ? 'text-indigo-400' : 'text-white/20'}`}>{cart[item.name] || 0}</span>
                          <button onClick={() => updateCart(item.name, 1)} className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-indigo-600/20 border border-white/10 flex items-center justify-center text-xl text-white hover:text-indigo-400 transition-all">+</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cart Summary */}
                  {cartTotalItems > 0 && (
                    <div className="bg-emerald-600/10 border border-emerald-500/20 p-6 rounded-[2rem] flex justify-between items-center animate-in slide-in-from-bottom-2">
                       <div className="flex gap-2 items-center">
                         <span className="text-xl">🛒</span>
                         <span className="text-[12px] font-black text-emerald-400 uppercase">{cartTotalItems} {cartTotalItems === 1 ? 'Item' : 'Items'} Ready</span>
                       </div>
                       <button onClick={() => setCart({})} className="text-[10px] font-black text-white/40 hover:text-rose-500 uppercase tracking-widest">Clear All</button>
                    </div>
                  )}
                  
                  <div className="space-y-6 bg-black/40 p-10 rounded-[3rem] border border-white/5 shadow-inner">
                    <div className="flex flex-col items-center gap-4 mb-4">
                       <VoiceWave isActive={isListening || isParsingOrder} isSpeaking={isParsingOrder} />
                       <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest text-center">
                         {isParsingOrder ? (chatLang === 'ta-IN' ? "முகவர் உங்கள் ஆர்டரை எழுதுகிறார்..." : "Agent is writing down your order...") : 
                          isListening ? (chatLang === 'ta-IN' ? "கேட்கிறது..." : "Listening to Signal...") : 
                          (chatLang === 'ta-IN' ? "உங்கள் ஆர்டரைச் சொல்லுங்கள் (எ.கா. 'biryani rendu venum')" : "State items to ADD via voice (e.g. 'Add 2 Biryanis')")}
                       </p>
                    </div>
                    <div className="flex gap-4">
                       <button onClick={() => {
                          const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                          if (R) {
                            const r = new R();
                            r.lang = chatLang;
                            r.onstart = () => setIsListening(true);
                            r.onend = () => setIsListening(false);
                            r.onresult = (e: any) => {
                              const transcript = e.results[0][0].transcript;
                              setOrderInput(transcript);
                              processOrderInput(transcript);
                            };
                            r.start();
                          }
                       }} disabled={isParsingOrder} className={`p-8 rounded-[2rem] transition-all shadow-2xl active:scale-95 border flex flex-col items-center gap-2 min-w-[120px] ${isListening ? 'bg-rose-600 text-white border-rose-500 shadow-rose-600/50' : 'bg-white/5 text-white/40 border-white/10 hover:text-white/80'}`}>
                         <span className="text-3xl">{isListening ? '⏹️' : '🎤'}</span>
                         <span className="text-[9px] font-black uppercase">{isListening ? 'REC' : 'MIC'}</span>
                       </button>
                       <div className="flex-1 flex flex-col gap-4">
                          <input value={orderInput} onChange={e => setOrderInput(e.target.value)} placeholder={chatLang === 'ta-IN' ? "எ.கா. 2 பிரியாணி மற்றும் ஒரு சிக்கன் 65..." : "e.g. I want 2 Biryanis and one Chicken 65"} className="w-full bg-black/60 border border-white/10 rounded-[2rem] px-10 py-8 text-xl text-white outline-none focus:border-indigo-500 transition-all shadow-inner placeholder:text-white/10" />
                          <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => processOrderInput()} disabled={isParsingOrder || !orderInput} className="py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] font-black text-[14px] uppercase shadow-2xl transition-all active:scale-[0.98] disabled:opacity-30">
                              {isParsingOrder ? (chatLang === 'ta-IN' ? 'சரிபார்க்கிறது...' : 'Processing...') : (chatLang === 'ta-IN' ? 'பட்டியலில் சேர்' : 'Voice/Text Add')}
                            </button>
                            <button onClick={proceedToVerify} disabled={isParsingOrder || Object.keys(cart).length === 0} className="py-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[1.5rem] font-black text-[14px] uppercase shadow-2xl transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2">
                              {chatLang === 'ta-IN' ? `ஆர்டரைச் சரிபார்க்கவும் (${cartTotalItems})` : `Finalize Order (${cartTotalItems})`}
                            </button>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
              )}

              {orderStep === 'verifying' && parsedOrder && (
                <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-700">
                  <div className="bg-indigo-600/5 border border-indigo-500/20 rounded-[3rem] p-12 space-y-8 shadow-[inset_0_0_40px_rgba(99,102,241,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
                    <p className="text-[12px] font-black text-indigo-400 uppercase tracking-[0.5em] border-b border-indigo-500/20 pb-6">{chatLang === 'ta-IN' ? 'ஆர்டர் விவரங்கள்' : 'Final Order Verification'}</p>
                    <div className="space-y-5">
                      {parsedOrder.orderItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center group">
                          <div className="flex items-center gap-4">
                            <span className="w-8 h-8 bg-indigo-600/20 rounded-lg flex items-center justify-center text-[11px] font-black text-indigo-300">{item.quantity}x</span>
                            <span className="text-[18px] font-black text-white uppercase group-hover:text-indigo-300 transition-colors">{item.name}</span>
                          </div>
                          <span className="text-[18px] font-bold text-slate-400 tracking-tighter">₹{item.price * item.quantity}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-8 border-t border-indigo-500/30 flex justify-between items-center">
                      <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">{chatLang === 'ta-IN' ? 'மொத்த தொகை' : 'Aggregate Energy Credit'}</span>
                      <span className="text-4xl font-black text-white tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">₹{parsedOrder.totalPrice}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-6">
                    <button onClick={() => setOrderStep('menu')} className="flex-1 py-8 bg-white/5 text-white/40 hover:text-white text-[14px] font-black uppercase rounded-[2rem] border border-white/5 transition-all">{chatLang === 'ta-IN' ? 'மாற்றவும் / சேர்' : 'Edit / Add More'}</button>
                    <button onClick={confirmFinalOrder} className="flex-[2] py-8 bg-emerald-600 text-white text-[16px] font-black uppercase rounded-[2.5rem] shadow-[0_20px_60px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.03] active:scale-[0.96] flex items-center justify-center gap-4 group border border-emerald-400/20">
                       <span className="text-4xl group-hover:scale-125 transition-transform">✓</span> {chatLang === 'ta-IN' ? 'ஆர்டர் செய்' : 'PLACE ORDER NOW'}
                    </button>
                  </div>
                </div>
              )}

              {orderStep === 'placed' && (
                <div className="py-24 flex flex-col items-center justify-center space-y-12 animate-in zoom-in-95 duration-700">
                   <div className="w-40 h-40 bg-emerald-600 rounded-full flex items-center justify-center text-8xl text-white shadow-[0_0_100px_rgba(16,185,129,0.6)] animate-bounce border-8 border-emerald-400/40">✓</div>
                   <div className="text-center space-y-4">
                     <h3 className="text-5xl font-black text-white uppercase tracking-tighter">{chatLang === 'ta-IN' ? 'ஆர்டர் வெற்றிகரமாக முடிந்தது' : 'Order Transmitted'}</h3>
                     <p className="text-[14px] text-emerald-400 font-black uppercase tracking-[0.4em]">{chatLang === 'ta-IN' ? 'இணைப்பு உறுதி செய்யப்பட்டது' : 'Node Connection Solidified'}</p>
                   </div>
                   <div className="p-8 bg-white/5 border border-white/10 rounded-[2rem] italic text-slate-300 text-lg max-w-[500px] text-center shadow-inner">
                     {chatLang === 'ta-IN' ? '"மச்சி, சிக்னல் கிடைத்துவிட்டது! உணவு தயாராகி வருகிறது. இடத்திற்கு வந்து சேருங்கள்."' : '"Machi, signal is clear! Food is being prepped. Check your coordinates and move to the legend."'}
                   </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isRegistering && (
          <div className="absolute inset-0 z-[3000] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl w-full bg-[#080808] border border-white/10 rounded-[3.5rem] p-12 space-y-10 shadow-[0_50px_150px_rgba(0,0,0,1)] border-t-white/20 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{isEditing ? 'Modify Node Data' : 'Establish Node Signal'}</h2>
                  <p className="text-[11px] text-white/40 font-black uppercase tracking-[0.3em] mt-1">{isEditing ? 'Updating live manifest' : 'Onboarding legend'}</p>
                </div>
                <button onClick={() => { setIsRegistering(false); setIsEditing(false); }} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white/60 transition-all hover:rotate-90">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-8">
                  <div className="grid grid-cols-4 gap-6">
                    <div className="col-span-1 space-y-2">
                      <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Symbol</label>
                      <input value={regForm.emoji} onChange={e => setRegForm({...regForm, emoji: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-5 text-center text-2xl shadow-inner focus:border-indigo-500 transition-all outline-none text-white" />
                    </div>
                    <div className="col-span-3 space-y-2">
                      <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Hub Alias</label>
                      <input placeholder="E.g. Murali's Snacks" value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[15px] outline-none focus:border-indigo-500 shadow-inner transition-all font-bold text-white placeholder:text-white/30" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Cuisine Specialty</label>
                    <input placeholder="E.g. Authentic Rose Milk" value={regForm.cuisine} onChange={e => setRegForm({...regForm, cuisine: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[12px] shadow-inner focus:border-indigo-500 outline-none transition-all text-white placeholder:text-white/30" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Manual Coordinates (DMS)</label>
                    <div className="flex gap-2">
                      <input placeholder={`13°05'41.5"N 80°10'30.2"E`} value={regForm.manualDMS} onChange={e => setRegForm({...regForm, manualDMS: e.target.value})} className="flex-1 bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[11px] shadow-inner focus:border-indigo-500 outline-none transition-all text-white placeholder:text-white/20" />
                      <button onClick={handleApplyDMS} className="px-6 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black uppercase rounded-2xl border border-white/10 transition-all">Apply</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black uppercase text-indigo-400">Broadcast Bio</label>
                      <button onClick={generateBio} disabled={isGeneratingBio} className="text-[9px] font-black uppercase text-indigo-300 hover:text-indigo-200 transition-all flex items-center gap-2">{isGeneratingBio ? '...' : '✨ Gemini Bio'}</button>
                    </div>
                    <textarea rows={4} value={regForm.description} onChange={e => setRegForm({...regForm, description: e.target.value})} className="w-full bg-white/10 border border-white/10 rounded-2xl px-6 py-5 text-[12px] resize-none focus:border-indigo-500 outline-none transition-all leading-relaxed text-white placeholder:text-white/30" />
                  </div>
                </div>
                <div className="flex flex-col h-full space-y-8">
                  <div className="space-y-4 flex-1">
                    <label className="text-[9px] font-black uppercase text-indigo-400 px-1">Inventory Manifest (Menu)</label>
                    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-6 min-h-[250px] flex flex-col gap-3 custom-scrollbar overflow-y-auto max-h-[350px]">
                      {regForm.menu.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/10 p-4 rounded-2xl group">
                          <span className="text-[12px] font-black text-white uppercase tracking-tight">{item.name} <span className="text-emerald-400 ml-2">₹{item.price}</span></span>
                          <button onClick={() => removeMenuItem(idx)} className="text-white/20 group-hover:text-rose-500 p-1">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4 bg-white/10 p-6 rounded-[2.5rem] border border-white/5">
                    <div className="grid grid-cols-3 gap-3">
                      <input placeholder="Item" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="col-span-2 bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-[12px] text-white outline-none" />
                      <input placeholder="Price" type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} className="bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-[12px] text-white outline-none" />
                    </div>
                    <button onClick={addMenuItem} className="w-full py-4 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-lg shadow-emerald-600/10">+ Add to Manifest</button>
                  </div>
                </div>
              </div>
              <div className="pt-10 flex gap-6 border-t border-white/5">
                <button onClick={() => { setIsRegistering(false); setIsEditing(false); }} className="flex-1 py-6 text-[12px] font-black uppercase text-white/40 bg-white/10 rounded-2xl">Cancel</button>
                <button onClick={handleSaveHub} className="flex-1 py-6 text-[12px] font-black uppercase text-white bg-indigo-600 rounded-2xl hover:bg-indigo-500">Activate Partner Node</button>
              </div>
            </div>
          </div>
        )}

        {activeShop && !isOrdering && (
          <div className={`absolute bottom-10 left-10 right-10 z-[1000] animate-in slide-in-from-bottom-10 duration-700 transition-all`}>
            <div className="max-w-4xl mx-auto bg-black/95 backdrop-blur-3xl p-6 md:p-8 rounded-[3rem] border border-white/10 shadow-[0_25px_100px_rgba(0,0,0,0.8)] flex flex-col gap-4 md:gap-6 max-h-[85vh] overflow-hidden relative border-t-white/20">
              <button onClick={() => { stopAudio(); setActiveShop(null); }} className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white/60 transition-colors shadow-xl z-20">✕</button>
              <div className="flex flex-col md:flex-row gap-4 md:gap-8 overflow-y-auto custom-scrollbar pr-2">
                <div className="text-6xl md:text-7xl bg-white/5 p-6 rounded-[2.5rem] border border-white/5 h-fit shadow-2xl group transition-all duration-700 mx-auto md:mx-0 shrink-0">
                   <div className="group-hover:scale-110 transition-transform cursor-default">{activeShop.emoji}</div>
                </div>
                <div className="flex-1 space-y-2 md:space-y-3 min-w-0">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-0.5">
                      <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight leading-tight truncate">{activeShop.name}</h3>
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">{activeShop.cuisine}</p>
                    </div>
                    <div className="shrink-0">
                      <VoiceWave isActive={isVoiceActive} isSpeaking={isSpeaking} onStop={stopAudio} />
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/5 p-3 md:p-4 rounded-[1.25rem] italic relative overflow-hidden shadow-inner max-h-[80px] overflow-y-auto custom-scrollbar">
                    <p className="text-xs md:text-sm text-white/80 leading-relaxed font-semibold line-clamp-2">"{activeShop.description}"</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeShop.coords.lat},${activeShop.coords.lng}`} target="_blank" className="px-6 py-4 bg-white text-black text-[11px] font-black uppercase rounded-[1.25rem] shadow-2xl transition-all hover:shadow-white/40 flex items-center justify-center gap-3 active:scale-95">🛰️ Navigate</a>
                    {activeShop.isVendor && activeShop.status === VendorStatus.ONLINE && (
                      <button onClick={initiateOrder} className="flex-1 py-4 bg-emerald-600 text-white text-[11px] font-black uppercase rounded-[1.25rem] shadow-2xl transition-all hover:bg-emerald-500 flex items-center justify-center gap-3 active:scale-95 border border-emerald-400/20">🛒 Order Now</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`fixed bottom-10 right-10 z-[4000] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isChatOpen ? 'w-[480px] h-[720px]' : 'w-24 h-24'}`}>
          {!isChatOpen ? (
            <button onClick={() => setIsChatOpen(true)} className="w-full h-full bg-indigo-600 rounded-[3rem] flex items-center justify-center text-white text-4xl shadow-[0_25px_60px_rgba(79,70,229,0.5)] transition-all group overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
               <span className="relative z-10">💬</span>
            </button>
          ) : (
            <div className="w-full h-full bg-[#080808]/98 backdrop-blur-3xl border border-white/10 rounded-[4rem] flex flex-col overflow-hidden shadow-[0_60px_180px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-500 border-t-white/20">
              <div className="p-12 bg-white/5 border-b border-white/5 flex justify-between items-center">
                <div className="flex flex-col">
                  <h3 className="text-[14px] font-black text-white tracking-[0.6em] uppercase">GeoMind Voice</h3>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-3 opacity-60">Spatial Reasoning Engine</p>
                </div>
                <div className="bg-black/50 p-2 rounded-2xl flex border border-white/10 shadow-inner">
                  <button onClick={() => setChatLang('en-US')} className={`px-5 py-2 text-[10px] font-black rounded-xl transition-all ${chatLang === 'en-US' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>EN</button>
                  <button onClick={() => setChatLang('ta-IN')} className={`px-5 py-2 text-[10px] font-black rounded-xl transition-all ${chatLang === 'ta-IN' ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/20 hover:text-white/40'}`}>TA</button>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white/60 transition-all">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar">
                {chatHistory.map(m => (
                  <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                    <div className={`max-w-[92%] p-8 rounded-[2.5rem] text-[15px] font-bold leading-relaxed shadow-2xl ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white/10 text-white border border-white/10 rounded-bl-none shadow-black/40'}`}>
                      {m.isThinking ? <p className="animate-pulse">Thinking...</p> : <p>{m.text}</p>}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-10 bg-black/60 border-t border-white/10 flex flex-col gap-4">
                <div className="flex gap-4 items-center">
                  <button 
                    onClick={handleChatVoice} 
                    className={`w-14 h-14 shrink-0 rounded-full flex items-center justify-center transition-all shadow-xl border ${isListening ? 'bg-rose-600 border-rose-500 animate-pulse text-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'}`}
                    title="Voice Input"
                  >
                    <span className="text-2xl">{isListening ? '⏹️' : '🎤'}</span>
                  </button>
                  <form onSubmit={(e) => { e.preventDefault(); handleChatSubmit(chatInput); }} className="flex-1 flex gap-4">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Inquire about spatial grid..." className="flex-1 bg-white/10 border border-white/10 rounded-3xl px-8 py-6 text-white outline-none focus:border-indigo-500 shadow-inner" />
                    <button type="submit" className="px-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-black text-[14px] uppercase shadow-lg transition-all active:scale-95">Send</button>
                  </form>
                </div>
                {isListening && (
                  <p className="text-center text-[10px] font-black text-rose-500 uppercase tracking-widest animate-pulse">Listening to Signal...</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}