"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdvancedMarker, APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import type { CardProgram } from "@/lib/types";
import ProgramImage from "./ProgramImage";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// Advanced markers need a map ID; Google's DEMO_MAP_ID works for development.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";
const NYC = { lat: 40.7128, lng: -73.95 };

/** The design's teardrop pin, as marker content. */
function Pin({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="relative flex flex-col items-center transition-transform hover:scale-110">
      <div
        className={`grid place-items-center w-8 h-8 rounded-full rounded-bl-none rotate-45 shadow-lg ${
          active ? "bg-orange ring-2 ring-white" : "bg-white"
        }`}
      >
        <span className={`-rotate-45 w-2.5 h-2.5 rounded-full ${active ? "bg-white" : "bg-orange"}`} />
      </div>
      {active && (
        <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap font-heading font-600 text-xs bg-ink text-white px-2 py-0.5 rounded-full">
          {label}
        </span>
      )}
    </div>
  );
}

/** Pan to the selected program when it is picked from the list. */
function FollowActive({ program }: { program: CardProgram }) {
  const map = useMap();
  useEffect(() => {
    if (map && program.lat != null && program.lng != null) map.panTo({ lat: program.lat, lng: program.lng });
  }, [map, program]);
  return null;
}

function GoogleMap({
  programs,
  active,
  onSelect,
}: {
  programs: CardProgram[];
  active: CardProgram;
  onSelect: (id: string) => void;
}) {
  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        className="absolute inset-0"
        mapId={MAP_ID}
        defaultCenter={active.lat != null && active.lng != null ? { lat: active.lat, lng: active.lng } : NYC}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
      >
        {programs.map((p) => {
          const isActive = p.id === active.id;
          return (
            <AdvancedMarker
              key={p.id}
              position={{ lat: p.lat!, lng: p.lng! }}
              title={p.name}
              zIndex={isActive ? 20 : 10}
              onClick={() => onSelect(p.id)}
            >
              <Pin active={isActive} label={p.neighborhood.split(",")[0]} />
            </AdvancedMarker>
          );
        })}
        <FollowActive program={active} />
      </Map>
    </APIProvider>
  );
}

export default function MapView({ programs }: { programs: CardProgram[] }) {
  const mapped = useMemo(() => programs.filter((p) => p.lat != null && p.lng != null), [programs]);
  // Open on a program shown with its own photo, not a labelled stock one.
  const [active, setActive] = useState(
    () => (mapped.find((p) => p.image && !p.imageStock) ?? mapped[0])?.id,
  );
  const activeProgram = mapped.find((p) => p.id === active) ?? mapped[0];

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="text-white mb-6">
        <h1 className="font-heading font-700 text-3xl sm:text-4xl">Program map</h1>
        <p className="font-body text-white/85 mt-1">
          Explore hands-on STEM spaces across the five boroughs.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Map */}
        <div className="relative rounded-3xl overflow-hidden shadow-xl ring-1 ring-black/10 bg-teal-800 min-h-[380px]">
          {API_KEY ? (
            <GoogleMap programs={mapped} active={activeProgram} onSelect={setActive} />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center p-6 text-center"
              style={{ background: "radial-gradient(120% 120% at 30% 20%, #16bcc7 0%, #0e9aa6 45%, #0f636d 100%)" }}
            >
              <p className="font-body text-white/90 max-w-xs">
                Set <code className="font-600">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code> to show the map.
              </p>
            </div>
          )}
        </div>

        {/* Detail + list */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl overflow-hidden shadow-xl ring-1 ring-black/5">
            <div className="relative aspect-[16/9] bg-teal-100">
              {/* key: reset the fallback state when another program is picked */}
              <ProgramImage
                key={activeProgram.id}
                src={activeProgram.image}
                alt={activeProgram.imageAlt}
                stock={activeProgram.imageStock}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4">
              <h3 className="font-heading font-700 text-lg text-ink">{activeProgram.name}</h3>
              <p className="font-body text-sm text-ink/60">
                {activeProgram.neighborhood}
                {activeProgram.distance && ` · ${activeProgram.distance}`}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="font-heading font-600 text-xs bg-orange text-white px-2.5 py-1 rounded-full">{activeProgram.cost}</span>
                <span className="font-body text-sm text-ink/70">{activeProgram.days}</span>
              </div>
              <Link href="/programs" className="block text-center mt-4 font-heading font-600 text-white bg-orange hover:bg-orange-dark transition-colors rounded-xl py-2.5">
                See all programs
              </Link>
            </div>
          </div>

          <div className="bg-white/90 rounded-2xl p-2 shadow-lg max-h-56 overflow-y-auto">
            {mapped.map((p) => (
              <button
                key={p.id}
                onClick={() => setActive(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 transition-colors ${
                  p.id === active ? "bg-teal-50" : "hover:bg-teal-50/60"
                }`}
              >
                <span>
                  <span className="font-heading font-600 text-ink block leading-tight">{p.name}</span>
                  <span className="font-body text-xs text-ink/55">{p.neighborhood}</span>
                </span>
                <span className="font-body text-xs text-orange-dark font-700 shrink-0">{p.distance}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
