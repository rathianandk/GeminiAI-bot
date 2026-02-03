
export interface LatLng {
  lat: number;
  lng: number;
}

export enum VendorStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  timestamp: string;
}

export interface MenuItem {
  name: string;
  price: number;
  isSoldOut?: boolean;
}

export interface SafetyMetrics {
  crimeSafety: number;
  policeProximity: number;
  footfallIntensity: number;
  lighting: number;
  vibe: number;
}

// Added UrbanLogistics interface to resolve "exported member not found" error in App.tsx
export interface UrbanLogistics {
  transitAccessibility: number;
  walkabilityScore: number;
  parkingAvailability: number;
}

export interface FootfallPoint {
  period: string;
  volume: number;
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
  reviews?: Review[];
  safetyMetrics?: SafetyMetrics;
  // Added urbanLogistics property to Shop interface
  urbanLogistics?: UrbanLogistics;
  predictedFootfall?: FootfallPoint[];
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
  reviews?: Review[];
  safetyMetrics?: SafetyMetrics;
  // Added urbanLogistics property to VendorProfile interface
  urbanLogistics?: UrbanLogistics;
  predictedFootfall?: FootfallPoint[];
}

export interface AgentLog {
  id: string;
  agent: 'Discovery' | 'Linguistic' | 'Spatial' | 'Lens' | 'Analytics' | 'Historian' | 'Impact';
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

export interface LensFrame {
  id: string;
  timestamp: string;
  description: string;
  category: 'Landscape' | 'Sidewalk' | 'Boundary' | 'Perspective';
  spatialInsight: string;
}

export interface FoodAnalysis {
  name: string;
  protein: string;
  calories: string;
  carbs: string;
  history_tags: string[];
  authenticity_score: string;
  narrative: string;
  error?: string;
}

export interface LensAnalysis {
  observations: LensObservation[];
  extractedFrames: LensFrame[];
  recommendation: string;
  videoSource: string;
  foodAnalysis?: FoodAnalysis;
}

export interface SpatialAnalytics {
  cuisineDistribution: { label: string; count: number; percentage: number }[];
  priceSpectrum: { range: string; nodes: string[] }[];
  legendaryIndex: { name: string; score: number; reasoning: string }[];
  customerSegmentation: { segment: string; description: string; volume: number }[];
  sectorSummary: string;
}

export interface FlavorEra {
  period: string;
  profile: string;
  description: string;
  notableIngredients: string[];
  popularItems: string[];
  historicalContext: string;
}

export interface FlavorGenealogy {
  neighborhood: string;
  timeline: FlavorEra[];
  summary: string;
}
