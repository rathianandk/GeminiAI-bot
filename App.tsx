
import React, { useState, useEffect, useRef } from 'react';
import Map from './components/Map';
import { discoveryAgent, spatialAlertAgent, summarizeInTamil, generateVendorBio, spatialChatAgent } from './services/geminiService';
import { Shop, LatLng, AgentLog, VendorStatus, VendorProfile, MenuItem, ChatMessage } from './types';

// Seed Data for "Discovered" Catalog (Legendary Rolling Sirrr / Chennai spots)
const SEED_SHOPS: Shop[] = [
  { 
    id: 'seed-1', 
    name: 'Jannal Kadai', 
    coords: { lat: 13.0336, lng: 80.2697 }, 
    isVendor: false, 
    emoji: '🥘', 
    cuisine: 'Bajjis & Snacks', 
    address: '1, Ponnambala Vadhyar St, Mylapore, Chennai', 
    description: 'மச்சான், மயிலாப்பூர் ஜன்னல் கடையில சுட சுட பஜ்ஜி சாப்பிட்டு இருக்கியா, அந்த ஸ்பைசி சட்னியோட சாப்பிட்டு பார்த்தா வேற லெவல்ல இருக்கும்! அந்த ஜன்னல் வழியா வாங்கி சாப்பிடுற வைபே தனி தான், மிஸ் பண்ணாம ட்ரை பண்ணு நண்பா!' 
  },
  { id: 'seed-2', name: 'Kalathi Rose Milk', coords: { lat: 13.0333, lng: 80.2685 }, isVendor: false, emoji: '🥤', cuisine: 'Rose Milk', address: '27, South Mada Street, Mylapore, Chennai', description: 'Iconic spot for the best Rose Milk in the city since decades.' },
  { id: 'seed-3', name: 'Burmese Atho Stall', coords: { lat: 13.0900, lng: 80.2900 }, isVendor: false, emoji: '🍜', cuisine: 'Burmese Atho', address: 'Beach Station Road, Parrys, North Chennai', description: 'Signature North Chennai Atho and Mohinga. A must-visit for street food lovers.' },
];

// Seed Data for Partner Fleet (Pre-registered Vendors)
const SEED_PROFILES: VendorProfile[] = [
  {
    id: 'profile-1',
    name: "Mamu's Biryani",
    emoji: '🍗',
    cuisine: 'Bhai Biryani',
    description: 'Legacy wood-fired biryani from the heart of Triplicane. Vera level taste machan!',
    lastLocation: { lat: 13.0585, lng: 80.2730 },
    menu: [{ name: 'Mutton Biryani', price: 250 }, { name: 'Chicken 65', price: 120 }, { name: 'Bread Halwa', price: 40 }]
  },
  {
    id: 'profile-2',
    name: 'Sowcarpet Lassi Wala',
    emoji: '🥛',
    cuisine: 'Thick Lassi',
    description: 'The thickest malai lassi in Chennai. One glass and you are done for the day!',
    lastLocation: { lat: 13.0940, lng: 80.2825 },
    menu: [{ name: 'Kesar Lassi', price: 80 }, { name: 'Sweet Lassi', price: 60 }, { name: 'Dry Fruit Lassi', price: 110 }]
  }
];

interface Notification {
  id: string;
  title: string;
  message: string;
  emoji: string;
  coords: LatLng;
  shopId: string;
}

