"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ProgramCard from "@/components/ProgramCard";
import { RADIUS_MILES, withDistance } from "@/lib/geo";
import type { CardProgram, SubjectGroup, ZipCentroids } from "@/lib/types";

type Rule = (p: CardProgram) => boolean;

const COST: Record<string, Rule> = {
  Free: (p) => p.cost === "Free",
  "Ask provider": (p) => p.cost !== "Free",
};

/**
 * Every program accepts all of K-5, so K-2 / 3-5 bands would never narrow
 * the list. What does differ is the age range DYCD publishes for each site.
 */
const GRADES: Record<string, Rule> = {
  "Elementary only (K–5)": (p) => p.ages === "Grades K–5",
  "All ages (4 and up)": (p) => p.ages === "Ages 4+",
  "Kids & teens (K–12)": (p) => p.ages === "Grades K–12" || p.ages === "Ages 5–20",
};

const matchesAny = (rules: Record<string, Rule>, selected: string[], p: CardProgram) =>
  selected.length === 0 || selected.some((s) => rules[s]?.(p));

const ruleGroups = (rules: Record<string, Rule>, list: CardProgram[]): OptionGroup[] => [{
  options: Object.entries(rules)
    .map(([label, rule]) => ({ label, count: list.filter(rule).length }))
    .filter((o) => o.count > 0),
}];

type OptionGroup = { heading?: string; options: { label: string; count: number }[] };

