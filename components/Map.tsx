import React, { useEffect, useRef } from 'react';
import { LatLng, Shop, VendorStatus } from '../types';

interface MapProps {
  center: LatLng;
  shops: Shop[];
  onLocationChange: (loc: LatLng) => void;
  onShopClick: (shop: Shop) => void;
}

declare const L: any;

const Map: React.FC<MapProps> = ({ center, shops, onLocationChange, onShopClick }) => {
  const mapRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const shopMarkersGroupRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([center.lat, center.lng], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapRef.current);
    shopMarkersGroupRef.current = L.layerGroup().addTo(mapRef.current);

    // Global style for markers - Truck Icon Design
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes pinDrop {
        0% { transform: translateY(-20px) scale(0); opacity: 0; }
        60% { transform: translateY(5px) scale(1.1); opacity: 1; }
        100% { transform: translateY(0) scale(1); opacity: 1; }
      }

      .custom-marker-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        animation: pinDrop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        filter: invert(1) hue-rotate(180deg) brightness(0.7) contrast(1.2); /* Counter-act map inversion */
        overflow: visible !important;
      }

      .custom-marker-container.is-offline {
        opacity: 0.6;
        filter: invert(1) hue-rotate(180deg) grayscale(0.8);
      }

      .marker-truck-badge {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: 2px solid rgba(255, 255, 255, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4), 0 0 15px rgba(59, 130, 246, 0.3);
        z-index: 2;
        position: relative;
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Truck SVG Styling */
      .truck-svg {
        width: 30px;
        height: 30px;
        fill: white;
      }

      .marker-label {
        margin-top: 6px;
        background: rgba(15, 23, 42, 0.9); /* Dark background */
        padding: 5px 14px;
        border-radius: 10px;
        border: 1px solid #6366F1; /* Neon Indigo Border */
        color: #F8FAFC; /* Bright Text */
        font-weight: 800;
        font-size: 11px;
        white-space: nowrap;
        box-shadow: 0 4px 15px rgba(0,0,0,0.5), 0 0 10px rgba(99, 102, 241, 0.2);
        backdrop-filter: blur(8px);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        z-index: 1;
        pointer-events: none;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .is-offline .marker-label {
        border-color: #475569;
        color: #94A3B8;
        background: rgba(30, 41, 59, 0.8);
      }

      /* Hover States */
      .custom-marker-container:hover .marker-truck-badge {
        transform: scale(1.2) translateY(-4px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.6), 0 0 25px rgba(59, 130, 246, 0.5);
      }
      
      .custom-marker-container:hover .marker-label {
        background: #1E293B;
        border-color: #818CF8;
        color: #FFFFFF;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 15px rgba(129, 140, 248, 0.4);
      }

      /* User Marker Pulse */
      .user-marker-dot {
        background: #6366F1;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 0 20px rgba(99, 102, 241, 0.8);
        filter: invert(1) hue-rotate(180deg);
      }
    `;
    document.head.appendChild(style);

    userMarkerRef.current = L.marker([center.lat, center.lng], { 
      draggable: true,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: 'user-marker-icon',
        html: `<div class="user-marker-dot"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(mapRef.current);

    userMarkerRef.current.on('dragend', () => {
      const pos = userMarkerRef.current.getLatLng();
      onLocationChange({ lat: pos.lat, lng: pos.lng });
    });

    mapRef.current.on('click', (e: any) => {
      const pos = e.latlng;
      userMarkerRef.current.setLatLng(pos);
      onLocationChange({ lat: pos.lat, lng: pos.lng });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !shopMarkersGroupRef.current) return;
    shopMarkersGroupRef.current.clearLayers();

    shops.forEach(shop => {
      const isOnline = shop.isVendor && shop.status === VendorStatus.ONLINE;
      const isVendorOffline = shop.isVendor && shop.status === VendorStatus.OFFLINE;
      const isAIsync = shop.id.startsWith('sync');
      
      let truckColor = '#6366F1'; // Default Indigo
      if (isOnline) {
        truckColor = '#10B981'; // Live Green
      } else if (isVendorOffline) {
        truckColor = '#475569'; // Offline Gray
      } else if (isAIsync) {
        truckColor = '#D946EF'; // AI Pink/Magenta
      }

      const truckSvg = `
        <svg class="truck-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20,8H17V4H3C1.89,4 1,4.89 1,6V17H3A3,3 0 0,0 6,20A3,3 0 0,0 9,17H15A3,3 0 0,0 18,20A3,3 0 0,0 21,17H23V12L20,8M6,18.5A1.5,1.5 0 0,1 4.5,17A1.5,1.5 0 0,1 6,15.5A1.5,1.5 0 0,1 7.5,17A1.5,1.5 0 0,1 6,18.5M17,12V9.5H19.5L21.47,12H17M18,18.5A1.5,1.5 0 0,1 16.5,17A1.5,1.5 0 0,1 18,15.5A1.5,1.5 0 0,1 19.5,17A1.5,1.5 0 0,1 18,18.5Z" />
        </svg>
      `;

      const markerHtml = `
        <div class="custom-marker-container ${isVendorOffline ? 'is-offline' : ''}">
          <div class="marker-truck-badge" style="background: ${truckColor}; border-color: ${isOnline ? '#34D399' : 'rgba(255,255,255,0.6)'};">
            ${truckSvg}
            <span style="position: absolute; top: -8px; right: -8px; font-size: 18px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${shop.emoji || ''}</span>
          </div>
          <div class="marker-label">
            ${shop.name}
          </div>
        </div>
      `;

      const marker = L.marker([shop.coords.lat, shop.coords.lng], {
        icon: L.divIcon({
          className: 'shop-marker-icon-wrap',
          html: markerHtml,
          iconSize: [120, 80],
          iconAnchor: [60, 60]
        }),
        zIndexOffset: isOnline ? 500 : (isAIsync ? 300 : 100)
      })
      .on('click', () => onShopClick(shop));
      
      shopMarkersGroupRef.current.addLayer(marker);
    });
  }, [shops]);

  useEffect(() => {
    if (mapRef.current && center) {
      const mapCenter = mapRef.current.getCenter();
      if (Math.abs(mapCenter.lat - center.lat) > 0.005 || Math.abs(mapCenter.lng - center.lng) > 0.005) {
        mapRef.current.flyTo([center.lat, center.lng], 15, { 
          duration: 1.2,
          easeLinearity: 0.25 
        });
      } else {
        userMarkerRef.current.setLatLng([center.lat, center.lng]);
      }
    }
  }, [center]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default Map;