import Carousel from "@/components/Carousel";
import ZipSearch from "@/components/ZipSearch";
import { getDatasetSummary, getFeatured } from "@/lib/programs";

/** The design's Home page. Shared by `/` and the catch-all not-found route. */
export default function HomePage() {
  // No visitor ZIP on the home page, so the distance badge shows the borough.
  const featured = getFeatured().map((p) => ({ ...p, distance: p.borough || null }));
  const summary = getDatasetSummary();

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-10 text-center text-white">
        <h1 className="font-heading font-700 text-5xl sm:text-7xl leading-[1.02] tracking-tight">
          A workshop where your kids can{" "}
          <span className="text-orange">walk to</span>
        </h1>
        <p className="font-body text-lg sm:text-xl text-white/85 mt-5 max-w-2xl mx-auto">
          Discover and secure free, high-quality after-school K–5 STEM workshops,
          robotics teams, and science academies right in your NYC neighborhood.
        </p>

        {/* Zip search card */}
        <div className="mt-8 bg-white rounded-3xl p-5 sm:p-6 shadow-2xl ring-1 ring-black/5 max-w-xl mx-auto">
          <ZipSearch />
          <p className="font-body text-sm text-ink/60 mt-4">
            {summary.programs} K–5 programs across all {summary.boroughs} boroughs · {summary.free} confirmed free
          </p>
        </div>
      </section>

      {/* Programs of the week */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="bg-teal-50/95 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-end justify-between mb-6 gap-4">
            <div>
              <h2 className="font-heading font-700 text-2xl sm:text-3xl text-ink">
                Programs of the week
              </h2>
              <p className="font-body text-ink/60 mt-1">
                Fresh picks families are signing up for right now.
              </p>
            </div>
          </div>
          <Carousel programs={featured} />
        </div>
      </section>

      {/* How it works strip */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid sm:grid-cols-3 gap-4 text-center">
          {[
            { n: "1", t: "Enter your ZIP", d: "No forms, no logins." },
            { n: "2", t: "See real photos", d: "Projects, spaces & safety specs." },
            { n: "3", t: "Sign up direct", d: "Straight to the program." },
          ].map((s) => (
            <div key={s.n} className="bg-white/90 rounded-2xl p-5 shadow-lg">
              <div className="mx-auto w-10 h-10 grid place-items-center rounded-full bg-orange text-white font-heading font-700 text-lg mb-3">
                {s.n}
              </div>
              <h3 className="font-heading font-600 text-lg text-ink">{s.t}</h3>
              <p className="font-body text-sm text-ink/60 mt-1">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
