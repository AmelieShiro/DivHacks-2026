"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { CardProgram } from "@/lib/types";

type LatLng = { lat: number; lng: number };
type Camera = { center: LatLng; zoom?: number };
export type MapBounds = { north: number; south: number; east: number; west: number };

const FLASK_PATH =
  "M8.25 2.5h7.5a1.1 1.1 0 0 1 0 2.2h-.6v3.05a2.2 2.2 0 0 0 .29 1.09l5.02 8.94A2.4 2.4 0 0 1 18.36 21.5H5.64a2.4 2.4 0 0 1-2.09-3.57l5.02-8.94a2.2 2.2 0 0 0 .28-1.09V4.7h-.6a1.1 1.1 0 0 1 0-2.2Zm2.6 2.2v3.05c0 .77-.2 1.53-.58 2.2l-1.2 2.15h5.86l-1.2-2.15a4.4 4.4 0 0 1-.58-2.2V4.7h-2.3Z";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Same flask pin as the Google map, drawn as a Leaflet div icon. */
function flaskPin(active: boolean, label: string) {
  const size = active ? 40 : 28;
  const icon = active ? 20 : 16;
  const bg = active ? "#10222a" : "#ffffff";
  const fg = active ? "#ffffff" : "#f7801f";
  const ring = active ? "0 0 0 2px #fff" : "0 0 0 1px rgba(0,0,0,.12)";
  const labelHtml = active
    ? `<span style="position:absolute;top:${size + 10}px;left:50%;transform:translateX(-50%);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#10222a;color:#fff;border-radius:9999px;padding:2px 8px;font:600 11px Nunito,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.25)">${escapeHtml(label)}</span>`
    : "";
  return L.divIcon({
    className: "nova-pin",
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 6],
    html: `<div style="position:relative;display:flex;width:${size}px;flex-direction:column;align-items:center">
      <div style="display:grid;width:${size}px;height:${size}px;place-items:center;border-radius:9999px;background:${bg};color:${fg};box-shadow:${ring},0 2px 6px rgba(0,0,0,.3)">
        <svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="currentColor" aria-hidden="true"><path d="${FLASK_PATH}"/></svg>
      </div>
      <span style="width:8px;height:8px;margin-top:-1px;border-radius:1px;background:${bg};transform:rotate(45deg)"></span>
      ${labelHtml}
    </div>`,
  });
}

function publishBounds(map: L.Map, onBounds: (bounds: MapBounds) => void) {
  const bounds = map.getBounds();
  onBounds({
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  });
}

function MapBridge({
  camera,
  onBounds,
  onClear,
}: {
  camera: Camera | null;
  onBounds: (bounds: MapBounds) => void;
  onClear: () => void;
}) {
  const map = useMap();
  useMapEvents({
    moveend: () => publishBounds(map, onBounds),
    click: () => onClear(),
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      publishBounds(map, onBounds);
    });
    return () => cancelAnimationFrame(frame);
  }, [map, onBounds]);

  useEffect(() => {
    if (!camera) return;
    if (camera.zoom != null) map.setView(camera.center, camera.zoom, { animate: true });
    else map.panTo(camera.center, { animate: true });
  }, [map, camera]);

  return null;
}

/**
 * The map used on the public site when no Google Maps key is configured.
 * CARTO's Voyager tiles are OpenStreetMap data and need no API key.
 */
export default function OsmMap({
  programs,
  selectedId,
  onSelect,
  camera,
  center,
  zoom,
  onBounds,
}: {
  programs: CardProgram[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  camera: Camera | null;
  center: LatLng;
  zoom: number;
  onBounds: (bounds: MapBounds) => void;
}) {
  const icons = useMemo(() => {
    const next = new Map<string, L.DivIcon>();
    for (const program of programs) next.set(program.id, flaskPin(program.id === selectedId, program.name));
    return next;
  }, [programs, selectedId]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className="absolute inset-0 z-0"
      style={{ height: "100%", width: "100%" }}
      zoomControl
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />
      <MapBridge camera={camera} onBounds={onBounds} onClear={() => onSelect(null)} />
      {programs.map((program) => {
        const active = program.id === selectedId;
        return (
          <Marker
            key={program.id}
            position={[program.lat!, program.lng!]}
            icon={icons.get(program.id)!}
            zIndexOffset={active ? 1000 : 0}
            title={program.name}
            eventHandlers={{
              click: (event) => {
                L.DomEvent.stopPropagation(event.originalEvent);
                onSelect(program.id);
              },
            }}
          />
        );
      })}
    </MapContainer>
  );
}
