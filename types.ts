
export interface LatLng {
  lat: number;
  lng: number;
}

export enum VendorStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
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
  menu?: MenuItem[];
  hours?: string;
  youtubeLink?: string;
}

export interface VendorProfile {
  id: string;
  name: string;
  emoji: string;
  cuisine: string;
  description: string;
  lastLocation?: LatLng;
  menu: MenuItem[];
  hours: string;
  youtubeLink?: string;
}

export interface AgentLog {
  id: string;
  agent: 'Discovery' | 'Linguistic' | 'Spatial' | 'Lens' | 'Analytics';
  message: string;
  status: 'processing' | 'resolved' | 'failed';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
  sources?: GroundingSource[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface LensObservation {
  id: string;
  type: 'bottleneck' | 'flow' | 'friction' | 'opportunity';
  detail: string;
  causalBottleneck: string;
}

export interface LensAnalysis {
  observations: LensObservation[];
  recommendation: string;
  videoSource: string;
}

export interface SpatialAnalytics {
  cuisineDistribution: { label: string; count: number; percentage: number }[];
  priceSpectrum: { range: string; nodes: string[] }[];
  legendaryIndex: { name: string; score: number; reasoning: string }[];
  customerSegmentation: { segment: string; description: string; volume: number }[];
  sectorSummary: string;
}
