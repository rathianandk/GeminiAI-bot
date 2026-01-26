
import React, { useState, useEffect, useRef } from 'react';
// Renamed Map to FoodMap to avoid conflict with the native Map constructor
import FoodMap from './components/Map';
import { discoveryAgent, spatialAlertAgent, getTamilTextSummary, getTamilAudioSummary, generateVendorBio, spatialChatAgent } from './services/geminiService';
import { Shop, LatLng, AgentLog, VendorStatus, VendorProfile, MenuItem, ChatMessage, GroundingSource } from './types';

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

interface Notification { id: string; title: string; message: string; emoji: string; coords: LatLng; shopId: string; }

// --- Global Audio Singleton ---
let persistentAudioCtx: AudioContext | null = null;
let activeVoiceSource: AudioBufferSourceNode | null = null;

const getAudioCtx = () => {
  if (!persistentAudioCtx) {
    persistentAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return persistentAudioCtx;
};

// --- Decoding Helpers with Alignment Fix ---
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodePCM(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
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

export default function App() {
  const [shops, setShops] = useState<Shop[]>(SEED_SHOPS);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isMining, setIsMining] = useState(false);
  const [discoverySources, setDiscoverySources] = useState<GroundingSource[]>([]);
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [location, setLocation] = useState<LatLng>({ lat: 13.0827, lng: 80.2707 });
  const [userMode, setUserMode] = useState<'explorer' | 'vendor'>('explorer');
  const [explorerTab, setExplorerTab] = useState<'logs' | 'discovered'>('discovered');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Chat & Voice State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'Namaste! I am your GeoMind assistant. Ask me anything about landmarks or food!' }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Vendor State
  const [myProfiles, setMyProfiles] = useState<VendorProfile[]>(() => {
    const saved = localStorage.getItem('geomind_profiles');
    return saved ? JSON.parse(saved) : SEED_PROFILES;
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [regForm, setRegForm] = useState({ 
    name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] as MenuItem[] 
  });
  const [newItem, setNewItem] = useState({ name: '', price: '' });
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  // Explorer Ordering State
  const [cart, setCart] = useState<{item: MenuItem, shopId: string}[]>([]);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'transmitting' | 'success'>('idle');

  // Sync Shops with Vendor Profiles
  useEffect(() => {
    localStorage.setItem('geomind_profiles', JSON.stringify(myProfiles));
    setShops(prev => {
      const nonVendors = prev.filter(s => !s.isVendor);
      const vendors = myProfiles.map(p => {
        const liveId = `live-${p.id}`;
        const isLive = prev.find(s => s.id === liveId && s.status === VendorStatus.ONLINE);
        return {
          id: isLive ? liveId : p.id,
          name: p.name,
          coords: p.lastLocation || location,
          isVendor: true,
          status: isLive ? VendorStatus.ONLINE : VendorStatus.OFFLINE,
          emoji: p.emoji,
          cuisine: p.cuisine,
          description: p.description,
          menu: p.menu,
          hours: p.hours
        };
      });
      return [...nonVendors, ...vendors];
    });
  }, [myProfiles]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const addLog = (agent: AgentLog['agent'], message: string, status: AgentLog['status'] = 'processing') => {
    setLogs(prev => [{ id: Math.random().toString(), agent, message, status }, ...prev.slice(0, 20)]);
  };

  const playVoice = async (base64: string) => {
    if (!base64) return;
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      if (activeVoiceSource) {
        try { activeVoiceSource.stop(); } catch(e) {}
      }
      addLog('Linguistic', `Decoding audio stream...`, 'processing');
      const bytes = decode(base64);
      const audioBuffer = await decodePCM(bytes, ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setIsSpeaking(false);
        if (activeVoiceSource === source) activeVoiceSource = null;
      };
      activeVoiceSource = source;
      setIsSpeaking(true);
      source.start();
      addLog('Linguistic', "Vocal playback active.", 'resolved');
    } catch (err: any) {
      addLog('Linguistic', `Audio Error: ${err.message}`, 'failed');
      setIsSpeaking(false);
    }
  };

  const handleShopSelect = async (shop: Shop) => {
    setActiveShop(shop);
    setLocation(shop.coords);
    setCart([]); // Clear cart when switching shops
    setOrderStatus('idle');
    addLog('Linguistic', `Synthesizing info for "${shop.name}"...`, 'processing');
    getTamilAudioSummary(shop).then(data => data && playVoice(data));
    getTamilTextSummary(shop).then(summary => {
      addLog('Linguistic', `Info Captured:\n\n${summary.tamil}\n\n${summary.english}`, 'resolved');
    });
  };

  const handleNotifClick = (n: Notification) => {
    const shop = shops.find(s => s.id === n.shopId);
    if (shop) handleShopSelect(shop);
    setNotifications(prev => prev.filter(notif => notif.id !== n.id));
  };

  const handleRegister = () => {
    if (!regForm.name) return;
    const newProfile: VendorProfile = {
      id: `profile-${Date.now()}`,
      name: regForm.name,
      emoji: regForm.emoji,
      cuisine: regForm.cuisine,
      description: regForm.description,
      lastLocation: location,
      menu: regForm.menu,
      hours: `${regForm.startHour}:00 - ${regForm.endHour}:00`
    };
    setMyProfiles(prev => [...prev, newProfile]);
    setIsRegistering(false);
    setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', startHour: 9, endHour: 22, menu: [] });
    addLog('Spatial', `Node Online: ${newProfile.name}`, 'resolved');
  };

  const startDiscovery = async () => {
    setIsMining(true);
    setExplorerTab('logs');
    addLog('Discovery', 'Scanning spatial grid for landmarks...', 'processing');
    const result = await discoveryAgent("Legendary street food Chennai");
    setShops(prev => [...prev, ...result.shops]);
    setDiscoverySources(result.sources);
    result.logs.forEach(msg => addLog('Discovery', msg, 'resolved'));
    setIsMining(false);
  };

  const handleBroadcastLive = async () => {
    const profile = myProfiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    addLog('Spatial', `Broadcasting live signal for ${profile.name}...`, 'processing');
    const alert = await spatialAlertAgent(profile.name, location);
    if (alert.audioData) playVoice(alert.audioData);
    
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
    setNotifications(prev => [{ id: Date.now().toString(), title: "LIVE", message: `${profile.name} is LIVE!`, emoji: profile.emoji, coords: location, shopId: liveShop.id }, ...prev]);
  };

  const handleSyncLocation = () => {
    if (!navigator.geolocation) return;
    setIsUpdatingLocation(true);
    navigator.geolocation.getCurrentPosition(p => {
      const coords = { lat: p.coords.latitude, lng: p.coords.longitude };
      setLocation(coords);
      if (activeProfileId) {
        setMyProfiles(prev => prev.map(pr => pr.id === activeProfileId ? { ...pr, lastLocation: coords } : pr));
        addLog('Spatial', "GPS Coordinate Sync Successful.", 'resolved');
      }
      setIsUpdatingLocation(false);
    }, () => setIsUpdatingLocation(false));
  };

  const addToCart = (item: MenuItem) => {
    if (!activeShop) return;
    setCart(prev => [...prev, { item, shopId: activeShop.id }]);
    addLog('Spatial', `Item queued for transaction: ${item.name}`, 'resolved');
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const handlePlaceOrder = () => {
    if (cart.length === 0) return;
    setOrderStatus('transmitting');
    addLog('Spatial', "Initiating encrypted order transmission to vendor node...", 'processing');
    
    // Simulate API delay
    setTimeout(() => {
      setOrderStatus('success');
      setCart([]);
      addLog('Spatial', "Transaction complete. Order anchored to vendor database.", 'resolved');
      
      // Auto close after success
      setTimeout(() => {
        if (orderStatus === 'success') setOrderStatus('idle');
      }, 3000);
    }, 2000);
  };

  const addMenuItem = () => {
    if (!newItem.name || !newItem.price) return;
    const item: MenuItem = { name: newItem.name, price: Number(newItem.price) };
    if (activeProfileId) {
      setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, menu: [...p.menu, item] } : p));
    } else {
      setRegForm(prev => ({ ...prev, menu: [...prev.menu, item] }));
    }
    setNewItem({ name: '', price: '' });
  };

  const removeMenuItem = (index: number) => {
    if (activeProfileId) {
      setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, menu: p.menu.filter((_, i) => i !== index) } : p));
    } else {
      setRegForm(prev => ({ ...prev, menu: prev.menu.filter((_, i) => i !== index) }));
    }
  };

  const activeProfile = myProfiles.find(p => p.id === activeProfileId);
  const discoveredShops = shops.filter(s => !s.isVendor);
  const vendorShops = shops.filter(s => s.isVendor);
  const isCurrentlyLive = activeProfileId && shops.some(s => s.id === `live-${activeProfileId}` && s.status === VendorStatus.ONLINE);
  const cartTotal = cart.reduce((acc, curr) => acc + curr.item.price, 0);

  return (
    <div className="flex h-screen w-screen bg-[#020202] text-slate-300 font-mono overflow-hidden">
      {/* Notifications */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-3 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="w-80 bg-black/90 backdrop-blur-xl border border-emerald-500/50 rounded-2xl p-4 shadow-2xl pointer-events-auto cursor-pointer" onClick={() => handleNotifClick(n)}>
            <div className="flex gap-4 items-center">
              <span className="text-2xl">{n.emoji}</span>
              <div>
                <p className="text-[10px] font-black text-emerald-400 uppercase">LIVE SIGNAL</p>
                <p className="text-[11px] font-bold text-white">{n.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Navigation */}
      <div className="w-[450px] border-r border-white/5 bg-[#080808] flex flex-col z-20 shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5 shrink-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-sm font-black tracking-[0.4em] text-white">GEOMIND AI</h1>
            <div className="flex gap-2">
              <button onClick={() => setUserMode('explorer')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'explorer' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/5 text-white/40'}`}>Explorer</button>
              <button onClick={() => setUserMode('vendor')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${userMode === 'vendor' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white/5 text-white/40'}`}>Partner Hub</button>
            </div>
          </div>
          
          {userMode === 'explorer' ? (
            <div className="space-y-4">
              <button onClick={startDiscovery} disabled={isMining} className="w-full py-4 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl shadow-xl">{isMining ? 'Mining Spatial Nodes...' : 'Run Food Discovery'}</button>
              <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                <button onClick={() => setExplorerTab('logs')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md ${explorerTab === 'logs' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Intelligence</button>
                <button onClick={() => setExplorerTab('discovered')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md ${explorerTab === 'discovered' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Nodes ({discoveredShops.length})</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeProfileId ? (
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[10px] font-black uppercase text-emerald-400">Node Management</h3>
                    <button onClick={() => setActiveProfileId(null)} className="text-[8px] font-black text-white/40 uppercase bg-white/5 px-2 py-1 rounded">Fleet List</button>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl bg-white/5 p-3 rounded-xl">{activeProfile?.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-white uppercase truncate">{activeProfile?.name}</p>
                      <p className="text-[8px] text-white/40 font-black uppercase">{activeProfile?.hours}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleBroadcastLive} className={`py-4 text-white text-[9px] font-black rounded-xl shadow-lg transition-all ${isCurrentlyLive ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                      {isCurrentlyLive ? 'Update Broadcast' : 'Go Live Now'}
                    </button>
                    <button onClick={handleSyncLocation} className={`py-4 bg-white/10 text-white text-[9px] font-black rounded-xl border border-white/5 ${isUpdatingLocation ? 'animate-pulse' : ''}`}>
                      Sync GPS
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <button onClick={() => setIsRegistering(true)} className="w-full py-4 border border-dashed border-white/20 text-indigo-400 text-[10px] font-black uppercase rounded-xl hover:bg-white/5 transition-all">
                    + Register New Infrastructure Node
                  </button>
                  <p className="text-[9px] font-black text-white/20 uppercase tracking-widest text-center">Connected Assets</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {userMode === 'explorer' ? (
             explorerTab === 'logs' ? (
                logs.map(l => (
                  <div key={l.id} className="p-4 rounded-xl border border-white/5 bg-[#0a0a0a] animate-in slide-in-from-top-1">
                    <div className="flex justify-between mb-2">
                      <span className={`text-[7px] font-black px-2 py-0.5 rounded border uppercase ${l.agent === 'Linguistic' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{l.agent}</span>
                      <span className="text-[6px] text-white/10 uppercase">{l.status}</span>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 leading-relaxed whitespace-pre-line">{l.message}</p>
                  </div>
                ))
              ) : (
                <div className="space-y-3">
                  {/* Highlight Live Vendors in Sidebar */}
                  {vendorShops.filter(s => s.status === VendorStatus.ONLINE).map(s => (
                    <button key={s.id} onClick={() => handleShopSelect(s)} className="w-full p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/40 text-left hover:bg-emerald-500/10 transition-all group flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <p className="text-[10px] font-black text-white uppercase">{s.name}</p>
                        </div>
                        <p className="text-[8px] text-emerald-400 font-black uppercase mt-1">LIVE NOW • {s.cuisine}</p>
                      </div>
                      <span className="text-2xl">{s.emoji}</span>
                    </button>
                  ))}
                  <div className="h-px bg-white/5 my-4"></div>
                  {discoveredShops.map(s => (
                    <button key={s.id} onClick={() => handleShopSelect(s)} className="w-full p-4 rounded-xl bg-white/5 border border-white/5 text-left hover:border-indigo-500/50 transition-all group">
                      <p className="text-[10px] font-black text-white uppercase group-hover:text-indigo-400">{s.name}</p>
                      <p className="text-[8px] text-indigo-400/60 font-black uppercase mt-1">{s.cuisine}</p>
                    </button>
                  ))}
                </div>
              )
          ) : (
            <>
              {activeProfileId ? (
                <div className="space-y-6">
                  {/* Active Profile Edit Tools */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-black uppercase text-white/40 tracking-widest">Inventory / Menu</h4>
                    </div>
                    <div className="space-y-2">
                      {activeProfile?.menu.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5">
                          <span className="text-[10px] font-black text-white">{item.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-emerald-400">₹{item.price}</span>
                            <button onClick={() => removeMenuItem(idx)} className="text-red-500/50 hover:text-red-500 text-xs">✕</button>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 p-2 bg-white/5 rounded-xl border border-white/10">
                        <input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Item Name" className="flex-1 bg-transparent text-[10px] outline-none px-2" />
                        <input type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} placeholder="Price" className="w-16 bg-transparent text-[10px] outline-none border-l border-white/10 px-2" />
                        <button onClick={addMenuItem} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black">ADD</button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-white/40 tracking-widest">Operation Hours</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[8px] text-white/20 uppercase">Open Hour</p>
                        <select 
                          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white"
                          value={parseInt(activeProfile?.hours?.split(' - ')[0] || '0')}
                          onChange={(e) => {
                            const val = e.target.value.padStart(2, '0') + ':00';
                            const end = activeProfile?.hours?.split(' - ')[1];
                            setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, hours: `${val} - ${end}` } : p));
                          }}
                        >
                          {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{i}:00</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] text-white/20 uppercase">Close Hour</p>
                        <select 
                          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white"
                          value={parseInt(activeProfile?.hours?.split(' - ')[1] || '0')}
                          onChange={(e) => {
                            const start = activeProfile?.hours?.split(' - ')[0];
                            const val = e.target.value.padStart(2, '0') + ':00';
                            setMyProfiles(prev => prev.map(p => p.id === activeProfileId ? { ...p, hours: `${start} - ${val}` } : p));
                          }}
                        >
                          {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{i}:00</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                myProfiles.map(p => (
                  <div key={p.id} className="w-full p-4 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center group hover:bg-white/10 transition-all animate-in slide-in-from-right-4">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl bg-white/5 p-2 rounded-lg">{p.emoji}</span>
                      <div>
                        <p className="text-[11px] font-black text-white uppercase">{p.name}</p>
                        <p className="text-[8px] text-white/40 font-black uppercase">{p.cuisine} • {p.menu.length} Items</p>
                      </div>
                    </div>
                    <button onClick={() => setActiveProfileId(p.id)} className="px-4 py-2 bg-indigo-600/10 text-indigo-400 text-[8px] font-black uppercase rounded-lg border border-indigo-500/20 hover:bg-indigo-600 hover:text-white transition-all">Manage Node</button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Map Content */}
      <div className="flex-1 relative">
        <FoodMap center={location} shops={shops} onLocationChange={setLocation} onShopClick={handleShopSelect} />
        
        {/* Expanded Info Drawer */}
        {activeShop && (
          <div className="absolute bottom-10 left-10 right-10 z-[1000] animate-in slide-in-from-bottom-5">
            <div className="max-w-5xl mx-auto bg-black/95 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row gap-8">
              <div className="flex gap-8 flex-1">
                <div className="text-7xl flex-shrink-0 bg-white/5 p-6 rounded-3xl border border-white/5 h-fit relative">
                  {activeShop.emoji}
                  {activeShop.status === VendorStatus.ONLINE && (
                    <span className="absolute -top-2 -right-2 bg-emerald-500 text-[8px] font-black text-white px-2 py-1 rounded-full animate-pulse uppercase">LIVE</span>
                  )}
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight">{activeShop.name}</h3>
                      <div className="flex gap-2 mt-1">
                        <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">{activeShop.cuisine}</p>
                        {activeShop.hours && <p className="text-[11px] font-black text-white/30 uppercase tracking-widest border-l border-white/10 pl-2">Hours: {activeShop.hours}</p>}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 leading-relaxed max-w-xl">{activeShop.description}</p>
                  
                  {activeShop.menu && activeShop.menu.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Available Provisioning</p>
                      <div className="flex flex-wrap gap-2">
                        {activeShop.menu.map((item, i) => (
                          <button 
                            key={i} 
                            onClick={() => addToCart(item)}
                            className="text-[9px] font-black text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 px-4 py-2 rounded-full uppercase hover:bg-emerald-500/20 hover:border-emerald-500 transition-all flex items-center gap-2 group"
                          >
                            <span>{item.name}</span>
                            <span className="text-white/40 group-hover:text-white">• ₹{item.price}</span>
                            <span className="bg-emerald-500/20 px-1 rounded text-[7px]">+</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex gap-4">
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeShop.coords.lat},${activeShop.coords.lng}`} target="_blank" className="px-10 py-4 bg-white text-black text-[11px] font-black uppercase rounded-2xl shadow-xl hover:scale-105 transition-transform">Navigate Hub</a>
                    {activeShop.isVendor && <button className="px-8 py-4 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-black uppercase rounded-2xl cursor-default">Verified Vendor</button>}
                  </div>
                </div>
              </div>

              {/* Order Cart Sub-Section */}
              <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-white/10 pt-6 md:pt-0 md:pl-8 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-black uppercase text-white tracking-[0.2em]">Transaction Cart</h4>
                    <button onClick={() => setActiveShop(null)} className="text-white/30 hover:text-white text-lg">✕</button>
                  </div>
                  
                  <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {cart.length === 0 ? (
                      <p className="text-[9px] text-white/20 uppercase text-center py-8 italic">No items selected for transmission</p>
                    ) : (
                      cart.map((c, i) => (
                        <div key={i} className="flex justify-between items-center text-[10px] p-2 bg-white/5 rounded-lg border border-white/5 animate-in slide-in-from-right-2">
                          <span className="text-white font-black truncate">{c.item.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-emerald-400">₹{c.item.price}</span>
                            <button onClick={() => removeFromCart(i)} className="text-white/20 hover:text-red-500">✕</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-6 space-y-4">
                  <div className="flex justify-between items-center border-t border-white/10 pt-4">
                    <span className="text-[9px] font-black uppercase text-white/40">Total Settlement</span>
                    <span className="text-xl font-black text-emerald-400">₹{cartTotal}</span>
                  </div>
                  
                  {orderStatus === 'success' ? (
                    <div className="w-full py-4 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-2xl text-center animate-in zoom-in-95">
                      Signal Transmitted! ✓
                    </div>
                  ) : (
                    <button 
                      onClick={handlePlaceOrder}
                      disabled={cart.length === 0 || orderStatus === 'transmitting'} 
                      className={`w-full py-4 text-[10px] font-black uppercase rounded-2xl transition-all ${
                        cart.length > 0 && orderStatus !== 'transmitting' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95' 
                        : 'bg-white/5 text-white/20 cursor-not-allowed'
                      }`}
                    >
                      {orderStatus === 'transmitting' ? 'Transmitting Data...' : 'Transmit Order to Hub'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Chat Floating Bot */}
        <div className={`fixed bottom-6 right-6 z-[2500] transition-all duration-500 ${isChatOpen ? 'w-[400px] h-[600px]' : 'w-16 h-16'}`}>
          {!isChatOpen ? (
            <button onClick={() => setIsChatOpen(true)} className="w-full h-full bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 shadow-indigo-500/30">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            </button>
          ) : (
            <div className="w-full h-full bg-[#080808] border border-white/10 rounded-[2rem] flex flex-col overflow-hidden animate-in zoom-in-95 shadow-2xl backdrop-blur-3xl">
              <div className="p-6 bg-white/5 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-[10px] font-black uppercase text-white tracking-[0.3em]">GEOMIND: VOICE</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    <p className="text-[8px] text-emerald-400 font-bold uppercase">{isSpeaking ? 'Vocalizing Insights' : 'Maps Connected'}</p>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {chatHistory.map(m => (
                  <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl text-[11px] font-bold ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-300 border border-white/5'}`}>
                      {m.isThinking ? <span className="animate-pulse">Thinking...</span> : m.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                const input = chatInput;
                setChatInput('');
                setChatHistory(prev => [...prev, { id: Date.now().toString(), role: 'user', text: input }, { id: (Date.now()+1).toString(), role: 'model', text: '', isThinking: true }]);
                const res = await spatialChatAgent(input, location);
                setChatHistory(prev => prev.map(m => m.isThinking ? { ...m, text: res.text, sources: res.sources, isThinking: false } : m));
              }} className="p-4 bg-white/5 border-t border-white/5 flex gap-2">
                <button type="button" onClick={() => {
                  const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                  if (R) {
                    const r = new R();
                    r.onstart = () => setIsListening(true);
                    r.onend = () => setIsListening(false);
                    r.onresult = (e: any) => setChatInput(e.results[0][0].transcript);
                    r.start();
                  }
                }} className={`p-3 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40'}`}>
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </button>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Inquire about nodes..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white outline-none focus:border-indigo-500" />
                <button type="submit" className="p-3 bg-indigo-600 text-white rounded-xl font-black text-[9px] px-4">SEND</button>
              </form>
            </div>
          )}
        </div>

        {/* Improved Registration Modal */}
        {isRegistering && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-[4000] flex items-center justify-center p-6 overflow-y-auto">
            <div className="w-full max-w-2xl bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] p-10 space-y-8 animate-in zoom-in-95 shadow-2xl">
              <div className="text-center space-y-2">
                <h2 className="text-sm font-black uppercase text-white tracking-[0.4em]">Node Asset Link</h2>
                <p className="text-[9px] text-white/40 font-black uppercase tracking-widest">Initialization Protocol</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-[8px] text-white/20 uppercase font-black">Entity Identifier</p>
                    <input value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} placeholder="Shop Name" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] text-white/20 uppercase font-black">Cuisine Class</p>
                    <input value={regForm.cuisine} onChange={e => setRegForm({...regForm, cuisine: e.target.value})} placeholder="e.g. South Indian" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] text-white/20 uppercase font-black">Asset Bio</p>
                    <textarea value={regForm.description} onChange={e => setRegForm({...regForm, description: e.target.value})} placeholder="Mission description..." className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white h-24 resize-none outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-[8px] text-white/20 uppercase font-black">Manifest / Menu</p>
                    <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar bg-white/5 border border-white/10 rounded-xl p-3">
                      {regForm.menu.map((m, i) => (
                        <div key={i} className="flex justify-between items-center text-[10px] p-2 bg-white/5 rounded-lg">
                          <span className="text-white font-black uppercase">{m.name}</span>
                          <div className="flex gap-2">
                            <span className="text-emerald-400">₹{m.price}</span>
                            <button onClick={() => removeMenuItem(i)} className="text-red-500/40">✕</button>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2 border-t border-white/10">
                        <input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Item" className="flex-1 bg-transparent text-[10px] outline-none" />
                        <input type="number" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} placeholder="₹" className="w-12 bg-transparent text-[10px] outline-none border-l border-white/10 px-2" />
                        <button onClick={addMenuItem} className="text-emerald-400 text-[10px] font-black uppercase">+</button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-[8px] text-white/20 uppercase font-black">Operational Window</p>
                    <div className="flex gap-3">
                      <select value={regForm.startHour} onChange={e => setRegForm({...regForm, startHour: Number(e.target.value)})} className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] text-white outline-none">
                        {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{i}:00</option>)}
                      </select>
                      <span className="text-white/20 pt-3">to</span>
                      <select value={regForm.endHour} onChange={e => setRegForm({...regForm, endHour: Number(e.target.value)})} className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] text-white outline-none">
                        {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{i}:00</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/10">
                <button onClick={() => setIsRegistering(false)} className="flex-1 py-4 text-[9px] font-black text-white/40 uppercase tracking-widest hover:text-white transition-colors">Abort Link</button>
                <button onClick={handleRegister} className="flex-[2] py-4 bg-indigo-600 text-white text-[11px] font-black rounded-2xl shadow-xl shadow-indigo-500/20 hover:scale-105 transition-all">Finalize Hub Integration</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
