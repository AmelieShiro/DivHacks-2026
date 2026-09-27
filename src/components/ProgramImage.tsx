"use client";

import { useState } from "react";

type Stock = { credit: string; source: string };

/**
 * A program photo: the provider's own, or a stock photo of the subject. When
 * the provider's server refuses its image (some block hotlinking with a 403)
 * the stock photo takes its place. Provider photos come from ~55 domains;
 * next/image would need each one allow-listed, so this is a plain lazy <img>.
 *
 * Stock photos carry a small credit icon linking to their source: CC BY and
 * CC BY-SA require attributing the photographer. The parent must be
 * `relative` for the icon to sit on the image.
 */
export default function ProgramImage({
  src,
  alt,
  stock,
  fallback,
  className,
}: {
  src: string;
  alt: string;
  stock: Stock | null;
  fallback: { src: string; alt: string } & Stock;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  const shown = failed ? { src: fallback.src, alt: fallback.alt, stock: fallback as Stock } : { src, alt, stock };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shown.src}
        alt={shown.alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={className}
      />
      {shown.stock && (
        <a
          href={shown.stock.source}
          target="_blank"
          rel="noopener noreferrer"
          title={`Photo: ${shown.stock.credit}`}
          aria-label={`Photo credit: ${shown.stock.credit}`}
          className="absolute bottom-3 left-3 grid h-5 w-5 place-items-center rounded-full bg-white/80 font-body text-[11px] font-700 italic text-ink/60 shadow hover:bg-white hover:text-ink"
        >
          i
        </a>
      )}
    </>
  );
}
