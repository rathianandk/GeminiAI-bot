
import React, { useState, useEffect, useRef } from 'react';
import Map from './components/Map';
import { discoveryAgent, spatialAlertAgent, summarizeInTamil, generateVendorBio, spatialChatAgent } from './services/geminiService';
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
    menu: [{ name: 'Mutton Biryani', price: 250 }, { name: 'Chicken 65', price: 120 }] 
  }
];

interface Notification { id: string; title: string; message: string; emoji: string; coords: LatLng; shopId: string; }

// Audio decoding
function decodeBase64(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function playPCM(base64: string) {
  if (!base64) return;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const bytes = decodeBase64(base64);
  const int16 = new Int16Array(bytes.buffer);
  const buffer = audioCtx.createBuffer(1, int16.length, 24000);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < int16.length; i++) data[i] = int16[i] / 32768.0;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start();
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

  // Chat & Voice State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'Namaste! I am your GeoMind assistant. Ask me anything about food or landmarks. You can also use voice input!' }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Vendor State
  const [myProfiles, setMyProfiles] = useState<VendorProfile[]>(() => {
    const saved = localStorage.getItem('geomind_profiles');
    return saved ? JSON.parse(saved) : SEED_PROFILES;
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [regForm, setRegForm] = useState({ name: '', cuisine: '', emoji: '🥘', description: '', menu: [] as MenuItem[] });
  const [newItem, setNewItem] = useState({ name: '', price: '' });
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);

  useEffect(() => {
    localStorage.setItem('geomind_profiles', JSON.stringify(myProfiles));
    const profileShops: Shop[] = myProfiles.map(p => ({
      id: p.id,
      name: p.name,
      coords: p.lastLocation || location,
      isVendor: true,
      status: VendorStatus.OFFLINE,
      emoji: p.emoji,
      cuisine: p.cuisine,
      address: 'Registered Node',
      description: p.description,
      menu: p.menu
    }));
    
    setShops(prev => {
      const discovered = prev.filter(s => !s.isVendor);
      const liveVendors = prev.filter(s => s.isVendor && s.status === VendorStatus.ONLINE);
      const baseVendors = profileShops.filter(ps => !liveVendors.some(lv => lv.id === `live-${ps.id}`));
      return [...discovered, ...liveVendors, ...baseVendors];
    });
  }, [myProfiles]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const addLog = (agent: AgentLog['agent'], message: string, status: AgentLog['status'] = 'processing') => {
    setLogs(prev => [{ id: Math.random().toString(), agent, message, status }, ...prev.slice(0, 15)]);
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => setChatInput(event.results[0][0].transcript);
    recognition.start();
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput };
    const loadingMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: '', isThinking: true };
    setChatHistory(prev => [...prev, userMsg, loadingMsg]);
    const input = chatInput;
    setChatInput('');
    const result = await spatialChatAgent(input, location);
    setChatHistory(prev => prev.map(msg => msg.id === loadingMsg.id ? { ...msg, text: result.text, sources: result.sources, isThinking: false } : msg));
  };

  const startDiscovery = async () => {
    setIsMining(true);
    setExplorerTab('logs');
    addLog('Discovery', 'Mining spatial nodes...');
    const result = await discoveryAgent("Legendary street food Chennai");
    setShops(prev => [...prev, ...result.shops]);
    setDiscoverySources(result.sources);
    result.logs.forEach(msg => addLog('Discovery', msg, 'resolved'));
    setIsMining(false);
  };

  const handleGenerateBio = async () => {
    if (!regForm.name || !regForm.cuisine) return;
    setIsGeneratingBio(true);
    const bio = await generateVendorBio(regForm.name, regForm.cuisine);
    setRegForm(prev => ({ ...prev, description: bio }));
    setIsGeneratingBio(false);
  };

  const handleShopSelect = async (shop: Shop) => {
    setActiveShop(shop);
    setLocation(shop.coords);
    const { tamilText, englishText, audioData } = await summarizeInTamil(shop);
    addLog('Linguistic', `${tamilText}\n\n${englishText}`, 'resolved');
    if (audioData) playPCM(audioData);
  };

  const handleNotifClick = (n: Notification) => {
    const shop = shops.find(s => s.id === n.shopId);
    if (shop) handleShopSelect(shop);
  };

  const handleRegister = () => {
    const newProfile: VendorProfile = { 
      id: `profile-${Date.now()}`, 
      name: regForm.name, 
      emoji: regForm.emoji, 
      cuisine: regForm.cuisine, 
      description: regForm.description, 
      lastLocation: location, 
      menu: regForm.menu 
    };
    setMyProfiles(prev => [...prev, newProfile]);
    setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', menu: [] });
    setNewItem({ name: '', price: '' });
    setIsRegistering(false);
    setActiveProfileId(newProfile.id);
  };

  const handleAddItemToReg = () => {
    if (!newItem.name || !newItem.price) return;
    setRegForm(prev => ({
      ...prev,
      menu: [...prev.menu, { name: newItem.name, price: Number(newItem.price) }]
    }));
    setNewItem({ name: '', price: '' });
  };

  const handleRemoveItemFromReg = (index: number) => {
    setRegForm(prev => ({
      ...prev,
      menu: prev.menu.filter((_, i) => i !== index)
    }));
  };

  const handleAddItemToActiveProfile = () => {
    if (!activeProfileId || !newItem.name || !newItem.price) return;
    setMyProfiles(prev => prev.map(p => {
      if (p.id === activeProfileId) {
        return { ...p, menu: [...p.menu, { name: newItem.name, price: Number(newItem.price) }] };
      }
      return p;
    }));
    setNewItem({ name: '', price: '' });
  };

  const handleRemoveItemFromActiveProfile = (index: number) => {
    if (!activeProfileId) return;
    setMyProfiles(prev => prev.map(p => {
      if (p.id === activeProfileId) {
        return { ...p, menu: p.menu.filter((_, i) => i !== index) };
      }
      return p;
    }));
  };

  const handleBroadcastLive = async () => {
    const profile = myProfiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    addLog('Spatial', `Broadcasting live signal...`);
    const alert = await spatialAlertAgent(profile.name, location);
    if (alert.audioData) playPCM(alert.audioData);
    
    const liveShop: Shop = { 
      id: `live-${profile.id}`, 
      name: profile.name, 
      coords: location, 
      isVendor: true, 
      status: VendorStatus.ONLINE, 
      emoji: profile.emoji, 
      cuisine: profile.cuisine, 
      address: `LIVE POS @ ${location.lat.toFixed(4)}`, 
      description: alert.tamilSummary, 
      menu: profile.menu 
    };
    setShops(prev => [liveShop, ...prev.filter(s => s.id !== liveShop.id && s.id !== profile.id)]);

    const newNotif: Notification = { id: Math.random().toString(), title: "LIVE BROADCAST", message: `${profile.name} is LIVE!`, emoji: profile.emoji, coords: location, shopId: liveShop.id };
    setNotifications(prev => [newNotif, ...prev]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotif.id)), 10000);
  };

  const handleDeleteProfile = (id: string) => {
    if (confirm("Unregister node?")) {
      setMyProfiles(prev => prev.filter(p => p.id !== id));
      setShops(prev => prev.filter(s => !s.id.includes(id)));
      if (activeProfileId === id) setActiveProfileId(null);
    }
  };

  const activeProfile = myProfiles.find(p => p.id === activeProfileId);
  const discoveredShops = shops.filter(s => !s.isVendor);
  const vendorShops = shops.filter(s => s.isVendor);

  return (
    <div className="flex h-screen w-screen bg-[#020202] text-slate-300 font-mono overflow-hidden">
      {/* Explorer Notifications */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-3 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="w-80 bg-black/90 backdrop-blur-xl border border-emerald-500/50 rounded-2xl p-4 shadow-2xl pointer-events-auto cursor-pointer animate-in slide-in-from-top-5" onClick={() => handleNotifClick(n)}>
            <div className="flex gap-4">
              <div className="text-3xl bg-emerald-500/10 p-2 rounded-xl">{n.emoji}</div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-emerald-400 uppercase">SIGNAL DETECTED</p>
                <p className="text-[11px] font-bold text-white leading-tight">{n.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mind Chatbot */}
      <div className={`fixed bottom-6 right-6 z-[2500] transition-all duration-500 ${isChatOpen ? 'w-[400px] h-[600px]' : 'w-16 h-16'}`}>
        {!isChatOpen ? (
          <button onClick={() => setIsChatOpen(true)} className="w-full h-full bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </button>
        ) : (
          <div className="w-full h-full bg-[#080808] border border-white/10 rounded-[2rem] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-white/5 border-b border-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-[10px] font-black uppercase text-white tracking-[0.3em]">GEOMIND: VOICE</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest">Maps Verified</p>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {chatHistory.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-bold ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-300 border border-white/5'}`}>
                    {msg.isThinking ? <div className="flex gap-1 py-1"><div className="w-1 h-1 bg-white/50 rounded-full animate-bounce"></div><div className="w-1 h-1 bg-white/50 rounded-full animate-bounce delay-75"></div><div className="w-1 h-1 bg-white/50 rounded-full animate-bounce delay-150"></div></div> : msg.text}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.sources.map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" className="text-[7px] font-black text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 px-2 py-1 rounded truncate max-w-[120px]">📍 {s.title}</a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 bg-white/5 border-t border-white/5 flex gap-2">
              <button type="button" onClick={startVoiceInput} className={`p-3 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-white/40 hover:text-white'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </button>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type or speak..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white outline-none focus:border-indigo-500" />
              <button type="submit" className="p-3 bg-indigo-600 text-white rounded-xl"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></button>
            </form>
          </div>
        )}
      </div>

      {/* Action Hub Sidebar */}
      <div className="w-[450px] border-r border-white/5 bg-[#080808] flex flex-col z-20">
        <div className="p-8 border-b border-white/5 bg-gradient-to-b from-indigo-500/10 to-transparent">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-sm font-black tracking-[0.4em] text-white">GEOMIND: CORE</h1>
            <div className="flex gap-2">
              <button onClick={() => setUserMode('explorer')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${userMode === 'explorer' ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]' : 'bg-white/5 text-white/40'}`}>Explorer</button>
              <button onClick={() => setUserMode('vendor')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${userMode === 'vendor' ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-white/40'}`}>Partner Hub</button>
            </div>
          </div>
          {userMode === 'explorer' ? (
            <div className="space-y-4">
              <button onClick={startDiscovery} disabled={isMining} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-xl shadow-indigo-500/20">{isMining ? 'Syncing Spatial Hub...' : 'Run Global Food Discovery'}</button>
              <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                <button onClick={() => setExplorerTab('logs')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${explorerTab === 'logs' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Intelligence</button>
                <button onClick={() => setExplorerTab('discovered')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${explorerTab === 'discovered' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Nodes ({discoveredShops.length})</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeProfileId ? (
                <div className="space-y-4 animate-in slide-in-from-top-2">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{activeProfile?.emoji}</span>
                      <div>
                        <p className="text-[10px] font-black text-white uppercase">{activeProfile?.name}</p>
                        <p className="text-[7px] text-emerald-400 font-black uppercase">Active Management</p>
                      </div>
                    </div>
                    <button onClick={() => setActiveProfileId(null)} className="text-[8px] font-black text-white/40 uppercase px-2 py-1 bg-white/5 rounded">Exit Hub</button>
                  </div>
                  <button onClick={handleBroadcastLive} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl shadow-xl shadow-emerald-500/20">🚀 BROADCAST LIVE SIGNAL</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">Partner Infrastructure</h3>
                  <button onClick={() => setIsRegistering(true)} className="w-full py-4 bg-white/5 border border-dashed border-white/20 text-indigo-400 text-[10px] font-black uppercase hover:border-indigo-500/50 transition-all">+ Register Fleet Member</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {userMode === 'explorer' && explorerTab === 'logs' ? (
            <div className="space-y-4">
              {discoverySources.length > 0 && (
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <h4 className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-3">Verified Discovery Sources</h4>
                  <div className="space-y-2">
                    {discoverySources.map((s, i) => (
                      <a key={i} href={s.uri} target="_blank" className="block text-[8px] text-white/60 hover:text-white truncate">🔗 {s.title}</a>
                    ))}
                  </div>
                </div>
              )}
              {logs.map(log => (
                <div key={log.id} className="p-4 rounded-xl border border-white/5 bg-[#0a0a0a]">
                  <span className={`text-[7px] font-black px-2 py-0.5 rounded uppercase ${log.agent === 'Discovery' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>{log.agent}</span>
                  <p className="text-[9px] font-bold text-slate-400 mt-2 leading-relaxed whitespace-pre-line">{log.message}</p>
                </div>
              ))}
            </div>
          ) : userMode === 'explorer' && explorerTab === 'discovered' ? (
            <div className="space-y-3">
              {discoveredShops.map(shop => (
                <button key={shop.id} onClick={() => handleShopSelect(shop)} className={`w-full p-4 rounded-xl border transition-all text-left group ${activeShop?.id === shop.id ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-white/5 border-white/5 hover:border-white/20'}`}>
                  <p className="text-[10px] font-black text-white uppercase group-hover:text-indigo-400 transition-colors">{shop.name}</p>
                  <p className="text-[8px] text-indigo-400/60 font-black uppercase mt-1">{shop.cuisine}</p>
                </button>
              ))}
            </div>
          ) : userMode === 'vendor' && !activeProfileId ? (
            <div className="space-y-4">
              <h4 className="text-[8px] font-black uppercase text-white/40 tracking-widest mb-1">Registered Vendor Hub</h4>
              {vendorShops.length === 0 ? (
                <p className="text-[10px] text-white/20 italic">No nodes detected.</p>
              ) : (
                vendorShops.map(shop => {
                  const profileId = shop.id.startsWith('live-') ? shop.id.replace('live-', '') : shop.id;
                  const isOnline = shop.status === VendorStatus.ONLINE;
                  return (
                    <div key={shop.id} className="w-full p-4 rounded-xl border border-white/5 bg-white/5 flex items-center justify-between group hover:border-emerald-500/40 transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl drop-shadow-lg">{shop.emoji}</span>
                        <div>
                          <p className="text-[11px] font-black text-white uppercase tracking-wider">{shop.name}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className={`w-1 h-1 rounded-full ${isOnline ? 'bg-emerald-500 animate-ping' : 'bg-white/10'}`}></div>
                            <div className={`w-1 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-white/10'}`}></div>
                            <div className={`w-1 h-3 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-white/10'}`}></div>
                            <p className="text-[7px] font-black text-white/40 ml-1 uppercase">{isOnline ? 'LIVE SYNC' : 'OFFLINE'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setActiveProfileId(profileId)} 
                          className="px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white text-[8px] font-black uppercase rounded border border-indigo-500/20 transition-all opacity-0 group-hover:opacity-100"
                        >
                          Manage
                        </button>
                        <button 
                          onClick={() => handleDeleteProfile(profileId)} 
                          className="p-1.5 text-white/10 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : userMode === 'vendor' && activeProfileId ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-[8px] font-black uppercase text-white/40 tracking-widest">Live Menu Management</h4>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                  <div className="flex gap-2">
                    <input 
                      value={newItem.name} 
                      onChange={e => setNewItem({...newItem, name: e.target.value})} 
                      placeholder="Item Name (e.g. Masala Dosa)" 
                      className="flex-[2] bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] text-white outline-none focus:border-indigo-500" 
                    />
                    <input 
                      value={newItem.price} 
                      onChange={e => setNewItem({...newItem, price: e.target.value})} 
                      placeholder="₹ Price" 
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] text-white outline-none focus:border-indigo-500" 
                    />
                    <button 
                      onClick={handleAddItemToActiveProfile} 
                      className="bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {activeProfile?.menu.length === 0 ? (
                      <p className="text-[9px] text-white/20 italic text-center py-4">No menu items active.</p>
                    ) : (
                      activeProfile?.menu.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-lg group">
                          <div>
                            <p className="text-[10px] font-black text-white uppercase">{item.name}</p>
                            <p className="text-[9px] text-indigo-400 font-bold tracking-widest">₹{item.price}</p>
                          </div>
                          <button 
                            onClick={() => handleRemoveItemFromActiveProfile(idx)} 
                            className="text-white/10 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 relative">
        <Map center={location} shops={shops} onLocationChange={setLocation} onShopClick={handleShopSelect} />
        
        {isRegistering && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-[2000] flex items-center justify-center p-6 overflow-y-auto">
            <div className="w-full max-w-lg bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] p-8 space-y-6 animate-in zoom-in-95 my-auto">
              <h2 className="text-xs font-black uppercase text-white tracking-[0.3em] text-center">Node Link Initialization</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-white/40 uppercase">Identity</label>
                  <input value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} placeholder="Shop Name" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-white/40 uppercase">Domain</label>
                  <input value={regForm.cuisine} onChange={e => setRegForm({...regForm, cuisine: e.target.value})} placeholder="Cuisine Type" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500 transition-all" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[8px] font-black text-white/40 uppercase">Spatial Bio</label>
                  <button onClick={handleGenerateBio} disabled={isGeneratingBio} className="text-[8px] font-black text-indigo-400">
                    {isGeneratingBio ? "GENERATING..." : "✨ AI AUTOGEN"}
                  </button>
                </div>
                <textarea value={regForm.description} onChange={e => setRegForm({...regForm, description: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white h-20 resize-none outline-none focus:border-indigo-500" />
              </div>

              <div className="space-y-3">
                <label className="text-[8px] font-black text-white/40 uppercase">Initial Menu Configuration</label>
                <div className="flex gap-2">
                  <input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Item" className="flex-[2] bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500" />
                  <input value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} placeholder="₹" className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500" />
                  <button onClick={handleAddItemToReg} className="bg-white/5 hover:bg-white/10 text-white p-3 rounded-xl border border-white/10"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg></button>
                </div>
                <div className="space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar">
                  {regForm.menu.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="text-[10px] text-white font-black uppercase">{item.name} <span className="text-indigo-400 ml-2">₹{item.price}</span></span>
                      <button onClick={() => handleRemoveItemFromReg(idx)} className="text-white/20 hover:text-red-500">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/5">
                <button onClick={() => setIsRegistering(false)} className="flex-1 py-4 text-[9px] font-black text-white/40 uppercase hover:text-white transition-all">Abort</button>
                <button onClick={handleRegister} className="flex-[2] py-4 bg-indigo-600 text-white text-[10px] font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20">Link Profile</button>
              </div>
            </div>
          </div>
        )}

        {activeShop && (
          <div className="absolute bottom-10 left-10 right-10 z-[1000] animate-in slide-in-from-bottom-5">
            <div className="max-w-5xl mx-auto bg-black/90 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row gap-8">
              <div className="text-7xl flex-shrink-0 flex items-center justify-center bg-white/5 p-6 rounded-3xl border border-white/5">{activeShop.emoji}</div>
              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-black text-white tracking-tight truncate">{activeShop.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">{activeShop.cuisine}</p>
                      {activeShop.isVendor && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-[8px] font-black text-emerald-400 uppercase">Verified Vendor</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setActiveShop(null)} className="p-2 text-white/30 hover:text-white transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">{activeShop.description}</p>
                
                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end pt-2">
                  <div className="flex-1 space-y-3">
                    {activeShop.menu && activeShop.menu.length > 0 && (
                      <>
                        <h4 className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Signature Menu</h4>
                        <div className="flex flex-wrap gap-2">
                          {activeShop.menu.map((item, idx) => (
                            <div key={idx} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg flex items-center gap-3">
                              <span className="text-[10px] font-black text-white uppercase">{item.name}</span>
                              <span className="text-[9px] font-black text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded">₹{item.price}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeShop.coords.lat},${activeShop.coords.lng}`} target="_blank" className="flex-shrink-0 px-8 py-4 bg-white text-black text-[11px] font-black uppercase rounded-2xl hover:bg-slate-200 transition-all hover:scale-[1.02] shadow-xl shadow-white/10">Navigate Node</a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
