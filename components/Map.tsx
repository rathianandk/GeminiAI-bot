
import React, { useEffect, useRef } from 'react';
import { LatLng, Shop } from '../types';

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

    userMarkerRef.current = L.marker([center.lat, center.lng], { 
      draggable: true,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: 'user-marker',
        html: `<div style="background-color:#4F46E5; width:22px; height:22px; border-radius:50%; border:4px solid white; box-shadow: 0 0 30px rgba(79,70,229,0.7); animation: pulse 2s infinite;"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
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
      const color = shop.isVendor ? '#4F46E5' : '#EF4444';
      const shadow = shop.isVendor ? 'rgba(79,70,229,0.4)' : 'rgba(239,68,68,0.4)';
      const marker = L.marker([shop.coords.lat, shop.coords.lng], {
        icon: L.divIcon({
          className: 'shop-marker',
          html: `<div style="background-color:${color}; padding:6px 14px; border-radius:14px; color:white; font-weight:900; font-size:11px; border:2.5px solid white; white-space:nowrap; box-shadow: 0 8px 20px ${shadow}; transform: translateY(-50%); transition: all 0.2s ease;">${shop.name}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        })
      })
      .on('click', () => onShopClick(shop));
      
      shopMarkersGroupRef.current.addLayer(marker);
    });
  }, [shops]);

  useEffect(() => {
    if (mapRef.current && center) {
      const mapCenter = mapRef.current.getCenter();
      if (Math.abs(mapCenter.lat - center.lat) > 0.001 || Math.abs(mapCenter.lng - center.lng) > 0.001) {
        mapRef.current.flyTo([center.lat, center.lng], 15, { duration: 1.2 });
      }
      userMarkerRef.current.setLatLng([center.lat, center.lng]);
    }
  }, [center]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default Map;
