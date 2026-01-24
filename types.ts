
export interface LatLng {
  lat: number;
  lng: number;
}

export enum VendorStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE'
}

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { uri: string; title: string };
}

export interface Shop {
  id: string;
  name: string;
  coords: LatLng;
  isVendor: boolean;
  status?: VendorStatus;
  emoji?: string;
  cuisine?: string;
  description?: string;
  address?: string;
  sourceUrl?: string;
  landmarks?: string[];
}

export interface VendorProfile {
  id: string;
  name: string;
  emoji: string;
  cuisine: string;
  description: string;
  lastLocation?: LatLng;
}

export interface AgentLog {
  id: string;
  agent: 'Discovery' | 'Linguistic' | 'Spatial';
  message: string;
  status: 'processing' | 'resolved' | 'failed';
}

export interface AppState {
  isMining: boolean;
  discoveredShops: Shop[];
  logs: AgentLog[];
  activeShop: Shop | null;
  userLocation: LatLng | null;
}
