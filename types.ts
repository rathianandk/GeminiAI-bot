/**
 * Geo-coordinates representation
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Status of a street vendor node on the grid
 */
export enum VendorStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

/**
 * User-submitted review entity
 */
export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  timestamp: string;
}

/**
 * Inventory item for a vendor node
 */
export interface MenuItem {
  name: string;
  price: number;
  isSoldOut?: boolean;
}

/**
 * Intelligence metrics regarding location safety
 */
export interface SafetyMetrics {
  crimeSafety: number;
  policeProximity: number;
  footfallIntensity: number;
  lighting: number;
  vibe: number;
  nearestPoliceStations?: string[];
}

/**
 * Logistics data for urban accessibility
 */
export interface UrbanLogistics {
  transitAccessibility: number;
  walkabilityScore: number;
  parkingAvailability: number;
  publicTransportNodes?: string[];
}

/**
 * Individual point for footfall trend charts
 */
export interface FootfallPoint {
  period: string;
  volume: number;
}

/**
 * AI-reasoned success indicators for a food node
 */
export interface SuccessReasoning {
  locationGravity: number;
  flavorMoat: number;
  socialResonance: number;
  economicFit: number;
}

/**
 * Core shop/stall entity used by the Map and UI
 */
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
  urbanLogistics?: UrbanLogistics;
  predictedFootfall?: FootfallPoint[];
  successReasoning?: SuccessReasoning;
  // hygieneScore supports vendor node reporting and quality tracking
  hygieneScore?: number;
}

/**
 * Extended profile for registered partner nodes
 */
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
  urbanLogistics?: UrbanLogistics;
  predictedFootfall?: FootfallPoint[];
  successReasoning?: SuccessReasoning;
  hygieneScore?: number;
}

/**
 * Log entry for autonomous agent activities
 */
export interface AgentLog {
  id: string;
  agent: 'Discovery' | 'Linguistic' | 'Spatial' | 'Lens' | 'Analytics' | 'Historian' | 'Impact';
  message: string;
  status: 'processing' | 'resolved' | 'failed';
}

/**
 * Chat message entity for the voice/text interface
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  isThinking?: boolean;
  sources?: GroundingSource[];
}

/**
 * Grounding reference from Google Search/Maps
 */
export interface GroundingSource {
  title: string;
  uri: string;
}

/**
 * Visual observation from the Lens agent
 */
export interface LensObservation {
  id: string;
  type: 'bottleneck' | 'flow' | 'friction' | 'opportunity';
  detail: string;
  causalBottleneck: string;
}

/**
 * Extracted frame metadata from visual scraping
 */
export interface LensFrame {
  id: string;
  timestamp: string;
  description: string;
  category: 'Landscape' | 'Sidewalk' | 'Boundary' | 'Perspective';
  spatialInsight: string;
}

/**
 * Deep food analysis from Lens image mining
 */
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

/**
 * Complete synthesis of Lens activity
 */
export interface LensAnalysis {
  observations: LensObservation[];
  extractedFrames: LensFrame[];
  recommendation: string;
  videoSource: string;
  foodAnalysis?: FoodAnalysis;
}

/**
 * High-level analytics dashboard state
 */
export interface SpatialAnalytics {
  cuisineDistribution: { label: string; count: number; percentage: number }[];
  priceSpectrum: { range: string; nodes: string[] }[];
  legendaryIndex: { name: string; score: number; reasoning: string }[];
  customerSegmentation: { segment: string; description: string; volume: number }[];
  sectorSummary: string;
}

/**
 * Contextual era for Flavor Genealogy
 */
export interface FlavorEra {
  period: string;
  profile: string;
  description: string;
  notableIngredients: string[];
  popularItems: string[];
  historicalContext: string;
}

/**
 * Complete temporal analysis of a neighborhood's food culture
 */
export interface FlavorGenealogy {
  neighborhood: string;
  timeline: FlavorEra[];
  summary: string;
}