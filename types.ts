
export enum ModelType {
  MAPS = 'gemini-2.5-flash',
  SEARCH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview'
}

export interface MenuItem {
  id: string;
  name: string;
  price: string;
  description?: string;
  category?: string;
}

export interface Review {
  id: string;
  userName: string;
  rating: number;
  text: string;
  date: string;
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
  maps?: {
    uri?: string;
    title?: string;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  groundingLinks?: GroundingChunk[];
  isLoading?: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export enum VendorStatus {
  ONLINE = 'online',
  OFFLINE = 'offline'
}

export interface VendorProfile {
  id: string;
  businessName: string;
  description: string;
  ownerName: string;
  status: VendorStatus;
  lastLocation: LatLng;
  address: string;
  menu: MenuItem[];
  operatingHours: string;
  views: number;
  liveUntil: number | null;
  emoji?: string;
  cuisine?: string;
  rating?: number;
  reviews?: Review[];
}

export interface Shop {
  id: string;
  name: string;
  address: string;
  coords: LatLng;
  isVendor?: boolean;
  status?: VendorStatus;
  // Fixed typo: was "menu?: MenuItem?: string;"
  menu?: MenuItem[];
  description?: string;
  liveUntil?: number | null;
  emoji?: string;
  cuisine?: string;
  rating?: number;
  reviews?: Review[];
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  isRead: boolean;
  shopId?: string;
  emoji?: string;
}