// Audio Helpers
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
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [location, setLocation] = useState<LatLng>({ lat: 13.0827, lng: 80.2707 });
  const [userMode, setUserMode] = useState<'explorer' | 'vendor'>('explorer');
  const [explorerTab, setExplorerTab] = useState<'logs' | 'discovered'>('discovered');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'Namaste! I am your GeoMind assistant. Ask me anything about food or landmarks around the map marker.' }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Vendor Specific State
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
      address: 'Registered Static Node',
      description: p.description,
      menu: p.menu
    }));

    setShops(prev => {
      const discovered = prev.filter(s => !s.id.startsWith('profile-') && !s.id.startsWith('live-'));
      return [...discovered, ...profileShops];
    });
  }, [myProfiles]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const addLog = (agent: AgentLog['agent'], message: string, status: AgentLog['status'] = 'processing') => {
    setLogs(prev => [{ id: Math.random().toString(), agent, message, status }, ...prev.slice(0, 15)]);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput };
    const loadingMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: '', isThinking: true };
    
    setChatHistory(prev => [...prev, userMsg, loadingMsg]);
    setChatInput('');

    const result = await spatialChatAgent(chatInput, location);
    
    setChatHistory(prev => prev.map(msg => 
      msg.id === loadingMsg.id 
      ? { ...msg, text: result.text, sources: result.sources, isThinking: false } 
      : msg
    ));
  };

  const handleGenerateBio = async () => {
    if (!regForm.name || !regForm.cuisine) {
      alert("Please enter a Shop Name and Cuisine Type first.");
      return;
    }
    setIsGeneratingBio(true);
    const bio = await generateVendorBio(regForm.name, regForm.cuisine);
    setRegForm(prev => ({ ...prev, description: bio }));
    setIsGeneratingBio(false);
  };

  const handleShopSelect = async (shop: Shop) => {
    setActiveShop(shop);
    setLocation(shop.coords);
    addLog('Linguistic', `Synthesizing Tamil audio summary for: ${shop.name}...`);
    const { tamilText, englishText, audioData } = await summarizeInTamil(shop);
    addLog('Linguistic', `${tamilText}\n\nTranslation: ${englishText}`, 'resolved');
    if (audioData) playPCM(audioData);
  };

  const handleRegister = () => {
    if (!regForm.name) return;
    const newProfile: VendorProfile = {
      id: `profile-${Date.now()}`,
      name: regForm.name,
      emoji: regForm.emoji,
      cuisine: regForm.cuisine,
      description: regForm.description || `A legendary ${regForm.cuisine} spot registered on GeoMind.`,
      lastLocation: location,
      menu: regForm.menu
    };
    setMyProfiles(prev => [...prev, newProfile]);
    setRegForm({ name: '', cuisine: '', emoji: '🥘', description: '', menu: [] });
    setNewItem({ name: '', price: '' });
    setIsRegistering(false);
    setActiveProfileId(newProfile.id);
  };

  const addMenuItem = () => {
    if (!newItem.name || !newItem.price) return;
    setRegForm(prev => ({
      ...prev,
      menu: [...prev.menu, { name: newItem.name, price: Number(newItem.price) }]
    }));
    setNewItem({ name: '', price: '' });
  };

  const removeMenuItem = (index: number) => {
    setRegForm(prev => ({
      ...prev,
      menu: prev.menu.filter((_, i) => i !== index)
    }));
  };

  const handleDeleteProfile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Permanently unregister this node from the grid?')) {
      setMyProfiles(prev => prev.filter(p => p.id !== id));
      if (activeProfileId === id) setActiveProfileId(null);
    }
  };

  const handleBroadcastLive = async () => {
    const profile = myProfiles.find(p => p.id === activeProfileId);
    if (!profile) return;
    addLog('Spatial', `Broadcasting live position for ${profile.name}...`);
    const alert = await spatialAlertAgent(profile.name, location);
    addLog('Linguistic', `${alert.tamilSummary}\n\nTranslation: ${alert.englishSummary}`, 'resolved');
    if (alert.audioData) playPCM(alert.audioData);
    
    const liveShop: Shop = {
      id: `live-${profile.id}`,
      name: profile.name,
      coords: location,
      isVendor: true,
      status: VendorStatus.ONLINE,
      emoji: profile.emoji,
      cuisine: profile.cuisine,
      address: `Current Live Vendor Position @ ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
      description: alert.tamilSummary,
      menu: profile.menu
    };

    setShops(prev => {
      const filtered = prev.filter(s => s.id !== liveShop.id && s.id !== profile.id);
      return [liveShop, ...filtered];
    });

    const newNotif: Notification = {
      id: Math.random().toString(),
      title: "LIVE BROADCAST DETECTED",
      message: `${profile.name} is now LIVE at a new location!`,
      emoji: profile.emoji,
      coords: location,
      shopId: liveShop.id
    };
    setNotifications(prev => [newNotif, ...prev]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotif.id));
    }, 10000);
    addLog('Spatial', 'Live node anchored to spatial grid.', 'resolved');
  };

  const handleNotifClick = (notif: Notification) => {
    const shop = shops.find(s => s.id === notif.shopId);
    if (shop) handleShopSelect(shop);
    else setLocation(notif.coords);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    if (userMode !== 'explorer') setUserMode('explorer');
  };

  const activeProfile = myProfiles.find(p => p.id === activeProfileId);
  const discoveredShops = shops.filter(s => !s.isVendor);

  return (
    <div className="flex h-screen w-screen bg-[#020202] text-slate-300 font-mono overflow-hidden">
      {/* Real-time Explorer Notifications */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[3000] flex flex-col gap-3 pointer-events-none">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className="w-80 bg-black/90 backdrop-blur-xl border border-emerald-500/50 rounded-2xl p-4 shadow-2xl shadow-emerald-500/20 animate-in slide-in-from-top-5 pointer-events-auto cursor-pointer group"
            onClick={() => handleNotifClick(n)}
          >
            <div className="flex gap-4 items-start">
              <div className="text-3xl bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">{n.emoji}</div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">{n.title}</p>
                <p className="text-[11px] font-bold text-white mb-2 leading-tight">{n.message}</p>
                <button className="text-[8px] font-black text-indigo-400 uppercase tracking-widest group-hover:underline">View On Map ➔</button>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setNotifications(prev => prev.filter(notif => notif.id !== n.id)); }} className="text-white/20 hover:text-white">✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Floating Chat Interface */}
      <div className={`fixed bottom-6 right-6 z-[2500] transition-all duration-500 ${isChatOpen ? 'w-[400px] h-[600px]' : 'w-16 h-16'}`}>
        {!isChatOpen ? (
          <button 
            onClick={() => setIsChatOpen(true)}
            className="w-full h-full bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform animate-bounce"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </button>
        ) : (
          <div className="w-full h-full bg-black/80 backdrop-blur-2xl rounded-[2rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-white/5 border-b border-white/5 flex justify-between items-center">
              <div>
                <h3 className="text-[10px] font-black uppercase text-white tracking-[0.3em]">GEOMIND: MIND</h3>
                <p className="text-[8px] text-indigo-400 font-bold uppercase tracking-widest mt-1">Grounding Activated</p>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-white/40 hover:text-white">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {chatHistory.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-xs font-bold leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white/5 text-slate-300 border border-white/5 rounded-tl-none'}`}>
                    {msg.isThinking ? (
                      <div className="flex gap-1 items-center py-2">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                      </div>
                    ) : msg.text}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      <p className="text-[7px] font-black text-white/30 uppercase tracking-widest mb-1">MANDATORY CITATIONS:</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.sources.map((s, i) => (
                          <a key={i} href={s.uri} target="_blank" className="text-[8px] font-black text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 px-2 py-1 rounded hover:bg-emerald-500/10 transition-all uppercase truncate max-w-[150px]">
                            📍 {s.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white/5 border-t border-white/5 flex gap-2">
              <input 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about nearby spots..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold outline-none focus:border-indigo-500 transition-all text-white"
              />
              <button type="submit" className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Sidebar: Action Hub */}
      <div className="w-[450px] border-r border-white/5 bg-[#080808] flex flex-col z-20">
        <div className="p-8 border-b border-white/5 bg-gradient-to-b from-indigo-500/10 to-transparent">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-sm font-black tracking-[0.4em] uppercase text-white">GEOMIND: ACTION</h1>
            <div className="flex gap-2">
              <button onClick={() => setUserMode('explorer')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${userMode === 'explorer' ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]' : 'bg-white/5 text-white/40'}`}>Explorer</button>
              <button onClick={() => setUserMode('vendor')} className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${userMode === 'vendor' ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-white/5 text-white/40'}`}>Partner Hub</button>
            </div>
          </div>

          {userMode === 'explorer' ? (
            <div className="space-y-4">
              <button 
                onClick={() => discoveryAgent("Rolling Sirrr recommendations Chennai").then(res => setShops(prev => [...prev, ...res.shops]))}
                disabled={isMining}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-xl shadow-indigo-500/20"
              >
                Deep Mine Vlogger Data
              </button>
              <div className="flex gap-1 bg-white/5 p-1 rounded-lg">
                <button onClick={() => setExplorerTab('logs')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${explorerTab === 'logs' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}>Agent Logs</button>
                <button onClick={() => setExplorerTab('discovered')} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-md transition-all ${explorerTab === 'discovered' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}>Scrapped Data ({discoveredShops.length})</button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {activeProfileId ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{activeProfile?.emoji}</span>
                      <div>
                        <p className="text-[10px] font-black text-white uppercase">{activeProfile?.name}</p>
                        <p className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">{activeProfile?.cuisine}</p>
                      </div>
                    </div>
                    <button onClick={() => setActiveProfileId(null)} className="text-[8px] font-black text-white/40 hover:text-white uppercase px-2 py-1 bg-white/5 rounded">Exit Dash</button>
                  </div>
                  <button onClick={handleBroadcastLive} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-xl shadow-emerald-500/20">🚀 BROADCAST LIVE POSITION</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">Partner Infrastructure</h3>
                  <button onClick={() => setIsRegistering(true)} className="w-full py-4 bg-white/5 border border-dashed border-white/20 hover:border-indigo-500/50 text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all">+ Register New Street Node</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-black/40">
          {userMode === 'explorer' && explorerTab === 'discovered' ? (
            <div className="space-y-3">
              {discoveredShops.map(shop => (
                <button key={shop.id} onClick={() => handleShopSelect(shop)} className={`w-full p-4 rounded-xl border transition-all text-left group ${activeShop?.id === shop.id ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-white/5 border-white/5 hover:border-white/20'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-lg">{shop.emoji}</span>
                    <span className="text-[8px] font-black text-indigo-400 uppercase">{shop.cuisine}</span>
                  </div>
                  <p className="text-[11px] font-black text-white mb-1 uppercase tracking-wider">{shop.name}</p>
                  <p className="text-[8px] text-indigo-400/80 mb-2 uppercase font-black">{shop.address}</p>
                  <p className="text-[9px] text-slate-500 line-clamp-2">{shop.description}</p>
                </button>
              ))}
            </div>
          ) : userMode === 'vendor' && !activeProfileId ? (
            <div className="space-y-4">
              {myProfiles.map(profile => (
                <div key={profile.id} onClick={() => setActiveProfileId(profile.id)} className="w-full p-5 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-2xl">{profile.emoji}</div>
                    <div>
                      <p className="text-[11px] font-black text-white uppercase tracking-wider">{profile.name}</p>
                      <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">{profile.cuisine}</p>
                    </div>
                  </div>
                  <button onClick={(e) => handleDeleteProfile(e, profile.id)} className="p-2 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all text-white/20"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map(log => (
                <div key={log.id} className="p-4 rounded-xl border border-white/5 bg-[#0a0a0a] animate-in slide-in-from-left-2 duration-300">
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${log.agent === 'Discovery' ? 'bg-blue-500/10 text-blue-400' : log.agent === 'Spatial' ? 'bg-purple-500/10 text-purple-400' : 'bg-amber-500/10 text-amber-400'}`}>{log.agent} Agent</span>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 leading-relaxed whitespace-pre-line">{log.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        <Map center={location} shops={shops} onLocationChange={setLocation} onShopClick={handleShopSelect} />
        
        {isRegistering && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-[2000] flex items-center justify-center p-6 overflow-y-auto">
            <div className="w-full max-w-md bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 my-10">
              <div className="p-8 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <h2 className="text-xs font-black uppercase tracking-[0.4em] text-white">Node Registration</h2>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <input value={regForm.name} onChange={e => setRegForm({...regForm, name: e.target.value})} placeholder="Shop Name" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-bold text-white outline-none focus:border-indigo-500 transition-all" />
                  <input value={regForm.cuisine} onChange={e => setRegForm({...regForm, cuisine: e.target.value})} placeholder="Cuisine Type" className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-bold text-white outline-none focus:border-indigo-500 transition-all" />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[9px] font-black uppercase text-white/40">Shop Bio</label>
                    <button 
                      onClick={handleGenerateBio} 
                      disabled={isGeneratingBio}
                      className="text-[8px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1 group"
                    >
                      {isGeneratingBio ? (
                        <div className="flex gap-0.5">
                          <div className="w-0.5 h-2 bg-indigo-400 animate-pulse"></div>
                          <div className="w-0.5 h-2 bg-indigo-400 animate-pulse delay-75"></div>
                          <div className="w-0.5 h-2 bg-indigo-400 animate-pulse delay-150"></div>
                        </div>
                      ) : "✨ AI Generate"}
                    </button>
                  </div>
                  <textarea 
                    value={regForm.description} 
                    onChange={e => setRegForm({...regForm, description: e.target.value})} 
                    placeholder="Tell your story or use AI to generate..." 
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-bold text-white h-24 resize-none outline-none focus:border-indigo-500 transition-all" 
                  />
                </div>
                <div className="space-y-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="flex gap-2">
                    <input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Item Name" className="flex-1 bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] text-white" />
                    <input value={newItem.price} type="number" onChange={e => setNewItem({...newItem, price: e.target.value})} placeholder="₹" className="w-20 bg-white/5 border border-white/10 rounded-lg p-3 text-[10px] text-white" />
                    <button onClick={addMenuItem} className="px-4 bg-indigo-600 text-white text-[10px] font-black rounded-lg">ADD</button>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-2">
                    {regForm.menu.map((item, i) => (
                      <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-white/5 text-[9px] font-bold border border-white/5">
                        <span className="text-white uppercase">{item.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-400">₹{item.price}</span>
                          <button onClick={() => removeMenuItem(i)} className="text-red-500/50 hover:text-red-500">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsRegistering(false)} className="flex-1 py-4 text-[9px] font-black uppercase text-white/40 hover:text-white transition-all">Cancel</button>
                  <button onClick={handleRegister} className="flex-[2] py-4 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-500/20">Finalize Link</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeShop && (
          <div className="absolute bottom-10 left-10 right-10 z-[1000] animate-in slide-in-from-bottom-5 duration-500">
            <div className="max-w-4xl mx-auto bg-black/90 backdrop-blur-3xl p-8 rounded-[2rem] border border-white/10 shadow-2xl flex gap-8">
              <div className="text-6xl flex-shrink-0">{activeShop.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-4">
                  <div className="min-w-0">
                    <h3 className="text-xl font-black text-white truncate">{activeShop.name}</h3>
                    <div className="flex gap-2 items-center mt-1">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{activeShop.cuisine || 'Legendary Discovery'}</p>
                      <span className="text-white/20">•</span>
                      <p className="text-[10px] font-black text-white/60 uppercase tracking-widest truncate">{activeShop.address || 'Chennai'}</p>
                    </div>
                  </div>
                  <button onClick={() => setActiveShop(null)} className="text-white/30 hover:text-white ml-4">✕</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <p className="text-sm text-slate-400 leading-relaxed mb-6">{activeShop.description}</p>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${activeShop.coords.lat},${activeShop.coords.lng}`} target="_blank" className="inline-block px-6 py-3 bg-white text-black text-[10px] font-black uppercase rounded-lg hover:scale-105 transition-all">Nav Logic</a>
                  </div>
                  {activeShop.menu && activeShop.menu.length > 0 && (
                    <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">Available Ration / Menu</h4>
                      <div className="flex flex-wrap gap-2">
                        {activeShop.menu.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-[#111] border border-white/10 rounded-lg px-3 py-2">
                            <span className="text-[10px] font-bold text-slate-300 uppercase">{item.name}</span>
                            <div className="h-4 w-px bg-white/10"></div>
                            <span className="text-[10px] font-black text-emerald-400">₹{item.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
}
