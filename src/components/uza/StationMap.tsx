import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapStation = {
  id: string;
  name: string;
  area: string | null;
  lat: number;
  lng: number;
  /** Connectors reported available right now — measured, never assumed. */
  free: number;
  total: number;
  /** true when no charge point at this station has ever reported. */
  neverConnected: boolean;
};

/**
 * Browser-only station map. Markers reflect measured connector state:
 * green = at least one connector reported available, amber = all busy,
 * grey = nothing has ever reported from this station.
 */
export default function StationMap({
  stations,
  centre,
  selectedId,
  onSelect,
  height = 260,
}: {
  stations: MapStation[];
  centre: { lat: number; lng: number };
  selectedId?: string | null;
  onSelect?: ((id: string) => void) | undefined;
  height?: number;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!holder.current || map.current) return;
    const instance = L.map(holder.current, {
      center: [centre.lat, centre.lng],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, [centre.lat, centre.lng]);

  useEffect(() => {
    const group = layer.current;
    if (!group || !map.current) return;
    group.clearLayers();

    const points: L.LatLngExpression[] = [];
    for (const s of stations) {
      const tone = s.neverConnected ? "idle" : s.free > 0 ? "live" : "warn";
      const icon = L.divIcon({
        className: "",
        html: `<span class="uza-pin uza-pin-${tone}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const marker = L.marker([s.lat, s.lng], { icon, title: s.name }).addTo(group);
      marker.bindTooltip(
        `${s.name}${s.area ? ` · ${s.area}` : ""} — ${
          s.neverConnected ? "never connected" : `${s.free}/${s.total} free`
        }`,
      );
      if (onSelect) marker.on("click", () => onSelect(s.id));
      points.push([s.lat, s.lng]);
    }

    if (points.length > 1) {
      map.current.fitBounds(L.latLngBounds(points).pad(0.25));
    } else if (points.length === 1) {
      map.current.setView(points[0] as L.LatLngExpression, 14);
    }
  }, [stations, onSelect]);

  useEffect(() => {
    const target = stations.find((s) => s.id === selectedId);
    if (target && map.current) map.current.setView([target.lat, target.lng], 15);
  }, [selectedId, stations]);

  return (
    <div
      ref={holder}
      style={{ height }}
      className="w-full overflow-hidden rounded-md border border-border"
      role="application"
      aria-label="Station map"
    />
  );
}
