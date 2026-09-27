"use client";

import { useState, type ReactNode } from "react";

type Stock = { credit: string; source: string };

/**
 * A program photo: the provider's own, or a credited stock photo of the
 * subject. Provider photos come from ~55 domains; next/image would need each
 * one allow-listed, so this is a plain lazy <img> as in the design.
 *
 * Stock photos are labelled on the image so a parent never mistakes them for
 * this program, and the label links to the source with the photographer's
 * credit (CC BY and CC BY-SA require attribution). The parent must be
 * `relative` for the label to sit on the image.
 *
 * When there is no photo, or the provider's server refuses it (some block
 * hotlinking with a 403), the NOVA placeholder shows instead of another
 * photo, so no photo ever appears on two cards. `fallback` replaces the
 * wordmark where it would be too big to read — the map list's thumbnails put
 * a flask there instead.
 */
export default function ProgramImage({
  src,
  alt,
  stock,
  className,
  fallback,
  credit = "pill",
}: {
  src: string | null;
  alt: string;
  stock: Stock | null;
  className: string;
  fallback?: ReactNode;
  /**
   * How the stock credit is shown. "pill" spells out "Stock photo" and suits a
   * card-sized image, where a parent needs to see at a glance that the picture
   * is not of this program. "badge" is a corner marker for thumbnails too
   * small to carry the words; the wording moves into the tooltip and the
   * accessible label. Either way the credit and the link to the source are
   * present, which is what CC BY and CC BY-SA require.
   */
  credit?: "pill" | "badge";
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="w-full h-full grid place-items-center">
        {fallback ?? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/nova-wordmark.png" alt="" className="h-12 w-auto opacity-40" />
        )}
      </div>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={className}
      />
      {stock &&
        (credit === "badge" ? (
          <a
            href={stock.source}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Stock photo, not taken at this program · ${stock.credit}`}
            aria-label={`Stock photo, not taken at this program. Credit: ${stock.credit}`}
            className="absolute top-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-white/90 font-heading text-[10px] font-700 leading-none text-teal-800 shadow-sm hover:bg-white"
          >
            i
          </a>
        ) : (
          <a
            href={stock.source}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Stock photo, not taken at this program · ${stock.credit}`}
            aria-label={`Stock photo, not taken at this program. Credit: ${stock.credit}`}
            className="absolute bottom-3 left-3 font-heading font-600 text-xs bg-white/95 text-teal-800 px-2.5 py-1 rounded-full shadow hover:bg-white"
          >
            Stock photo
          </a>
        ))}
    </>
  );
}
