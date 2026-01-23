
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Map from './components/Map';
import { askGemini, fetchLegendarySpots } from './services/geminiService';
import { Message, ModelType, LatLng, Shop, MenuItem, VendorProfile, VendorStatus, Review, AppNotification, GroundingChunk } from './types';

const ROLLING_SIRRR_TRAIL: Shop[] = [
  { id: '201', name: 'Eshwari Mess', address: 'Madurai', coords: { lat: 9.9212, lng: 78.0436 }, emoji: '🥘', cuisine: 'Tamil Heritage', rating: 4.8, reviews: [] },
  { id: '202', name: 'Amma Mess', address: 'Alagar Kovil Rd, Madurai', coords: { lat: 9.9382, lng: 78.1396 }, emoji: '🍗', cuisine: 'Non-Veg Special', rating: 4.7, reviews: [] },
  { id: '203', name: 'Sree Sabareesh', address: 'West Perumal Maistry St', coords: { lat: 9.9192, lng: 78.1146 }, emoji: '☕', cuisine: 'Filter Coffee', rating: 4.5, reviews: [] },
  { id: '20', name: 'Rayar\'s Mess', address: 'Mylapore, Chennai', coords: { lat: 13.0321, lng: 80.2684 }, emoji: '🥟', cuisine: 'Morning Tiffin', rating: 4.9, reviews: [] },
  { id: '21', name: 'Jannal Kadai', address: 'Mylapore, Chennai', coords: { lat: 13.0332, lng: 80.2691 }, emoji: '🥡', cuisine: 'Window Snack', rating: 4.6, reviews: [] },
  { id: '8', name: 'Sana Burma Food', address: 'Parrys, Chennai', coords: { lat: 13.0945, lng: 80.2889 }, emoji: '🍜', cuisine: 'Atho/Burmese', rating: 4.3, reviews: [] },
];

const INITIAL_VENDORS: VendorProfile[] = [
  {
    id: 'v-999',
    businessName: "Raja's Spicy Corner",
    ownerName: "Raja K.",
    description: "Authentic roadside spice experience.",
    status: VendorStatus.OFFLINE,
    lastLocation: { lat: 13.0418, lng: 80.2341 },
    address: "T-Nagar, Chennai",
    menu: [{ id: 'm1', name: 'Gobi 65', price: '₹80', description: 'Crispy fried cauliflower' }],
    operatingHours: '5 PM - 11 PM',
    views: 1240,
    liveUntil: null,
    emoji: '🌶️',
    cuisine: 'Fast Food',
    rating: 4.6,
    reviews: []
  }
];

