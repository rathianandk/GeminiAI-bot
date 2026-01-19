
export enum ModelType {
  MAPS = 'gemini-2.5-flash',
  SEARCH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview'
}

export interface MenuItem {
  id: string;
  name: string;
  price: string;
  category?: string;
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

export interface Shop {
  id: string;
  name: string;
  address: string;
  coords: LatLng;
  isVendor?: boolean;
  menu?: MenuItem[];
}
