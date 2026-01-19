
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Map from './components/Map';
import { askGemini } from './services/geminiService';
import { Message, ModelType, LatLng, Shop, MenuItem } from './types';

const ROLLING_SIRRR_TRAIL: Shop[] = [
  { id: '201', name: 'Eshwari Mess', address: 'Nagamalaipudukottai, Madurai', coords: { lat: 9.9212, lng: 78.0436 } },
  { id: '202', name: 'Amma Mess', address: '80, Alagar Kovil Main Rd, Madurai', coords: { lat: 9.9382, lng: 78.1396 } },
  { id: '203', name: 'Sree Sabareesh', address: 'West Perumal Maistry Street, Madurai', coords: { lat: 9.9192, lng: 78.1146 } },
  { id: '210', name: 'Hotel Sangam', address: 'Collector\'s Office Road, Trichy', coords: { lat: 10.8042, lng: 78.6836 } },
  { id: '214', name: 'Hotel Kannappa', address: 'Anna Nagar, Thennur, Trichy', coords: { lat: 10.8242, lng: 78.6946 } },
  { id: '279', name: 'Sree Annapoorna', address: 'RS Puram, Coimbatore', coords: { lat: 11.0092, lng: 76.9456 } },
  { id: '298', name: 'Iruttukadai Halwa', address: 'Opp. Nellaippar Temple, Tirunelveli', coords: { lat: 8.7292, lng: 77.6836 } },
  { id: '20', name: 'Rayar\'s Mess', address: 'Mylapore, Chennai', coords: { lat: 13.0321, lng: 80.2684 } },
  { id: '21', name: 'Jannal Kadai', address: 'Mylapore, Chennai', coords: { lat: 13.0332, lng: 80.2691 } },
  { id: '23', name: 'Nair Mess', address: 'Chepauk, Chennai', coords: { lat: 13.0642, lng: 80.2821 } },
  { id: '8', name: 'Sana Burma Food', address: 'Parrys, Chennai', coords: { lat: 13.0945, lng: 80.2889 } },
];

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      content: 'I am your GeoMind guide for the Rolling Sirrr trail. Explore the list on the right or ask me anything! Shop owners can add their shops using the button below.',
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [location, setLocation] = useState<LatLng>({ lat: 13.0827, lng: 80.2707 }); 
  const [vendorShops, setVendorShops] = useState<Shop[]>(() => {
    const saved = localStorage.getItem('vendor_shops');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('vendor_shops', JSON.stringify(vendorShops));
  }, [vendorShops]);

  const allShops = useMemo(() => [...ROLLING_SIRRR_TRAIL, ...vendorShops], [vendorShops]);

  const filteredTrail = useMemo(() => 
    ROLLING_SIRRR_TRAIL.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.address.toLowerCase().includes(searchTerm.toLowerCase())),
    [searchTerm]
  );

  const filteredVendors = useMemo(() => 
    vendorShops.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [vendorShops, searchTerm]
  );

  const handleSend = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const text = customPrompt || input;
    if (!text.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    const loadingId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: loadingId, role: 'model', content: 'Consulting the legends...', timestamp: Date.now(), isLoading: true }]);

    const context = `Known Trail Spots: ${ROLLING_SIRRR_TRAIL.map(s => s.name).join(', ')}. Registered Vendors: ${vendorShops.map(s => `${s.name} at ${s.address}`).join('; ')}.`;
    const response = await askGemini(text, ModelType.MAPS, location, context);

    setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, content: response.content || '', groundingLinks: response.groundingLinks, isLoading: false } : m));
  };

  const handleAddShop = (name: string, address: string, menuItems: MenuItem[]) => {
    const newShop: Shop = {
      id: `v-${Date.now()}`,
      name,
      address,
      coords: location,
      isVendor: true,
      menu: menuItems
    };
    setVendorShops(prev => [...prev, newShop]);
    setIsRegistering(false);
  };

  const selectShop = (shop: Shop) => {
    setLocation(shop.coords);
    setSelectedShop(shop);
    if (!shop.isVendor) {
      handleSend(undefined, `Tell me about ${shop.name} in ${shop.address}. Why is it famous on Rolling Sirrr?`);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-100 font-sans overflow-hidden">
      {/* Left Sidebar: AI Chat */}
      <div className={`${isLeftSidebarOpen ? 'w-[320px] md:w-[380px]' : 'w-0'} transition-all duration-300 bg-white shadow-xl flex flex-col z-30 border-r border-slate-200 overflow-hidden shrink-0`}>
        <div className="p-5 bg-indigo-900 text-white flex justify-between items-center shadow-lg">
          <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
            <span className="text-2xl">🍲</span> GEOMIND
          </h1>
          <button onClick={() => setIsLeftSidebarOpen(false)} className="hover:bg-white/10 p-1 rounded">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/50">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm border ${m.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white border-slate-200 text-slate-800'}`}>
                {m.isLoading ? (
                  <div className="flex gap-1 py-1">
                    <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce delay-150"></div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-relaxed">{m.content}</p>
                    {m.groundingLinks && m.groundingLinks.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                        {m.groundingLinks.map((link, idx) => (
                          <a key={idx} href={link.maps?.uri || link.web?.uri} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 p-2 rounded-lg hover:bg-indigo-100 truncate">
                            📍 {link.maps?.title || link.web?.title || 'View Map'}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        <div className="p-4 border-t bg-white">
          <button 
            onClick={() => setIsRegistering(true)}
            className="w-full mb-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md active:scale-95"
          >
            🏪 Shop Keeper Registration
          </button>
          <form onSubmit={handleSend} className="relative">
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              placeholder="Ask about legendary food..." 
              className="w-full p-3 pr-10 rounded-xl bg-slate-100 border-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-600 p-1 hover:bg-indigo-50 rounded">
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256"><path d="M232,128a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16H224A8,8,0,0,1,232,128ZM39.69,216.49l180-80a8,8,0,0,0,0-14.42l-180-80A8,8,0,0,0,29.1,52.27L54.67,112H112a8,8,0,0,1,0,16H54.67l-25.57,59.73a8,8,0,0,0,10.59,10.76Z"/></svg>
            </button>
          </form>
        </div>
      </div>

      {/* Main Area: Map */}
      <div className="flex-1 relative flex flex-col">
        {!isLeftSidebarOpen && (
          <button onClick={() => setIsLeftSidebarOpen(true)} className="absolute top-4 left-4 z-40 p-3 bg-indigo-900 text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all">
             💬
          </button>
        )}
        <Map 
          center={location} 
          shops={allShops} 
          onLocationChange={setLocation} 
          onShopClick={selectShop} 
        />
        
        {/* Registration Overlay */}
        {isRegistering && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-800">Shop Registration</h2>
                <button onClick={() => setIsRegistering(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
              </div>
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-6">Drag the blue marker to your shop location first</p>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Shop Name</label>
                  <input id="reg-name" placeholder="E.g. Madurai Muniyandi Vilas" className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Address</label>
                  <input id="reg-addr" placeholder="Street Name, Area" className="w-full p-4 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 outline-none font-bold text-sm" />
                </div>
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                   <p className="text-[10px] font-black text-indigo-600 uppercase mb-3">Add Special Item</p>
                   <div className="flex gap-2">
                     <input id="reg-item" placeholder="Item Name" className="flex-1 p-3 rounded-xl bg-white border border-slate-200 text-xs font-bold" />
                     <input id="reg-price" placeholder="Price" className="w-24 p-3 rounded-xl bg-white border border-slate-200 text-xs font-bold" />
                   </div>
                </div>
                <button 
                  onClick={() => {
                    const n = (document.getElementById('reg-name') as HTMLInputElement).value;
                    const a = (document.getElementById('reg-addr') as HTMLInputElement).value;
                    const i = (document.getElementById('reg-item') as HTMLInputElement).value;
                    const p = (document.getElementById('reg-price') as HTMLInputElement).value;
                    if (n && a) handleAddShop(n, a, [{ id: '1', name: i || 'Signature Dish', price: p || 'Custom' }]);
                  }}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-all"
                >
                  Verify & List Shop
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Digital Menu Viewer */}
        {selectedShop?.isVendor && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[500] pointer-events-none">
             <div className="bg-slate-900/95 backdrop-blur-2xl p-8 rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] border border-white/10 w-[350px] pointer-events-auto flex flex-col animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-white leading-none mb-1">{selectedShop.name}</h3>
                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">{selectedShop.address}</p>
                  </div>
                  <button onClick={() => setSelectedShop(null)} className="text-white/30 hover:text-white">✕</button>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2">
                    <span>Menu Item</span>
                    <span>Price</span>
                  </div>
                  {selectedShop.menu?.map(item => (
                    <div key={item.id} className="flex justify-between items-center group">
                      <span className="text-white font-bold text-sm group-hover:text-indigo-400 transition-colors">{item.name}</span>
                      <span className="text-indigo-300 font-black text-xs tabular-nums bg-white/5 px-2 py-1 rounded-md">{item.price}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-8 p-4 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-center">
                   <p className="text-[11px] text-indigo-200 font-medium">Verified Vendor Shop</p>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Right Sidebar: Directory (Shown UPFRONT) */}
      <div className={`${isRightSidebarOpen ? 'w-[300px] md:w-[350px]' : 'w-0'} transition-all duration-300 bg-white shadow-xl flex flex-col z-30 border-l border-slate-200 overflow-hidden shrink-0`}>
        <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
             <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
             Shop Directory
          </h2>
          <button onClick={() => setIsRightSidebarOpen(false)} className="md:hidden">✕</button>
        </div>

        <div className="p-4 border-b">
           <div className="relative">
             <input 
               type="text" 
               placeholder="Search shop or city..." 
               value={searchTerm} 
               onChange={e => setSearchTerm(e.target.value)}
               className="w-full p-3 pl-10 rounded-xl bg-slate-100 border-none text-xs font-bold focus:ring-2 focus:ring-slate-300" 
             />
             <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30 text-xs">🔍</span>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
          {/* Legend Trail Section */}
          <section>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-3">YouTube Legends (Rolling Sirrr)</h3>
            <div className="space-y-2">
              {filteredTrail.map(shop => (
                <button 
                  key={shop.id} 
                  onClick={() => selectShop(shop)}
                  className={`w-full text-left p-4 rounded-2xl transition-all border ${selectedShop?.id === shop.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                >
                  <div className="text-[13px] font-black text-slate-800 mb-0.5">{shop.name}</div>
                  <div className="text-[10px] text-slate-400 font-bold truncate">{shop.address}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Verified Vendors Section */}
          {filteredVendors.length > 0 && (
            <section>
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-2 mb-3">Verified Local Vendors</h3>
              <div className="space-y-2">
                {filteredVendors.map(shop => (
                  <button 
                    key={shop.id} 
                    onClick={() => selectShop(shop)}
                    className={`w-full text-left p-4 rounded-2xl transition-all border border-emerald-100 ${selectedShop?.id === shop.id ? 'bg-emerald-50 border-emerald-300 shadow-md' : 'bg-white hover:bg-emerald-50'}`}
                  >
                    <div className="flex justify-between items-start mb-0.5">
                       <div className="text-[13px] font-black text-slate-900">{shop.name}</div>
                       <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">Live</span>
                    </div>
                    <div className="text-[10px] text-emerald-600/70 font-bold truncate">{shop.address}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {filteredTrail.length === 0 && filteredVendors.length === 0 && (
            <div className="py-20 text-center opacity-30">
               <span className="text-4xl block mb-2">🍽️</span>
               <p className="text-xs font-bold uppercase tracking-widest">No matching spots</p>
            </div>
          )}
        </div>
      </div>

      {/* Global Bottom Status */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[40] pointer-events-none hidden md:flex">
         <div className="bg-slate-900/90 backdrop-blur-xl text-white px-8 py-3 rounded-full shadow-2xl border border-white/10 flex items-center gap-6 text-[10px] font-black tracking-widest uppercase">
            <span className="text-indigo-400">Map Focus</span> {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
            <span className="opacity-20">|</span>
            <span className="text-red-400">{ROLLING_SIRRR_TRAIL.length} Legends</span>
            <span className="opacity-20">|</span>
            <span className="text-emerald-400">{vendorShops.length} Vendors</span>
         </div>
      </div>

      {!isRightSidebarOpen && (
        <button onClick={() => setIsRightSidebarOpen(true)} className="absolute top-4 right-4 z-40 p-3 bg-slate-900 text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all">
           📋
        </button>
      )}
    </div>
  );
};

export default App;
