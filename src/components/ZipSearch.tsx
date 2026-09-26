"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The home hero's ZIP card. */
export default function ZipSearch() {
  const [zip, setZip] = useState("");
  const router = useRouter();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = zip.trim();
    router.push(clean ? `/programs?zip=${encodeURIComponent(clean)}` : "/programs");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-center gap-3 bg-teal-50 rounded-2xl px-4 border border-black/5">
        <svg className="text-teal-600 shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" /></svg>
        <input
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          inputMode="numeric"
          placeholder="Enter your ZIP code"
          className="w-full py-4 font-body text-lg text-ink placeholder:text-ink/50 focus:outline-none bg-transparent"
        />
      </div>
      <button
        type="submit"
        className="w-full font-heading font-600 text-lg text-white bg-orange hover:bg-orange-dark transition-colors rounded-2xl py-4 shadow-md"
      >
        Find Programs
      </button>
    </form>
  );
}
