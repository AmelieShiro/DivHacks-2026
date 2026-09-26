"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { to: "/mission", label: "Mission" },
  { to: "/map", label: "Map" },
  { to: "/programs", label: "Programs" },
];

function NavItem({ to, label }: { to: string; label: string }) {
  const isActive = usePathname() === to;
  return (
    <Link
      href={to}
      className={`font-heading text-lg font-600 px-4 py-1.5 rounded-full transition-colors ${
        isActive
          ? "bg-orange text-white"
          : "text-ink/80 hover:text-ink hover:bg-teal-50"
      }`}
    >
      {label}
    </Link>
  );
}

function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="flex items-center shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/nova-wordmark.png"
        alt="NOVA"
        className="h-10 w-auto object-contain"
      />
    </Link>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-black/5">
      <div className="mx-auto max-w-6xl px-5 h-16 grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex items-center">
          <Logo onClick={() => setOpen(false)} />
        </div>
        <nav className="hidden md:flex items-center gap-2 justify-center">
          {tabs.map((t) => (
            <NavItem key={t.to} {...t} />
          ))}
        </nav>
        <div className="flex justify-end">
          <button
            className="md:hidden text-ink p-2 rounded-lg hover:bg-teal-50"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden px-5 pb-4 flex flex-col items-center gap-2 bg-white">
          {tabs.map((t) => (
            <div key={t.to} onClick={() => setOpen(false)}>
              <NavItem {...t} />
            </div>
          ))}
        </nav>
      )}
    </header>
  );
}
