"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import ProgramCard from "@/components/ProgramCard";
import { withDistance } from "@/lib/geo";
import type { CardProgram, Subject, ZipCentroids } from "@/lib/types";

const PROGRAM_DETAILS = ["Free", "Grades K–2", "Grades 3–5"] as const;
type ProgramDetail = (typeof PROGRAM_DETAILS)[number];

const SUBJECTS = [
  "Biology",
  "Chemistry",
  "Coding",
  "Engineering",
  "Robotics",
] as const satisfies readonly Subject[];

function FilterDropdown<T extends string>({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: readonly T[];
  selected: T[];
  onChange: (selected: T[]) => void;
}) {
  const toggle = (option: T) => {
    onChange(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option],
    );
  };

  return (
    <div>
      <p className="mb-2 font-heading text-sm font-600 text-white/80">
        {label}
      </p>
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 font-heading text-sm font-600 text-ink shadow-md transition-colors hover:bg-teal-50">
          <span className="truncate">
            {selected.length === 0 ? allLabel : selected.join(", ")}
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 text-orange transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl bg-white p-2 shadow-xl ring-1 ring-black/5">
          <button
            type="button"
            onClick={() => onChange([])}
            aria-pressed={selected.length === 0}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-body text-sm font-600 transition-colors ${
              selected.length === 0
                ? "bg-orange text-white"
                : "text-ink hover:bg-teal-50"
            }`}
          >
            {allLabel}
            {selected.length === 0 && <span aria-hidden="true">✓</span>}
          </button>
          {options.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggle(option)}
                aria-pressed={isSelected}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-body text-sm font-600 transition-colors ${
                  isSelected
                    ? "bg-orange text-white"
                    : "text-ink hover:bg-teal-50"
                }`}
              >
                {option}
                {isSelected && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}

export default function ProgramsView({
  programs,
  centroids,
  zip,
}: {
  programs: CardProgram[];
  centroids: ZipCentroids;
  /** From ?zip=, read by the server page. */
  zip: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [input, setInput] = useState(zip);
  const [selectedDetails, setSelectedDetails] = useState<ProgramDetail[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<Subject[]>([]);

  const { programs: sorted, measured } = useMemo(
    () => withDistance(programs, zip, centroids),
    [programs, zip, centroids],
  );

  const list = useMemo(() => {
    return sorted.filter((p) => {
      const matchesProgramFilter =
        selectedDetails.length === 0 ||
        selectedDetails.some(
          (detail) =>
            (detail === "Free" && p.cost === "Free") ||
            (detail === "Grades K–2" && /K|1|2/.test(p.ages)) ||
            (detail === "Grades 3–5" && /3|4|5/.test(p.ages)),
        );
      const matchesSubject =
        selectedSubjects.length === 0 ||
        selectedSubjects.some((subject) => p.subjects.includes(subject));

      return matchesProgramFilter && matchesSubject;
    });
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
          {zip ? `Programs near ${zip}` : "All programs"}
        </h1>
        <p className="font-body text-white/85 mt-1">
          {list.length} hands-on STEM {list.length === 1 ? "program" : "programs"} ·
          {/* Only claim a distance order when a known ZIP gave one. */}
          {measured ? " sorted by distance" : " sorted by name"}
        </p>
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
              options={PROGRAM_DETAILS}
              selected={selectedDetails}
              onChange={setSelectedDetails}
            />
            <FilterDropdown
              label="Subject"
              allLabel="All subjects"
              options={SUBJECTS}
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
      ) : (
        <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
          <p className="font-heading text-xl font-600 text-ink">
            No programs match these filters
          </p>
          <p className="mt-1 font-body text-ink/60">
            Try another option or choose “All” in either filter.
          </p>
        </div>
      )}
    </div>
  );
}
