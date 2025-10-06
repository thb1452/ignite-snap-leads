import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

interface Property {
  latitude: number | null;
  longitude: number | null;
}

interface MapEffectsProps {
  center?: [number, number];
  zoom?: number;
  fitTo?: Property[];
}

export function MapEffects({ center, zoom, fitTo }: MapEffectsProps) {
  const map = useMap();

  useEffect(() => {
    if (center && typeof center[0] === "number" && typeof center[1] === "number") {
      map.setView(center, zoom ?? map.getZoom(), { animate: false });
    }
  }, [center?.[0], center?.[1], zoom, map]);

  useEffect(() => {
    if (!fitTo?.length) return;
    const pts = fitTo
      .filter(p => p.latitude != null && p.longitude != null)
      .map(p => [Number(p.latitude), Number(p.longitude)] as [number, number]);
    if (pts.length) {
      const bounds = L.latLngBounds(pts);
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [fitTo, map]);

  return null;
}
