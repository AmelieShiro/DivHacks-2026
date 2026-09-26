const VALUES = [
  {
    word: "Learn",
    blurb: "Hands-on tools — micro:bit, LEGO Spike, real 3D printers.",
    org: "with Brooklyn Public Library",
    image:
      "https://images.unsplash.com/photo-1585980243496-fe29a36bd382?w=700&h=560&fit=crop&auto=format",
    alt: "Kids learning robotics together at a table",
  },
  {
    word: "Explore",
    blurb: "Try science, coding & making before choosing a path.",
    org: "with Harlem Grown STEM",
    image:
      "https://images.unsplash.com/photo-1613271752699-ede48a285196?w=700&h=560&fit=crop&auto=format",
    alt: "Child exploring a science experiment",
  },
  {
    word: "Thrive",
    blurb: "Local programs kids can walk to — free and low-cost.",
    org: "with El Puente Community Center",
    image:
      "https://images.unsplash.com/photo-1623076189461-f7706b741c04?w=700&h=560&fit=crop&auto=format",
    alt: "A girl coding on a laptop and smiling",
  },
];

export default function Mission() {
  return (
    <div>
      <section className="mx-auto max-w-4xl px-5 pt-16 pb-8 text-center text-white">
        <p className="font-heading font-600 uppercase tracking-[0.2em] text-teal-100 text-sm mb-4">
          Our mission
        </p>
        <h1 className="font-heading font-700 text-4xl sm:text-5xl leading-tight">
          Close the NYC STEM gap.
        </h1>
        <p className="font-body text-lg sm:text-xl text-white/90 mt-5 max-w-2xl mx-auto">
          Every kid deserves a maker space nearby. NOVA connects K–5 families
          directly to the programs — no bureaucracy, no hidden tuition.
        </p>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-6 md:grid-cols-3">
          {VALUES.map((v) => (
            <div key={v.word} className="flex flex-col items-center text-center">
              <h2 className="font-display font-800 text-5xl sm:text-6xl text-white leading-none mb-5"
                style={{ WebkitTextStroke: "1.5px rgba(16,34,42,0.25)", paintOrder: "stroke fill" }}
              >
                {v.word}
              </h2>
              <div className="w-full aspect-[5/4] rounded-2xl overflow-hidden bg-teal-100 shadow-xl ring-4 ring-white/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.image} alt={v.alt} loading="lazy" className="w-full h-full object-cover" />
              </div>
              <p className="font-body text-white/95 text-lg font-600 mt-4">{v.blurb}</p>
              <p className="font-body text-teal-50/80 text-sm mt-1">{v.org}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why existing sources fail */}
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white/90 rounded-2xl p-6 shadow-lg">
            <h3 className="font-heading font-700 text-xl text-ink mb-2">The old way</h3>
            <ul className="font-body text-ink/70 space-y-2 text-[15px]">
              <li>• Outdated 311 &amp; DiscoverDYCD listings</li>
              <li>• Tools &amp; safety never mentioned</li>
              <li>• Tuition hidden behind forms</li>
              <li>• Free Title I &amp; DOE programs skipped</li>
            </ul>
          </div>
          <div className="bg-orange rounded-2xl p-6 shadow-lg text-white">
            <h3 className="font-heading font-700 text-xl mb-2">The NOVA way</h3>
            <ul className="font-body space-y-2 text-[15px] text-white/95">
              <li>• Enter a ZIP, see programs instantly</li>
              <li>• Real photos of projects &amp; spaces</li>
              <li>• Cost shown up front, always</li>
              <li>• Free &amp; low-cost surfaced first</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
