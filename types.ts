
export interface LatLng {
  lat: number;
  lng: number;
}

export enum VendorStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE'
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: GroundingSource[];
  isThinking?: boolean;
}

export interface MenuItem {
  name: string;
  price: number;
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
  menu?: MenuItem[];
}

export interface VendorProfile {
  id: string;
  name: string;
  emoji: string;
  cuisine: string;
  description: string;
  lastLocation?: LatLng;
  menu: MenuItem[];
}

export interface AgentLog {
  id: string;
  agent: 'Discovery' | 'Linguistic' | 'Spatial';
  message: string;
  status: 'processing' | 'resolved' | 'failed';
}
