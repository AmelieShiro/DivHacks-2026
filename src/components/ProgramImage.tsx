"use client";

import { useState, type ReactNode } from "react";

/**
 * A provider-hosted photo that falls back to the NOVA placeholder when it has
 * none, or when the provider's server refuses it (some block hotlinking with
 * a 403). Provider photos come from ~55 domains; next/image would need each
 * one allow-listed, so this is a plain lazy <img> as in the design.
 *
 * `fallback` replaces the wordmark where it would be too big to read — the
 * map list's thumbnails put a flask there instead.
 */
export default function ProgramImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string | null;
  alt: string;
  className: string;
  fallback?: ReactNode;
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