export default function App() {
  const [userMode, setUserMode] = useState<'customer' | 'vendor'>('customer');
  const [customerTab, setCustomerTab] = useState<'geomind' | 'live'>('geomind');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const [activeToast, setActiveToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      content: 'I am your GeoMind guide. Discover legendary food trails or support live local vendors!',
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [location, setLocation] = useState<LatLng>({ lat: 13.0827, lng: 80.2707 }); 
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  const [registeredVendors, setRegisteredVendors] = useState<VendorProfile[]>(() => {
    const saved = localStorage.getItem('geo_registered_vendors');
    return saved ? JSON.parse(saved) : INITIAL_VENDORS;
  });

  const [activeVendorId, setActiveVendorId] = useState<string | null>(() => {
    return localStorage.getItem('geo_active_vendor_id');
  });

  // AI Sync States
  const [syncedSpots, setSyncedSpots] = useState<Shop[]>(() => {
    const saved = localStorage.getItem('geo_synced_spots');
    return saved ? JSON.parse(saved) : [];
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [isFetchingAI, setIsFetchingAI] = useState(false);
  const [syncBatchSize, setSyncBatchSize] = useState<number>(10);
  
  // Review Persistence
  const [manualReviews, setManualReviews] = useState<Record<string, Review[]>>(() => {
    const saved = localStorage.getItem('geo_manual_reviews');
    return saved ? JSON.parse(saved) : {};
  });

  // Vendor / Registration / Menu States
  const [isRegistering, setIsRegistering] = useState(false);
  const [regName, setRegName] = useState('');
  const [regOwner, setRegOwner] = useState('');
  const [regCuisine, setRegCuisine] = useState('');
  const [regEmoji, setRegEmoji] = useState('🥘');
  const [isAddingMenuItem, setIsAddingMenuItem] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');

  // Review Modal States
  const [isAddingReview, setIsAddingReview] = useState(false);
  const [revName, setRevName] = useState('');
  const [revRating, setRevRating] = useState(5);
  const [revText, setRevText] = useState('');

  // Ordering States
  const [isOrdering, setIsOrdering] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const stopSyncRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Robust auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('geo_synced_spots', JSON.stringify(syncedSpots));
  }, [syncedSpots]);

  useEffect(() => {
    localStorage.setItem('geo_manual_reviews', JSON.stringify(manualReviews));
  }, [manualReviews]);

  useEffect(() => {
    const handleResize = () => {
      const isMob = window.innerWidth <= 768;
      setIsMobile(isMob);
      if (!isMob) setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setActiveToast({ message, type });
    setTimeout(() => setActiveToast(null), 3000);
  };

  const vendorProfile = useMemo(() => 
    registeredVendors.find(v => v.id === activeVendorId) || null
  , [registeredVendors, activeVendorId]);

  useEffect(() => {
    localStorage.setItem('geo_registered_vendors', JSON.stringify(registeredVendors));
  }, [registeredVendors]);

  useEffect(() => {
    if (activeVendorId) localStorage.setItem('geo_active_vendor_id', activeVendorId);
    else localStorage.removeItem('geo_active_vendor_id');
  }, [activeVendorId]);

  const vendorShops = useMemo(() => {
    return registeredVendors.map(v => ({
      id: v.id,
      name: v.businessName,
      address: v.address,
      coords: v.lastLocation,
      isVendor: true,
      status: v.status,
      menu: v.menu,
      description: v.description,
      liveUntil: v.liveUntil,
      emoji: v.emoji,
      cuisine: v.cuisine,
      rating: v.rating || 4.5,
      reviews: v.reviews || []
    }));
  }, [registeredVendors]);

  const [isMarkingSpot, setIsMarkingSpot] = useState(false);
  const [isGettingLocation, setGettingLocation] = useState(false);
  const [currentLoc, setCurrentLoc] = useState<LatLng | null>(null);
  const [closeHours, setCloseHours] = useState('10');
  const [closeMinutes, setCloseMinutes] = useState('00');
  const [ampm, setAmpm] = useState('PM');
  const [timeLeftDisplay, setTimeLeftDisplay] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRegisteredVendors(prev => prev.map(v => {
        if (v.status === VendorStatus.ONLINE && v.liveUntil && v.liveUntil <= now) {
          return { ...v, status: VendorStatus.OFFLINE, liveUntil: null };
        }
        return v;
      }));
      if (vendorProfile && vendorProfile.status === VendorStatus.ONLINE && vendorProfile.liveUntil) {
        const remaining = vendorProfile.liveUntil - now;
        if (remaining <= 0) setTimeLeftDisplay('EXPIRED');
        else {
          const h = Math.floor(remaining / 3600000);
          const m = Math.floor((remaining % 3600000) / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          setTimeLeftDisplay(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [vendorProfile]);

  const allShops = useMemo(() => {
    const now = Date.now();
    const onlineVendors = vendorShops.filter(v => v.status === VendorStatus.ONLINE && (!v.liveUntil || v.liveUntil > now));
    const rawList = [...ROLLING_SIRRR_TRAIL, ...syncedSpots, ...onlineVendors];
    
    return rawList.map(shop => ({
      ...shop,
      reviews: [...(shop.reviews || []), ...(manualReviews[shop.id] || [])]
    }));
  }, [vendorShops, syncedSpots, manualReviews]);

  const selectedShop = useMemo(() => {
    return allShops.find(s => s.id === selectedShopId) || null;
  }, [selectedShopId, allShops]);

  const filteredTrail = useMemo(() => 
    allShops.filter(s => !s.isVendor && s.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [searchTerm, allShops]
  );

  const getCurrentLocation = () => {
    setGettingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setCurrentLoc(newLoc);
          setLocation(newLoc);
          setGettingLocation(false);
          showToast("Location updated!");
        },
        (error) => {
          console.error("Geolocation error:", error);
          setGettingLocation(false);
          showToast("Enable location services.", 'error');
        }
      );
    }
  };

  const handleGoLive = () => {
    if (!activeVendorId || !currentLoc) return;
    const now = new Date();
    let hours = parseInt(closeHours);
    const minutes = parseInt(closeMinutes);
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const closingTime = new Date();
    closingTime.setHours(hours, minutes, 0, 0);
    if (closingTime <= now) closingTime.setDate(closingTime.getDate() + 1);
    setRegisteredVendors(prev => prev.map(v => {
      if (v.id === activeVendorId) {
        return { ...v, status: VendorStatus.ONLINE, lastLocation: currentLoc, liveUntil: closingTime.getTime() };
      }
      return v;
    }));
    setIsMarkingSpot(false);
    setCurrentLoc(null);
    showToast("You are now LIVE!");
  };

  const handleSyncWithGemini = async () => {
    if (isSyncing) {
      stopSyncRef.current = true;
      return;
    }

    setIsSyncing(true);
    setIsFetchingAI(true);
    setSyncProgress(0);
    stopSyncRef.current = false;

    const discoveryInterval = setInterval(() => {
      setSyncProgress(prev => {
        const step = Math.floor(Math.random() * 3) + 2;
        const next = prev + step;
        return next > syncBatchSize ? prev : next;
      });
    }, 200);

    const result = await fetchLegendarySpots(syncBatchSize + 10);
    
    clearInterval(discoveryInterval);
    setIsFetchingAI(false);

    if (result.spots.length === 0) {
       showToast("Sync failed. Check API key.", 'error');
       setIsSyncing(false);
       return;
    }

    const spotsToAdd = result.spots;
    const existingNames = new Set(syncedSpots.map(s => s.name.toLowerCase()));
    const uniqueNew = spotsToAdd
      .filter(s => !existingNames.has(s.name.toLowerCase()))
      .slice(0, syncBatchSize);

    if (uniqueNew.length === 0) {
      showToast("No new spots found.");
      setIsSyncing(false);
      return;
    }

    setSyncProgress(0);
    const BATCH_SIZE = 4;
    for (let i = 0; i < uniqueNew.length; i += BATCH_SIZE) {
      if (stopSyncRef.current) break;
      const batch = uniqueNew.slice(i, i + BATCH_SIZE);
      setSyncedSpots(prev => [...prev, ...batch]);
      setSyncProgress(Math.min(i + BATCH_SIZE, uniqueNew.length));
      await new Promise(resolve => setTimeout(resolve, 60));
    }

    showToast(`Added ${uniqueNew.length} legends!`);
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsSyncing(false);
    setSyncProgress(0);
  };

  const handleRegisterVendor = () => {
    if (!regName || !regOwner) return;
    const newVendor: VendorProfile = {
      id: `v-${Date.now()}`,
      businessName: regName,
      ownerName: regOwner,
      cuisine: regCuisine || 'Street Food',
      emoji: regEmoji,
      description: 'A newly added local gem.',
      status: VendorStatus.OFFLINE,
      lastLocation: location,
      address: 'Current Location',
      menu: [],
      operatingHours: 'TBD',
      views: 0,
      liveUntil: null,
      rating: 5.0,
      reviews: []
    };
    setRegisteredVendors(prev => [...prev, newVendor]);
    setIsRegistering(false);
    setRegName('');
    setRegOwner('');
    setActiveVendorId(newVendor.id);
    showToast("Business registered!");
  };

  const handleDeleteVendor = (e: React.MouseEvent, vendorId: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to remove this business registration?")) {
      setRegisteredVendors(prev => prev.filter(v => v.id !== vendorId));
      if (activeVendorId === vendorId) setActiveVendorId(null);
      if (selectedShopId === vendorId) setSelectedShopId(null);
      showToast("Business registration removed.");
    }
  };

  const handleAddMenuItem = () => {
    if (!activeVendorId || !newMenuName || !newMenuPrice) return;
    const newItem: MenuItem = {
      id: `m-${Date.now()}`,
      name: newMenuName,
      price: `₹${newMenuPrice}`,
      description: ''
    };
    setRegisteredVendors(prev => prev.map(v => {
      if (v.id === activeVendorId) {
        return { ...v, menu: [...v.menu, newItem] };
      }
      return v;
    }));
    setIsAddingMenuItem(false);
    setNewMenuName('');
    setNewMenuPrice('');
    showToast("Menu item added!");
  };

  const handleRemoveMenuItem = (itemId: string) => {
    if (!activeVendorId) return;
    setRegisteredVendors(prev => prev.map(v => {
      if (v.id === activeVendorId) {
        return { ...v, menu: v.menu.filter(m => m.id !== itemId) };
      }
      return v;
    }));
    showToast("Item removed.");
  };

  const handleAddReview = () => {
    if (!selectedShopId) return;
    if (!revName.trim() || !revText.trim()) {
      showToast("Please fill all fields.", 'error');
      return;
    }

    const newReview: Review = {
      id: `rev-${Date.now()}`,
      userName: revName,
      rating: revRating,
      text: revText,
      date: new Date().toLocaleDateString()
    };
    
    setManualReviews(prev => ({
      ...prev,
      [selectedShopId]: [newReview, ...(prev[selectedShopId] || [])]
    }));

    setIsAddingReview(false);
    setRevName('');
    setRevText('');
    setRevRating(5);
    showToast("Review posted successfully!");
  };

  const handleSend = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const text = customPrompt || input;
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const loadingId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: loadingId, role: 'model', content: 'Consulting GeoMind...', timestamp: Date.now(), isLoading: true }]);
    const context = `Trail: ${allShops.filter(s => !s.isVendor).map(s => s.name).join(', ')}.`;
    const response = await askGemini(text, ModelType.MAPS, location, context);
    setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, content: response.content || '', groundingLinks: response.groundingLinks, isLoading: false } : m));
  };

  const selectShop = (shop: Shop) => {
    setLocation(shop.coords);
    setSelectedShopId(shop.id);
    if (!shop.isVendor) {
      handleSend(undefined, `What makes ${shop.name} in ${shop.address} a legendary spot?`);
    }
    if (isMobile) setIsSidebarOpen(false);
  };

  const updateCart = (itemId: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const totalPrice = useMemo(() => {
    if (!selectedShop || !selectedShop.menu) return 0;
    return selectedShop.menu.reduce((sum, item) => {
      const qty = cart[item.id] || 0;
      const priceVal = parseInt(item.price.replace(/[^\d]/g, '')) || 0;
      return sum + (priceVal * qty);
    }, 0);
  }, [cart, selectedShop]);

  const handlePlaceOrder = async () => {
    if (Object.keys(cart).length === 0) {
      showToast("Add items to cart first!", 'error');
      return;
    }
    setIsPlacingOrder(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsPlacingOrder(false);
    setIsOrdering(false);
    setCart({});
    showToast("Order Placed! The vendor is preparing your food.");
  };

  return (
    <div className="flex h-screen w-screen bg-slate-100 font-sans overflow-hidden relative text-slate-900">
      {activeToast && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] px-6 py-3 rounded-full shadow-2xl text-white text-xs font-black uppercase tracking-widest animate-in slide-in-from-bottom-5 duration-300 ${activeToast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {activeToast.message}
        </div>
      )}

      {/* Mode Switcher */}
      <div className="absolute top-4 left-4 z-[1001] flex bg-white/95 backdrop-blur rounded-full p-1 shadow-2xl border border-slate-200 w-auto">
        <button onClick={() => setUserMode('customer')} className={`px-4 md:px-6 py-2 md:py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${userMode === 'customer' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>Explorer</button>
        <button onClick={() => setUserMode('vendor')} className={`px-4 md:px-6 py-2 md:py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${userMode === 'vendor' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>Partner Hub</button>
      </div>

      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 left-0 md:relative z-40 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-full md:w-[420px] bg-white shadow-2xl flex flex-col border-r border-slate-200 overflow-hidden`}>
        {userMode === 'customer' ? (
          <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            <div className="bg-indigo-900 text-white pt-5 shadow-lg flex flex-col shrink-0 z-10">
              <div className="px-5 pb-4 flex justify-between items-center">
                <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <span className="text-2xl">🍲</span> GEOMIND
                </h1>
                <div className="flex items-center gap-3">
                  <button onClick={() => setIsSidebarOpen(false)} className="bg-white/10 p-2 rounded-full text-white">✕</button>
                </div>
              </div>
              <div className="flex border-t border-white/10">
                <button onClick={() => setCustomerTab('geomind')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-colors ${customerTab === 'geomind' ? 'bg-white/10 border-b-2 border-white' : 'text-white/40'}`}>GeoMind AI</button>
                <button onClick={() => setCustomerTab('live')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-colors ${customerTab === 'live' ? 'bg-white/10 border-b-2 border-white' : 'text-white/40'}`}>Live Now</button>
              </div>
            </div>

            {customerTab === 'geomind' ? (
              <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">
                {/* Search & Sync Actions */}
                <div className="p-4 border-b bg-white shadow-sm shrink-0 flex flex-col gap-3 z-10">
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} type="text" placeholder="Filter discovered spots..." className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-300 transition-all" />
                  
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-black uppercase text-slate-400">Batch Size</span>
                      <div className="flex gap-1.5">
                        {[10, 20, 30].map(val => (
                          <button 
                            key={val} 
                            onClick={() => setSyncBatchSize(val)}
                            disabled={isSyncing}
                            className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${syncBatchSize === val ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={handleSyncWithGemini} className={`w-full py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest text-[11px] transition-all hover:scale-[1.02] active:scale-95 ${isSyncing ? 'bg-red-500' : 'bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500'}`}>
                      {isSyncing ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> {isFetchingAI ? `SCANNING (${syncProgress}/${syncBatchSize})` : `SYNCING ${syncProgress} [STOP]`}</>
                      ) : <>✨ DEEP SYNC FOOD TRAIL</>}
                    </button>
                  </div>
                </div>

                {/* Independent Scroll Sections */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Shop List Section - Collapsible proportions */}
                  <div className="flex-[0.35] overflow-y-auto p-4 space-y-3 custom-scrollbar border-b border-slate-200 bg-white/50 min-h-[140px]">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2 mb-2">Discovered Legends</h3>
                    {filteredTrail.length > 0 ? filteredTrail.map(shop => (
                      <button key={shop.id} onClick={() => selectShop(shop)} className={`w-full text-left p-4 rounded-[1.25rem] transition-all border group ${selectedShopId === shop.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{shop.emoji || '🥘'}</span>
                          <div className="flex-1 overflow-hidden">
                            <div className="text-[12px] font-black text-slate-800 flex items-center gap-2 truncate">
                              {shop.name}
                              {shop.id.startsWith('sync') && <span className="bg-indigo-100 text-indigo-600 text-[7px] px-1.5 py-0.5 rounded-full font-black flex-shrink-0">AI</span>}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold uppercase truncate">{shop.cuisine} • {shop.address}</div>
                          </div>
                        </div>
                      </button>
                    )) : (
                      <div className="py-10 text-center opacity-30 italic text-[10px] font-bold">No spots found. Sync with Gemini to discover legends!</div>
                    )}
                  </div>

                  {/* Chat Section - High Priority Scroll */}
                  <div className="flex-[0.65] flex flex-col overflow-hidden bg-slate-50/50 relative">
                    <div className="px-5 py-2.5 border-b border-slate-200 flex justify-between items-center bg-white/60 backdrop-blur shrink-0">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-500">GeoMind AI Guide</h3>
                      <button onClick={() => setMessages([{ id: 'init', role: 'model', content: 'Consultation history cleared.', timestamp: Date.now() }])} className="text-[9px] font-black text-slate-400 uppercase hover:text-indigo-500 transition-colors">Clear</button>
                    </div>
                    
                    {/* The Main Chat Container with its own scroll context */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth" ref={chatContainerRef}>
                      {messages.map(m => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                          <div className={`max-w-[90%] p-3.5 rounded-2xl shadow-sm border ${m.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white border-slate-200 text-slate-800'}`}>
                            {m.isLoading ? (
                              <div className="flex gap-1.5 py-1 px-1">
                                <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce"></div>
                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                              </div>
                            ) : (
                              <div className="overflow-hidden">
                                <p className="text-[12px] font-semibold leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                                {m.groundingLinks && m.groundingLinks.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                                    {m.groundingLinks.map((link, idx) => (
                                      <a key={idx} href={link.web?.uri || link.maps?.uri} target="_blank" rel="noreferrer" className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg uppercase truncate max-w-[140px] hover:bg-indigo-100 transition-colors">
                                        🔗 {link.web?.title || link.maps?.title || 'Grounding Link'}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Chat Input anchored to the bottom */}
                    <div className="p-3 bg-white border-t border-slate-200 shrink-0 z-10">
                      <form onSubmit={handleSend} className="relative">
                        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about these spots or the food..." className="w-full p-3.5 pr-12 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300" />
                        <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-600 font-black text-xl hover:scale-125 transition-transform">→</button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                {vendorShops.filter(s => s.status === VendorStatus.ONLINE).length > 0 ? vendorShops.filter(s => s.status === VendorStatus.ONLINE).map(shop => (
                  <div key={shop.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl transition-all hover:scale-[1.01]">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-4">
                        <span className="text-5xl">{shop.emoji || '🥘'}</span>
                        <div><h3 className="text-lg font-black">{shop.name}</h3><p className="text-[10px] font-black text-emerald-600 uppercase mt-1">{shop.cuisine}</p></div>
                      </div>
                      <span className="bg-emerald-500 text-white text-[9px] font-black px-3 py-1 rounded-full animate-pulse uppercase">Live</span>
                    </div>
                    <button onClick={() => selectShop(shop)} className="w-full py-4 bg-emerald-600 text-white rounded-3xl text-[10px] font-black uppercase shadow-lg hover:bg-emerald-700 transition-colors">View Store</button>
                  </div>
                )) : (
                  <div className="py-20 text-center opacity-20">
                    <div className="text-6xl mb-4">📍</div>
                    <p className="font-black uppercase tracking-widest text-[10px]">No vendors live right now</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h1 className="text-2xl font-black">Partner Hub</h1>
              {activeVendorId && <button onClick={() => setActiveVendorId(null)} className="text-[10px] font-black uppercase bg-white/10 px-4 py-2 rounded-2xl hover:bg-white/20 transition-all">‹ BACK</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {!activeVendorId ? (
                <>
                  <div className="space-y-4">
                    {registeredVendors.map(v => (
                      <div key={v.id} className="relative group">
                        <button onClick={() => setActiveVendorId(v.id)} className="w-full bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between transition-all hover:border-indigo-300 hover:shadow-md">
                          <div className="flex items-center gap-4">
                            <span className="text-4xl">{v.emoji || '🏪'}</span>
                            <div className="text-left"><h3 className="text-base font-black text-slate-800">{v.businessName}</h3><p className="text-[10px] font-bold text-slate-400 uppercase">{v.ownerName}</p></div>
                          </div>
                          <div className={`w-2.5 h-2.5 rounded-full ${v.status === VendorStatus.ONLINE ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                        </button>
                        <button 
                          onClick={(e) => handleDeleteVendor(e, v.id)}
                          className="absolute -top-2 -right-2 w-8 h-8 bg-white border border-slate-200 text-red-500 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 z-10"
                        >
                          <span className="text-sm font-black">✕</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setIsRegistering(true)} className="w-full py-6 bg-slate-100 border-2 border-dashed border-slate-300 rounded-[2rem] text-slate-500 font-black text-xs uppercase hover:bg-white hover:border-indigo-300 hover:text-indigo-600 transition-all">+ Register New Business</button>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl space-y-6">
                    <div className="flex items-center gap-4"><span className="text-5xl">{vendorProfile?.emoji}</span><h2 className="text-2xl font-black">{vendorProfile?.businessName}</h2></div>
                    {vendorProfile?.status === VendorStatus.ONLINE ? (
                      <div className="bg-indigo-900 text-white p-8 rounded-3xl text-center shadow-xl">
                        <p className="text-[10px] font-black uppercase opacity-50 mb-2">Live Broadcast</p>
                        <span className="text-4xl font-mono font-black">{timeLeftDisplay}</span>
                        <button onClick={() => setRegisteredVendors(prev => prev.map(v => v.id === activeVendorId ? {...v, status: VendorStatus.OFFLINE, liveUntil: null} : v))} className="w-full mt-6 py-3 bg-red-500/20 text-red-500 rounded-xl font-black text-[10px] uppercase hover:bg-red-500/30">End Broadcast</button>
                      </div>
                    ) : <button onClick={() => setIsMarkingSpot(true)} className="w-full py-8 bg-indigo-600 text-white rounded-[2rem] font-black text-lg uppercase shadow-2xl hover:bg-indigo-700 transition-colors">📍 GO LIVE</button>}
                  </div>
                  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl">
                    <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-black">Menu Specials</h3><button onClick={() => setIsAddingMenuItem(true)} className="text-[10px] font-black text-indigo-600 uppercase">+ Add Dish</button></div>
                    <div className="space-y-3">
                      {vendorProfile?.menu.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-4">No items added to your menu yet.</p>}
                      {vendorProfile?.menu.map(item => (
                        <div key={item.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border group hover:border-indigo-200 transition-all">
                          <div><p className="text-sm font-black">{item.name}</p><p className="text-[10px] font-bold text-slate-400">{item.price}</p></div>
                          <button onClick={() => handleRemoveMenuItem(item.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Map Content Area */}
      <div className="flex-1 relative h-full">
        <Map center={location} shops={allShops} onLocationChange={setLocation} onShopClick={selectShop} />
        {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="absolute left-4 top-1/2 -translate-y-1/2 z-[1000] bg-white w-14 h-14 rounded-2xl shadow-2xl text-indigo-600 font-black text-2xl flex items-center justify-center transition-transform hover:scale-110">→</button>}
        
        {/* Expanded Shop Details Card */}
        {selectedShop && (
          <div className="absolute bottom-0 md:bottom-10 left-0 md:left-1/2 md:-translate-x-1/2 z-[500] w-full md:w-[500px] pointer-events-none p-4">
            <div className="bg-slate-900/95 backdrop-blur-3xl p-6 rounded-[2.5rem] shadow-2xl border border-white/10 pointer-events-auto flex flex-col max-h-[75vh] animate-in slide-in-from-bottom-5 duration-500">
              <div className="flex justify-between items-start mb-6 shrink-0">
                <div className="flex items-center gap-4">
                  <span className="text-5xl animate-in zoom-in-50 duration-500">{selectedShop.emoji || '🥘'}</span>
                  <div className="flex-1">
                    <h3 className="text-xl font-black text-white">{selectedShop.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-400 text-xs">★</span>
                      <span className="text-white font-black">{selectedShop.rating || '4.5'}</span>
                      <span className="text-slate-500 font-bold text-xs uppercase ml-2">• {selectedShop.cuisine}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedShopId(null)} className="text-white/50 p-2 hover:text-white transition-colors">✕</button>
              </div>
              <div className="space-y-5 overflow-y-auto custom-scrollbar pr-2 pb-2">
                <p className="text-white text-sm leading-relaxed">{selectedShop.address}</p>
                {selectedShop.menu && selectedShop.menu.length > 0 && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-[10px] font-black text-indigo-400 uppercase mb-3 tracking-widest">Store Specials</p>
                    <div className="space-y-2">
                      {selectedShop.menu.map(item => (
                        <div key={item.id} className="flex justify-between items-center text-xs text-white"><span className="font-bold">{item.name}</span><span className="text-indigo-300 font-black">{item.price}</span></div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-white/70 text-xs italic">{selectedShop.description || "A highly-rated local favorite."}</p>
                
                <div className="pt-6 border-t border-white/10">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Community Buzz</p>
                    <button onClick={() => setIsAddingReview(true)} className="text-[9px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/20 px-4 py-2 rounded-full border border-indigo-500/30 hover:bg-indigo-500/30 transition-all">Add Review</button>
                  </div>
                  <div className="space-y-4">
                    {selectedShop.reviews && selectedShop.reviews.length > 0 ? (
                      selectedShop.reviews.map(rev => (
                        <div key={rev.id} className="bg-white/5 p-5 rounded-2xl border border-white/5 animate-in slide-in-from-top-2 duration-300">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-white text-xs font-black">{rev.userName}</span>
                            <span className="text-indigo-400 text-[10px] tracking-tighter">{'★'.repeat(rev.rating)}</span>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">{rev.text}</p>
                          <p className="text-[8px] text-slate-500 font-black uppercase mt-3">{rev.date}</p>
                        </div>
                      ))
                    ) : <p className="text-[10px] text-slate-500 italic text-center py-6 border border-dashed border-white/5 rounded-3xl">Be the first to buzz about this spot!</p>}
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-white/10 flex gap-3 shrink-0">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedShop.coords.lat},${selectedShop.coords.lng}`} target="_blank" rel="noreferrer" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase text-center hover:bg-indigo-700 transition-colors shadow-lg">Get Directions</a>
                <button 
                  onClick={() => selectedShop.isVendor ? setIsOrdering(true) : showToast("Simulating Phone Call...", "success")}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-colors shadow-lg"
                >
                  {selectedShop.isVendor ? 'Order' : 'Call Shop'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Overlays & Modals */}
      {isOrdering && selectedShop && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[2010] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="bg-emerald-600 p-8 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-4xl">{selectedShop.emoji}</span>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-widest">{selectedShop.name}</h2>
                  <p className="text-[10px] font-bold text-white/50 uppercase">Instant Order Tracking Enabled</p>
                </div>
              </div>
              <button onClick={() => setIsOrdering(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedShop.menu?.map(item => (
                  <div key={item.id} className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex justify-between items-center transition-all hover:border-emerald-200 shadow-sm">
                    <div className="flex-1 overflow-hidden pr-2">
                      <p className="text-sm font-black text-slate-800 truncate">{item.name}</p>
                      <p className="text-xs font-black text-emerald-600">{item.price}</p>
                      {item.description && <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{item.description}</p>}
                    </div>
                    <div className="flex items-center bg-white rounded-2xl p-1 shadow-sm border border-slate-100 shrink-0">
                      <button onClick={() => updateCart(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-emerald-600 font-black hover:bg-slate-50 rounded-xl transition-colors">-</button>
                      <span className="w-8 text-center text-xs font-black">{cart[item.id] || 0}</span>
                      <button onClick={() => updateCart(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-emerald-600 font-black hover:bg-slate-50 rounded-xl transition-colors">+</button>
                    </div>
                  </div>
                ))}
              </div>
              
              {(!selectedShop.menu || selectedShop.menu.length === 0) && (
                <div className="text-center py-20 opacity-30">
                  <p className="font-black uppercase tracking-widest text-xs">Menu is loading or unavailable</p>
                </div>
              )}

              {Object.keys(cart).length === 0 && (
                <div className="text-center py-20 opacity-20">
                  <span className="text-6xl mb-4 block">🛒</span>
                  <p className="font-black uppercase tracking-widest text-xs">Your basket is empty</p>
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t shrink-0">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grand Total</p>
                  <p className="text-3xl font-black text-slate-900">₹{totalPrice}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Convenience Fee</p>
                  <p className="text-sm font-black text-emerald-600">₹0 (PROMO)</p>
                </div>
              </div>
              <button 
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || Object.keys(cart).length === 0}
                className={`w-full py-6 rounded-3xl text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-3 ${Object.keys(cart).length > 0 ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95' : 'bg-slate-300 cursor-not-allowed'}`}
              >
                {isPlacingOrder ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> PROCESSING...</>
                ) : 'PLACE SECURE ORDER'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {isAddingReview && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[2005] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-indigo-600 p-10 text-white text-center">
              <span className="text-5xl mb-4 block">💬</span>
              <h2 className="text-xl font-black uppercase tracking-[0.2em]">Post a Buzz</h2>
              <p className="text-[9px] font-bold text-white/50 uppercase mt-2">Share your legend findings</p>
            </div>
            <div className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Explorer Alias</label>
                <input value={revName} onChange={e => setRevName(e.target.value)} placeholder="e.g. AthoKing_92" className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all" />
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[9px] font-black uppercase text-slate-400 text-center tracking-widest">Rating</p>
                <div className="flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setRevRating(star)} className={`text-4xl transition-all duration-300 hover:scale-125 ${revRating >= star ? 'text-indigo-600 drop-shadow-[0_0_8px_rgba(79,70,229,0.3)]' : 'text-slate-100'}`}>★</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">The Review</label>
                <textarea value={revText} onChange={e => setRevText(e.target.value)} placeholder="Was it worth the trail? Any tips for other explorers?" className="w-full p-5 rounded-3xl bg-slate-50 border border-slate-200 text-sm font-bold h-36 outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none" />
              </div>
              <button onClick={handleAddReview} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-700 transition-all">Publish</button>
              <button onClick={() => setIsAddingReview(false)} className="w-full py-2 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:text-slate-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Registration & Other Utility Modals */}
      {isRegistering && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2002] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-900 p-8 text-white text-center"><h2 className="text-2xl font-black">Register Spot</h2></div>
            <div className="p-8 space-y-4">
              <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Business Name" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              <input value={regOwner} onChange={e => setRegOwner(e.target.value)} placeholder="Owner Name" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              <input value={regCuisine} onChange={e => setRegCuisine(e.target.value)} placeholder="Cuisine" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              <div className="flex gap-2 justify-center">{['🥘','🌶️','🍗','🥟','☕','🍜'].map(e => (
                <button key={e} onClick={() => setRegEmoji(e)} className={`p-3 rounded-xl text-2xl transition-all ${regEmoji === e ? 'bg-indigo-600 shadow-lg scale-110' : 'bg-slate-100 hover:bg-slate-200'}`}>{e}</button>
              ))}</div>
              <button onClick={handleRegisterVendor} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-xl mt-4 hover:bg-indigo-700 transition-colors">Register Hub</button>
              <button onClick={() => setIsRegistering(false)} className="w-full py-2 text-slate-400 font-black text-[10px] uppercase text-center">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isAddingMenuItem && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2002] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-indigo-600 p-8 text-white text-center"><h2 className="text-xl font-black">New Menu Item</h2></div>
            <div className="p-8 space-y-4">
              <input value={newMenuName} onChange={e => setNewMenuName(e.target.value)} placeholder="Dish Name" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              <input value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} placeholder="Price (e.g. 150)" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={handleAddMenuItem} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl mt-4">Add to Menu</button>
              <button onClick={() => setIsAddingMenuItem(false)} className="w-full py-2 text-slate-400 font-black text-[10px] uppercase text-center">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isMarkingSpot && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2001] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-indigo-600 p-8 text-white text-center"><h2 className="text-2xl font-black">📍 GO LIVE</h2></div>
            <div className="p-8 space-y-6">
              {!currentLoc && !isGettingLocation ? (
                <button onClick={getCurrentLocation} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-xl hover:bg-indigo-700 transition-all">BROADCAST CURRENT POSITION</button>
              ) : (
                <div className="space-y-6">
                  <div className="bg-indigo-50 p-6 rounded-3xl text-center space-y-4">
                    <p className="text-[10px] font-black text-indigo-600 uppercase">Live Window (Until?)</p>
                    <div className="flex justify-center items-center gap-2">
                      <input value={closeHours} onChange={e => setCloseHours(e.target.value)} placeholder="HH" className="w-14 p-3 rounded-xl text-center font-black text-lg border outline-none" />
                      <span className="font-black text-indigo-300">:</span>
                      <input value={closeMinutes} onChange={e => setCloseMinutes(e.target.value)} placeholder="MM" className="w-14 p-3 rounded-xl text-center font-black text-lg border outline-none" />
                      <div className="flex bg-indigo-200/30 p-1 rounded-xl">
                        <button onClick={() => setAmpm('AM')} className={`px-2 py-1 rounded-lg text-[10px] font-black ${ampm === 'AM' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-400'}`}>AM</button>
                        <button onClick={() => setAmpm('PM')} className={`px-2 py-1 rounded-lg text-[10px] font-black ${ampm === 'PM' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-400'}`}>PM</button>
                      </div>
                    </div>
                  </div>
                  <button onClick={handleGoLive} className="w-full py-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-[2rem] font-black text-lg shadow-2xl hover:scale-[1.02] transition-all">START BROADCAST</button>
                </div>
              )}
              <button onClick={() => setIsMarkingSpot(false)} className="w-full py-2 text-slate-400 font-black text-[10px] uppercase text-center">Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