function FilterDropdown({
  label,
  allLabel,
  groups,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  groups: OptionGroup[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (option: string) =>
    onChange(selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option]);

  const row = (isSelected: boolean) =>
    `flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-body text-sm font-600 transition-colors ${
      isSelected ? "bg-orange text-white" : "text-ink hover:bg-teal-50"
    }`;

  return (
    <div ref={root} className="relative">
      <p className="mb-2 font-heading text-sm font-600 text-white/80">{label}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 font-heading text-sm font-600 text-ink shadow-md transition-colors hover:bg-teal-50"
      >
        <span className="truncate">{selected.length === 0 ? allLabel : selected.join(", ")}</span>
        <span aria-hidden="true" className={`shrink-0 text-orange transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-40 mt-2 max-h-80 overflow-y-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-black/5">
          <button type="button" onClick={() => onChange([])} aria-pressed={selected.length === 0} className={row(selected.length === 0)}>
            {allLabel}
            {selected.length === 0 && <span aria-hidden="true">✓</span>}
          </button>
          {groups.map((g) => (
            <div key={g.heading ?? "options"}>
              {g.heading && (
                <p className="px-3 pb-1 pt-3 font-heading text-xs font-700 uppercase tracking-wide text-ink/50">
                  {g.heading}
                </p>
              )}
              {g.options.map(({ label: option, count }) => {
                const isSelected = selected.includes(option);
                return (
                  <button key={option} type="button" onClick={() => toggle(option)} aria-pressed={isSelected} className={row(isSelected)}>
                    <span>{option}</span>
                    <span className={`text-xs ${isSelected ? "text-white" : "text-ink/50"}`}>
                      {isSelected ? "✓" : count}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProgramsView({
  programs,
  subjectGroups,
  centroids,
  zip,
}: {
  programs: CardProgram[];
  subjectGroups: SubjectGroup[];
  centroids: ZipCentroids;
  /** From ?zip=, read by the server page. */
  zip: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [input, setInput] = useState(zip);
  const [selectedDetails, setSelectedDetails] = useState<string[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const { programs: sorted, measured, nearestMiles } = useMemo(
    () => withDistance(programs, zip, centroids),
    [programs, zip, centroids],
  );
  const unknownZip = zip.trim() !== "" && !measured;

  // Counts follow the ZIP search, so an option never promises programs that
  // are outside the radius. Cost and grades share one dropdown, but they
  // still combine the way two dropdowns would: any picked cost AND any
  // picked grade.
  const detailGroups = useMemo(
    () => [
      ...ruleGroups(COST, sorted).map((g) => ({ ...g, heading: "Cost" })),
      ...ruleGroups(GRADES, sorted).map((g) => ({ ...g, heading: "Grades" })),
    ],
    [sorted],
  );

  const nearbySubjectGroups: OptionGroup[] = useMemo(
    () =>
      subjectGroups
        .map((g) => ({
          heading: g.heading,
          options: g.options
            .map(({ label }) => ({ label, count: sorted.filter((p) => p.subjects.includes(label)).length }))
            .filter((o) => o.count > 0 || selectedSubjects.includes(o.label)),
        }))
        .filter((g) => g.options.length > 0),
    [subjectGroups, sorted, selectedSubjects],
  );

  const list = useMemo(() => {
    const pickedCost = selectedDetails.filter((s) => s in COST);
    const pickedGrades = selectedDetails.filter((s) => s in GRADES);
    return sorted.filter(
      (p) =>
        matchesAny(COST, pickedCost, p) &&
        matchesAny(GRADES, pickedGrades, p) &&
        (selectedSubjects.length === 0 || selectedSubjects.some((s) => p.subjects.includes(s))),
    );
  }, [sorted, selectedDetails, selectedSubjects]);

  const applyZip = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = input.trim();
    router.replace(clean ? `${pathname}?zip=${encodeURIComponent(clean)}` : pathname);
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="text-white mb-6">
        <h1 className="font-heading font-700 text-3xl sm:text-4xl">
          {measured
            ? `Programs within ${RADIUS_MILES} mile of ${zip}`
            : "All programs"}
        </h1>
        <p className="font-body text-white/85 mt-1">
          {list.length} hands-on STEM {list.length === 1 ? "program" : "programs"} ·
          {/* Only claim a distance order when a known ZIP gave one. */}
          {measured ? " sorted by distance" : " sorted by name"}
        </p>
        {unknownZip && (
          <p className="mt-3 inline-block rounded-lg bg-white/15 px-3 py-2 font-body text-sm text-white">
            We couldn’t find ZIP {zip}, so all programs are shown. Try a nearby NYC ZIP code.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="relative z-30 flex flex-col gap-4 mb-8">
        <form onSubmit={applyZip} className="bg-white rounded-xl p-1.5 shadow-lg flex gap-2 max-w-sm w-full">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="numeric"
            placeholder="Change ZIP code"
            className="w-full px-3 py-2 font-body text-ink placeholder:text-ink/40 focus:outline-none bg-transparent"
          />
          <button className="font-heading font-600 text-white bg-orange hover:bg-orange-dark transition-colors rounded-lg px-4 py-2 shrink-0">
            Update
          </button>
        </form>

        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <FilterDropdown
              label="Program details"
              allLabel="All program details"
              groups={detailGroups}
              selected={selectedDetails}
              onChange={setSelectedDetails}
            />
            <FilterDropdown
              label="Subject"
              allLabel="All subjects"
              groups={nearbySubjectGroups}
              selected={selectedSubjects}
              onChange={setSelectedSubjects}
            />
          </div>
        </div>
      </div>

      {list.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <ProgramCard key={p.id} program={p} />
          ))}
        </div>
      ) : measured && sorted.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="font-heading text-xl font-600 text-ink">
            No programs within {RADIUS_MILES} mile of {zip}
          </p>
          <p className="mt-1 font-body text-ink/60">
            {nearestMiles != null
              ? `The nearest program is ${nearestMiles.toFixed(1)} miles away. Try a neighboring ZIP code.`
              : "Try a neighboring ZIP code."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="font-heading text-xl font-600 text-ink">
            No programs match these filters
          </p>
          <p className="mt-1 font-body text-ink/60">
            Try another option, or pick “Any” in one of the filters.
          </p>
        </div>
      )}
    </div>
  );
}
