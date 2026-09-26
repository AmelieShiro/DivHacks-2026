import type { CardProgram } from "@/lib/types";
import ProgramImage from "./ProgramImage";

const costColor: Record<CardProgram["cost"], string> = {
  Free: "bg-orange text-white",
  "Sliding scale": "bg-teal-100 text-teal-800",
  "Low-cost": "bg-teal-100 text-teal-800",
  Paid: "bg-ink text-white",
  "Ask provider": "bg-teal-100 text-teal-800",
};

export default function ProgramCard({ program }: { program: CardProgram }) {
  return (
    <article className="group bg-white rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/5 flex flex-col transition-transform duration-200 hover:-translate-y-1">
      <div className="relative aspect-[16/10] bg-teal-100 overflow-hidden">
        <ProgramImage
          src={program.image}
          alt={program.imageAlt}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {program.tag && (
          <span className="absolute top-3 left-3 font-heading font-600 text-xs uppercase tracking-wide bg-white/95 text-teal-800 px-2.5 py-1 rounded-full shadow">
            {program.tag}
          </span>
        )}
        {program.distance && (
          <span className="absolute bottom-3 right-3 font-heading font-600 text-xs bg-ink/80 text-white px-2.5 py-1 rounded-full backdrop-blur-sm">
            {program.distance}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-heading font-600 text-lg leading-tight text-ink">
            {program.name}
          </h3>
          <span className={`shrink-0 font-heading font-600 text-xs px-2.5 py-1 rounded-full ${costColor[program.cost]}`}>
            {program.cost}
          </span>
        </div>

        <p className="font-body text-sm text-ink/60 -mt-1">{program.org}</p>

        <div className="flex flex-wrap gap-1.5">
          {program.tools.map((tool) => (
            <span
              key={tool}
              className="font-body text-xs font-600 bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md"
            >
              {tool}
            </span>
          ))}
        </div>

        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-black/5 font-body text-sm">
          <div>
            <dt className="text-ink/45 text-xs">Ages</dt>
            <dd className="font-600 text-ink">{program.ages}</dd>
          </div>
          <div>
            <dt className="text-ink/45 text-xs">Schedule</dt>
            <dd className="font-600 text-ink">{program.days}</dd>
          </div>
          <div>
            <dt className="text-ink/45 text-xs">Cost</dt>
            <dd className="font-600 text-ink">{program.costDetail}</dd>
          </div>
          <div>
            <dt className="text-ink/45 text-xs">Availability</dt>
            <dd className="font-600 text-orange-dark">{program.seats}</dd>
          </div>
        </dl>

        <a
          href={program.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 text-center font-heading font-600 text-white bg-orange hover:bg-orange-dark transition-colors rounded-xl py-2.5"
        >
          View & sign up
        </a>
      </div>
    </article>
  );
}
