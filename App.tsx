
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Map from './components/Map';
import { askGemini, fetchLegendarySpots, processTamilVoiceMenu } from './services/geminiService';
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

  const [activeToast, setActiveToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

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

  const [syncedSpots, setSyncedSpots] = useState<Shop[]>(() => {
    const saved = localStorage.getItem('geo_synced_spots');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncBatchSize, setSyncBatchSize] = useState<number>(10);
  
  const [manualReviews, setManualReviews] = useState<Record<string, Review[]>>(() => {
    const saved = localStorage.getItem('geo_manual_reviews');
    return saved ? JSON.parse(saved) : {};
  });

  const [isRegistering, setIsRegistering] = useState(false);
  const [regName, setRegName] = useState('');
  const [regOwner, setRegOwner] = useState('');
  const [regCuisine, setRegCuisine] = useState('');
  const [regEmoji, setRegEmoji] = useState('🥘');
  const [isAddingMenuItem, setIsAddingMenuItem] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isAddingReview, setIsAddingReview] = useState(false);
  const [revName, setRevName] = useState('');
  const [revRating, setRevRating] = useState(5);
  const [revText, setRevText] = useState('');

  const [isOrdering, setIsOrdering] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const stopSyncRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
    localStorage.setItem('geo_registered_vendors', JSON.stringify(registeredVendors));
  }, [registeredVendors]);

  useEffect(() => {
    if (activeVendorId) localStorage.setItem('geo_active_vendor_id', activeVendorId);
    else localStorage.removeItem('geo_active_vendor_id');
  }, [activeVendorId]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setActiveToast({ message, type });
    setTimeout(() => setActiveToast(null), 3000);
  };

  const vendorProfile = useMemo(() => 
    registeredVendors.find(v => v.id === activeVendorId) || null
  , [registeredVendors, activeVendorId]);

  const vendorShops = useMemo(() => {
    return registeredVendors.map(v => ({
      id: v.id,
      name: v.businessName,
      address: v.address,
      coords: v.lastLocation || { lat: 13.0827, lng: 80.2707 },
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
      let hasChange = false;
      const nextVendors = registeredVendors.map(v => {
        if (v.status === VendorStatus.ONLINE && v.liveUntil && v.liveUntil <= now) {
          hasChange = true;
          return { ...v, status: VendorStatus.OFFLINE, liveUntil: null };
        }
        return v;
      });

      if (hasChange) {
        setRegisteredVendors(nextVendors);
      }

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
  }, [registeredVendors, vendorProfile]);

  const allShops = useMemo(() => {
    const rawList = [...ROLLING_SIRRR_TRAIL, ...syncedSpots, ...vendorShops];
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
          showToast("Using map center for broadcast.", 'info');
          setCurrentLoc(location);
        }
      );
    } else {
      setGettingLocation(false);
      setCurrentLoc(location);
    }
  };

  const handleBroadcastLiveLink = () => {
    if (!vendorProfile || vendorProfile.status !== VendorStatus.ONLINE) {
      showToast("Go Live first to broadcast your link!", "error");
      return;
    }
    
    const newNotification: AppNotification = {
      id: `notif-${Date.now()}`,
      title: `${vendorProfile.businessName} is LIVE! 📢`,
      message: `Join the trail at our exact location. Special menu available for a limited time!`,
      timestamp: Date.now(),
      isRead: false,
      shopId: vendorProfile.id,
      emoji: vendorProfile.emoji || '🚚'
    };

    setNotifications(prev => [newNotification, ...prev]);
    showToast("Broadcast link sent to all explorers!", "success");
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          showToast("AI is understanding Tamil...", "info");
          const extracted = await processTamilVoiceMenu(base64Audio);
          if (extracted) {
            handleAutoAddMenuItem(extracted.name, extracted.price);
            showToast(`Added: ${extracted.name} (${extracted.price})`, "success");
          } else {
            showToast("Couldn't hear clearly. Try again in Tamil.", "error");
          }
        };
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
      showToast("Mic permission denied.", "error");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAutoAddMenuItem = (name: string, price: string) => {
    if (!activeVendorId) return;
    const newItem: MenuItem = {
      id: `m-voice-${Date.now()}`,
      name,
      price,
      description: 'Added via Tamil Voice Assistant'
    };
    setRegisteredVendors(prev => prev.map(v => {
      if (v.id === activeVendorId) {
        return { ...v, menu: [...v.menu, newItem] };
      }
      return v;
    }));
  };

  const handleGoLive = () => {
    const targetLoc = currentLoc || location;
    if (!activeVendorId || !targetLoc) return;
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
        return { ...v, status: VendorStatus.ONLINE, lastLocation: targetLoc, liveUntil: closingTime.getTime() };
      }
      return v;
    }));
    setIsMarkingSpot(false);
    setCurrentLoc(null);
    showToast("You are now LIVE at " + targetLoc.lat.toFixed(4) + ", " + targetLoc.lng.toFixed(4));
  };

  const handleSyncWithGemini = async () => {
    if (isSyncing) { stopSyncRef.current = true; return; }
    setIsSyncing(true); setSyncProgress(0); stopSyncRef.current = false;
    const result = await fetchLegendarySpots(syncBatchSize);
    if (result.spots.length === 0) {
       showToast("Sync failed. Check API key.", 'error');
       setIsSyncing(false); return;
    }
    setSyncedSpots(prev => {
      const existingNames = new Set(prev.map(s => s.name.toLowerCase()));
      const uniqueNew = result.spots.filter(s => !existingNames.has(s.name.toLowerCase()));
      return [...prev, ...uniqueNew];
    });
    showToast(`Discovered ${result.spots.length} new legends!`);
    setIsSyncing(false);
  };

  const handleRegisterVendor = () => {
    if (!regName || !regOwner) return;
    const newVendor: VendorProfile = {
      id: `v-${Date.now()}`,
      businessName: regName,
      ownerName: regOwner,
      cuisine: regCuisine || 'Street Food',
      emoji: regEmoji,
      description: 'A legendary roadside spot.',
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
    setRegName(''); setRegOwner('');
    setActiveVendorId(newVendor.id);
    showToast("Business registered!");
  };

  const handleDeleteVendor = (e: React.MouseEvent, vendorId: string) => {
    e.stopPropagation();
    if (window.confirm("Remove this business registration?")) {
      setRegisteredVendors(prev => prev.filter(v => v.id !== vendorId));
      if (activeVendorId === vendorId) setActiveVendorId(null);
      if (selectedShopId === vendorId) setSelectedShopId(null);
    }
  };

  const handleAddMenuItem = () => {
    if (!activeVendorId || !newMenuName || !newMenuPrice) return;
    const newItem: MenuItem = { id: `m-${Date.now()}`, name: newMenuName, price: `₹${newMenuPrice}` };
    setRegisteredVendors(prev => prev.map(v => v.id === activeVendorId ? { ...v, menu: [...v.menu, newItem] } : v));
    setIsAddingMenuItem(false); setNewMenuName(''); setNewMenuPrice('');
  };

  const handleRemoveMenuItem = (itemId: string) => {
    if (!activeVendorId) return;
    setRegisteredVendors(prev => prev.map(v => v.id === activeVendorId ? { ...v, menu: v.menu.filter(m => m.id !== itemId) } : v));
  };

  const handleAddReview = () => {
    if (!selectedShopId || !revName.trim() || !revText.trim()) return;
    const newReview: Review = { id: `rev-${Date.now()}`, userName: revName, rating: revRating, text: revText, date: new Date().toLocaleDateString() };
    setManualReviews(prev => ({ ...prev, [selectedShopId]: [newReview, ...(prev[selectedShopId] || [])] }));
    setIsAddingReview(false); setRevName(''); setRevText(''); setRevRating(5);
  };

  const handleSend = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const text = customPrompt || input;
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const loadingId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: loadingId, role: 'model', content: '...', timestamp: Date.now(), isLoading: true }]);
    const context = `Trail: ${allShops.filter(s => !s.isVendor).map(s => s.name).join(', ')}.`;
    const response = await askGemini(text, ModelType.MAPS, location, context);
    setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, content: response.content || '', groundingLinks: response.groundingLinks, isLoading: false } : m));
  };

  const selectShop = (shop: Shop) => {
    setLocation(shop.coords);
    setSelectedShopId(shop.id);
    if (!shop.isVendor) {
      handleSend(undefined, `Tell me about ${shop.name} in ${shop.address}. Why is it legendary?`);
    }
    if (isMobile) setIsSidebarOpen(false);
  };

  const updateCart = (itemId: string, delta: number) => {
    setCart(prev => {
      const next = Math.max(0, (prev[itemId] || 0) + delta);
      if (next === 0) { const { [itemId]: _, ...rest } = prev; return rest; }
      return { ...prev, [itemId]: next };
    });
  };

  const totalPrice = useMemo(() => {
    if (!selectedShop?.menu) return 0;
    return selectedShop.menu.reduce((sum, item) => sum + (parseInt(item.price.replace(/[^\d]/g, '')) || 0) * (cart[item.id] || 0), 0);
  }, [cart, selectedShop]);

  const handlePlaceOrder = async () => {
    setIsPlacingOrder(true);
    await new Promise(r => setTimeout(r, 2000));
    setIsPlacingOrder(false); setIsOrdering(false); setCart({});
    showToast("Order Placed! The vendor is preparing your food.");
  };

  const handleViewNotification = (shopId: string, notifId: string) => {
    const shop = allShops.find(s => s.id === shopId);
    if (shop) {
      selectShop(shop);
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, isRead: true } : n));
      setShowNotificationCenter(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="flex h-screen w-screen bg-slate-100 font-sans overflow-hidden relative text-slate-900">
      {/* Global High-Visibility Notification Banner for Explorers */}
      {userMode === 'customer' && notifications.some(n => !n.isRead) && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[2005] w-full max-w-lg px-6">
          <div className="bg-gradient-to-br from-indigo-700 via-purple-700 to-indigo-900 p-5 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-white/20 text-white animate-in slide-in-from-top-20 zoom-in-95 duration-500">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-4xl shadow-inner animate-bounce">
                {notifications.find(n => !n.isRead)?.emoji}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300 mb-1">Live Broadcast Alert</p>
                <p className="text-sm font-black mb-0.5 leading-tight">{notifications.find(n => !n.isRead)?.title}</p>
                <p className="text-[10px] text-white/70 line-clamp-1">{notifications.find(n => !n.isRead)?.message}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => handleViewNotification(notifications.find(n => !n.isRead)!.shopId!, notifications.find(n => !n.isRead)!.id)}
                  className="bg-white text-indigo-700 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-xl hover:scale-105 transition-all whitespace-nowrap"
                >
                  View on Map
                </button>
                <button onClick={() => setNotifications(prev => prev.map(n => ({...n, isRead: true})))} className="text-[9px] font-black uppercase opacity-40 hover:opacity-100 text-center">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeToast && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] px-6 py-3 rounded-full shadow-2xl text-white text-xs font-black uppercase tracking-widest animate-in slide-in-from-bottom-5 duration-300 ${activeToast.type === 'success' ? 'bg-emerald-600' : 'bg-indigo-600'}`}>
          {activeToast.message}
        </div>
      )}

      <div className="absolute top-4 left-4 z-[1001] flex bg-white/95 backdrop-blur rounded-full p-1 shadow-2xl border border-slate-200">
        <button onClick={() => setUserMode('customer')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${userMode === 'customer' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>Explorer</button>
        <button onClick={() => setUserMode('vendor')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${userMode === 'vendor' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>Partner Hub</button>
      </div>

      <div className={`fixed inset-y-0 left-0 md:relative z-40 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-full md:w-[420px] bg-white shadow-2xl flex flex-col border-r border-slate-200 overflow-hidden`}>
        {userMode === 'customer' ? (
          <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
            <div className="bg-indigo-900 text-white pt-5 shadow-lg shrink-0 z-10">
              <div className="px-5 pb-4 flex justify-between items-center">
                <h1 className="text-xl font-black tracking-tight">🍲 GEOMIND</h1>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowNotificationCenter(!showNotificationCenter)} className="relative bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                    <span>🔔</span>
                    {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-black animate-pulse">{unreadCount}</span>}
                  </button>
                  <button onClick={() => setIsSidebarOpen(false)} className="bg-white/10 p-2 rounded-full text-white md:hidden">✕</button>
                </div>
              </div>
              <div className="flex border-t border-white/10">
                <button onClick={() => setCustomerTab('geomind')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest ${customerTab === 'geomind' ? 'bg-white/10 border-b-2 border-white' : 'text-white/40'}`}>GeoMind AI</button>
                <button onClick={() => setCustomerTab('live')} className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest ${customerTab === 'live' ? 'bg-white/10 border-b-2 border-white' : 'text-white/40'}`}>Live Now</button>
              </div>
            </div>

            {showNotificationCenter && (
              <div className="absolute top-24 right-4 left-4 z-50 bg-white rounded-3xl shadow-2xl border border-slate-200 max-h-[60%] flex flex-col animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b flex justify-between items-center"><h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Broadcast History</h3><button onClick={() => setShowNotificationCenter(false)} className="text-slate-300 hover:text-slate-900">✕</button></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {notifications.length === 0 && <p className="text-center py-10 text-[10px] text-slate-400 italic font-black uppercase">No broadcasts yet</p>}
                  {notifications.map(n => (
                    <button key={n.id} onClick={() => handleViewNotification(n.shopId!, n.id)} className={`w-full text-left p-4 rounded-2xl border transition-all ${n.isRead ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-indigo-50 border-indigo-100 shadow-sm'}`}>
                      <div className="flex gap-3 items-center">
                        <span className="text-2xl">{n.emoji}</span>
                        <div><p className="text-xs font-black text-slate-800">{n.title}</p><p className="text-[10px] text-slate-500 line-clamp-1">{n.message}</p></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {customerTab === 'geomind' ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="p-4 border-b bg-white shadow-sm shrink-0 flex flex-col gap-3">
                  <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Filter discovered spots..." className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none" />
                  <button onClick={handleSyncWithGemini} className={`w-full py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest text-[11px] ${isSyncing ? 'bg-red-500' : 'bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500'}`}>
                    {isSyncing ? 'SCANNING...' : '✨ DEEP SYNC FOOD TRAIL'}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {filteredTrail.map(shop => (
                    <button key={shop.id} onClick={() => selectShop(shop)} className={`w-full text-left p-4 rounded-2xl transition-all border ${selectedShopId === shop.id ? 'bg-indigo-50 border-indigo-200 shadow-inner' : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{shop.emoji || '🥘'}</span>
                        <div><div className="text-[12px] font-black text-slate-800">{shop.name}</div><div className="text-[9px] text-slate-400 font-bold uppercase">{shop.cuisine} • {shop.address}</div></div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex-1 border-t border-slate-200 bg-slate-50/50 flex flex-col overflow-hidden">
                   <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatContainerRef}>
                      {messages.map(m => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[90%] p-3.5 rounded-2xl shadow-sm border ${m.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white border-slate-200'}`}>
                             {m.isLoading ? <div className="flex gap-1 animate-pulse"><div className="w-2 h-2 bg-slate-300 rounded-full"></div><div className="w-2 h-2 bg-slate-400 rounded-full"></div></div> : <p className="text-[12px] font-semibold">{m.content}</p>}
                             {m.groundingLinks?.map((link, i) => (
                               <a key={i} href={link.web?.uri || link.maps?.uri} target="_blank" className="block mt-2 text-[9px] font-black text-indigo-500 uppercase truncate">📍 {link.web?.title || link.maps?.title}</a>
                             ))}
                          </div>
                        </div>
                      ))}
                   </div>
                   <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200">
                      <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about the trail..." className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                   </form>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {vendorShops.filter(s => s.status === VendorStatus.ONLINE).map(shop => (
                  <div key={shop.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-4"><span className="text-4xl">{shop.emoji}</span><div><h3 className="text-lg font-black">{shop.name}</h3><p className="text-[10px] font-black text-emerald-600 uppercase mt-1">Live Location: {shop.coords.lat.toFixed(4)}, {shop.coords.lng.toFixed(4)}</p></div></div>
                    </div>
                    <button onClick={() => selectShop(shop)} className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg">View Store</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h1 className="text-2xl font-black">Partner Hub</h1>
              {activeVendorId && <button onClick={() => setActiveVendorId(null)} className="text-[10px] font-black uppercase bg-white/10 px-4 py-2 rounded-2xl">‹ BACK</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {!activeVendorId ? (
                <>
                  {registeredVendors.map(v => (
                    <div key={v.id} className="relative group">
                      <button onClick={() => setActiveVendorId(v.id)} className="w-full bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-indigo-300 transition-all">
                        <div className="flex items-center gap-4"><span className="text-4xl">{v.emoji}</span><div className="text-left"><h3 className="text-base font-black text-slate-800">{v.businessName}</h3><p className="text-[10px] font-bold text-slate-400 uppercase">{v.ownerName}</p></div></div>
                        <div className={`w-2.5 h-2.5 rounded-full ${v.status === VendorStatus.ONLINE ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`}></div>
                      </button>
                      <button onClick={(e) => handleDeleteVendor(e, v.id)} className="absolute -top-2 -right-2 w-8 h-8 bg-white border border-slate-200 text-red-500 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all">✕</button>
                    </div>
                  ))}
                  <button onClick={() => setIsRegistering(true)} className="w-full py-6 border-2 border-dashed border-slate-300 rounded-3xl text-slate-500 font-black text-xs uppercase hover:bg-white transition-all">+ Register New Business</button>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl space-y-6">
                    <div className="flex items-center gap-4"><span className="text-5xl">{vendorProfile?.emoji}</span><h2 className="text-2xl font-black">{vendorProfile?.businessName}</h2></div>
                    {vendorProfile?.status === VendorStatus.ONLINE ? (
                      <div className="bg-indigo-900 text-white p-8 rounded-3xl text-center shadow-2xl border border-white/10">
                        <p className="text-[10px] font-black uppercase opacity-50 mb-2">Live Now (Until?)</p>
                        <span className="text-4xl font-mono font-black">{timeLeftDisplay}</span>
                        <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                           <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Broadcasting From</p>
                           <p className="text-xs font-mono font-bold text-emerald-400">{vendorProfile?.lastLocation.lat.toFixed(6)}, {vendorProfile?.lastLocation.lng.toFixed(6)}</p>
                        </div>
                        
                        <div className="flex flex-col gap-3 mt-6">
                          <button onClick={handleBroadcastLiveLink} className="w-full py-5 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl text-[11px] font-black uppercase shadow-[0_10px_30px_rgba(99,102,241,0.4)] animate-pulse hover:scale-[1.03] transition-all border border-white/20">📢 Notify Location Link</button>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={getCurrentLocation} className="py-3 bg-white/10 rounded-xl text-[10px] font-black uppercase hover:bg-white/20 transition-all">Update GPS</button>
                            <button onClick={() => setRegisteredVendors(prev => prev.map(v => v.id === activeVendorId ? {...v, status: VendorStatus.OFFLINE, liveUntil: null} : v))} className="py-3 bg-red-500/20 text-red-400 rounded-xl font-black text-[10px] uppercase hover:bg-red-500/30 transition-all">End Broadcast</button>
                          </div>
                        </div>
                      </div>
                    ) : <button onClick={() => setIsMarkingSpot(true)} className="w-full py-8 bg-indigo-600 text-white rounded-3xl font-black text-lg uppercase shadow-2xl hover:bg-indigo-700 transition-colors">📍 GO LIVE AT POSITION</button>}
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xl">
                    <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-black">Menu Specials</h3>
                      <button onMouseDown={startVoiceRecording} onMouseUp={stopVoiceRecording} onTouchStart={startVoiceRecording} onTouchEnd={stopVoiceRecording} className={`px-4 py-2 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${isRecording ? 'bg-red-100 border-red-500 text-red-600 animate-pulse' : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'}`}>
                        {isRecording ? 'Listening (Tamil)...' : '🎙️ Tamil Voice Add'}
                      </button>
                    </div>
                    <div className="space-y-3">
                      {vendorProfile?.menu.map(item => (
                        <div key={item.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border group hover:border-indigo-200">
                          <div><p className="text-sm font-black">{item.name}</p><p className="text-[10px] font-bold text-slate-400">{item.price}</p></div>
                          <button onClick={() => handleRemoveMenuItem(item.id)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2">✕</button>
                        </div>
                      ))}
                      <button onClick={() => setIsAddingMenuItem(true)} className="w-full py-3 bg-slate-100 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-black text-[10px] uppercase hover:bg-white">+ Manual Add Item</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 relative h-full">
        <Map center={location} shops={allShops} onLocationChange={setLocation} onShopClick={selectShop} />
        {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="absolute left-4 top-1/2 -translate-y-1/2 z-[1000] bg-white w-14 h-14 rounded-2xl shadow-2xl text-indigo-600 font-black text-2xl flex items-center justify-center hover:scale-110">→</button>}
        
        {selectedShop && (
          <div className="absolute bottom-0 md:bottom-10 left-0 md:left-1/2 md:-translate-x-1/2 z-[500] w-full md:w-[500px] pointer-events-none p-4">
            <div className="bg-slate-900/95 backdrop-blur-3xl p-6 rounded-[2.5rem] shadow-2xl border border-white/10 pointer-events-auto flex flex-col max-h-[75vh] animate-in slide-in-from-bottom-5 duration-500">
              <div className="flex justify-between items-start mb-6 shrink-0">
                <div className="flex items-center gap-4"><span className="text-5xl">{selectedShop.emoji}</span><div className="flex-1"><h3 className="text-xl font-black text-white">{selectedShop.name}</h3><div className="flex items-center gap-2"><span className="text-indigo-400 text-xs">★</span><span className="text-white font-black">{selectedShop.rating}</span><span className="text-slate-500 font-bold text-xs uppercase ml-2">• {selectedShop.cuisine}</span></div></div></div>
                <button onClick={() => setSelectedShopId(null)} className="text-white/50 p-2 hover:text-white transition-colors">✕</button>
              </div>
              <div className="space-y-5 overflow-y-auto custom-scrollbar pr-2 pb-2 text-white">
                <p className="text-sm">{selectedShop.address}</p>
                {selectedShop.isVendor && <p className="text-[10px] font-black text-emerald-400 uppercase">Live Street Presence Verified</p>}
                {selectedShop.menu && selectedShop.menu.length > 0 && (
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-[10px] font-black text-indigo-400 uppercase mb-3 tracking-widest">Store Specials</p>
                    <div className="space-y-2">{selectedShop.menu.map(item => (
                      <div key={item.id} className="flex justify-between items-center text-xs"><span className="font-bold">{item.name}</span><span className="text-indigo-300 font-black">{item.price}</span></div>
                    ))}</div>
                  </div>
                )}
                <div className="pt-6 border-t border-white/10">
                  <div className="flex justify-between items-center mb-4"><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Buzz</p><button onClick={() => setIsAddingReview(true)} className="text-[9px] font-black text-indigo-400 uppercase bg-indigo-500/20 px-4 py-2 rounded-full border border-indigo-500/30 hover:bg-indigo-500/30 transition-all">Add Review</button></div>
                  <div className="space-y-4">{selectedShop.reviews?.map(rev => (
                    <div key={rev.id} className="bg-white/5 p-4 rounded-2xl border border-white/5"><div className="flex justify-between items-center mb-2"><span className="text-white text-xs font-black">{rev.userName}</span><span className="text-indigo-400 text-[10px]">{'★'.repeat(rev.rating)}</span></div><p className="text-slate-300 text-[11px] leading-relaxed">{rev.text}</p></div>
                  ))}</div>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-white/10 flex gap-3 shrink-0">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedShop.coords.lat},${selectedShop.coords.lng}`} target="_blank" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase text-center hover:bg-indigo-700 transition-colors shadow-lg">Get Directions</a>
                <button onClick={() => selectedShop.isVendor ? setIsOrdering(true) : showToast("Calling legendary shop...", "success")} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-lg"> {selectedShop.isVendor ? 'Order Now' : 'Call Shop'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isRegistering && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2002] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-900 p-8 text-white text-center"><h2 className="text-2xl font-black">Register Street Spot</h2></div>
            <div className="p-8 space-y-4">
              <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="Business Name" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              <input value={regOwner} onChange={e => setRegOwner(e.target.value)} placeholder="Owner Name" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300" />
              <div className="flex gap-2 justify-center">{['🥘','🌶️','🍗','🥟','☕','🍜'].map(e => (
                <button key={e} onClick={() => setRegEmoji(e)} className={`p-3 rounded-xl text-2xl transition-all ${regEmoji === e ? 'bg-indigo-600 shadow-lg scale-110' : 'bg-slate-100 hover:bg-slate-200'}`}>{e}</button>
              ))}</div>
              <button onClick={handleRegisterVendor} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl mt-4">Complete Registration</button>
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
              <input value={newMenuName} onChange={e => setNewMenuName(e.target.value)} placeholder="Dish Name" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none" />
              <input value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} placeholder="Price (e.g. 150)" className="w-full p-4 rounded-xl bg-slate-50 border text-sm font-bold outline-none" />
              <button onClick={handleAddMenuItem} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl mt-4">Add to Menu</button>
              <button onClick={() => setIsAddingMenuItem(false)} className="w-full py-2 text-slate-400 font-black text-[10px] uppercase text-center">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isMarkingSpot && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[2001] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-indigo-600 p-8 text-white text-center"><h2 className="text-2xl font-black">📍 GO LIVE</h2><p className="text-[10px] font-black text-white/50 uppercase mt-2">Broadcast your current street location</p></div>
            <div className="p-8 space-y-6">
              {!currentLoc && !isGettingLocation ? (
                <button onClick={getCurrentLocation} className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black shadow-xl hover:bg-indigo-700 transition-all uppercase text-[12px] tracking-widest">GET PRECISE COORDINATES</button>
              ) : (
                <div className="space-y-6">
                  <div className="bg-slate-50 p-6 rounded-3xl border border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-600 uppercase text-center mb-4 tracking-widest">LIVE BROADCAST COORDINATES</p>
                    <div className="flex justify-between text-xs font-black text-slate-600 px-4 mb-4"><div className="flex flex-col items-center"><span>LAT</span><span className="text-indigo-600">{currentLoc?.lat.toFixed(6)}</span></div><div className="flex flex-col items-center"><span>LNG</span><span className="text-indigo-600">{currentLoc?.lng.toFixed(6)}</span></div></div>
                    <div className="flex justify-center items-center gap-2 border-t pt-4">
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
              <button onClick={() => setIsMarkingSpot(false)} className="w-full py-2 text-slate-400 font-black text-[10px] uppercase text-center">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isOrdering && selectedShop && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-2xl z-[2010] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="bg-emerald-600 p-8 text-white flex justify-between items-center shrink-0">
               <div className="flex items-center gap-4"><span className="text-4xl">{selectedShop.emoji}</span><div><h2 className="text-xl font-black uppercase tracking-widest">{selectedShop.name}</h2><p className="text-[10px] font-bold text-white/50 uppercase">Secure Ordering Portal</p></div></div>
               <button onClick={() => setIsOrdering(false)} className="bg-white/10 p-2 rounded-full hover:bg-white/20">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedShop.menu?.map(item => (
                    <div key={item.id} className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex justify-between items-center">
                       <div className="flex-1 overflow-hidden pr-2"><p className="text-sm font-black text-slate-800 truncate">{item.name}</p><p className="text-xs font-black text-emerald-600">{item.price}</p></div>
                       <div className="flex items-center bg-white rounded-2xl p-1 shadow-sm border border-slate-100 shrink-0">
                          <button onClick={() => updateCart(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-emerald-600 font-black">-</button>
                          <span className="w-8 text-center text-xs font-black">{cart[item.id] || 0}</span>
                          <button onClick={() => updateCart(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-emerald-600 font-black">+</button>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
            <div className="p-8 bg-slate-50 border-t shrink-0">
               <div className="flex justify-between items-center mb-6"><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grand Total</p><p className="text-3xl font-black text-slate-900">₹{totalPrice}</p></div></div>
               <button onClick={handlePlaceOrder} disabled={isPlacingOrder || Object.keys(cart).length === 0} className={`w-full py-6 rounded-3xl text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl transition-all ${Object.keys(cart).length > 0 ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                 {isPlacingOrder ? 'PROCESSING...' : 'CONFIRM ORDER'}
               </button>
            </div>
          </div>
        </div>
      )}

      {isAddingReview && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[2005] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="bg-indigo-600 p-10 text-white text-center"><span className="text-5xl mb-4 block">💬</span><h2 className="text-xl font-black uppercase tracking-[0.2em]">Post a Buzz</h2></div>
            <div className="p-10 space-y-6">
              <input value={revName} onChange={e => setRevName(e.target.value)} placeholder="Explorer Name" className="w-full p-4 rounded-2xl bg-slate-50 border text-sm font-bold outline-none" />
              <div className="flex justify-center gap-1.5">{[1,2,3,4,5].map(star => (<button key={star} onClick={() => setRevRating(star)} className={`text-4xl ${revRating >= star ? 'text-indigo-600' : 'text-slate-100'}`}>★</button>))}</div>
              <textarea value={revText} onChange={e => setRevText(e.target.value)} placeholder="Review this spot..." className="w-full p-5 rounded-3xl bg-slate-50 border text-sm font-bold h-36 outline-none resize-none" />
              <button onClick={handleAddReview} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl">Publish</button>
              <button onClick={() => setIsAddingReview(false)} className="w-full py-2 text-slate-400 font-black text-[9px] uppercase tracking-widest">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
