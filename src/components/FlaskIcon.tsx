/**
 * A conical (Erlenmeyer) flask — the map's marker glyph and the stand-in for
 * programs with no photo. Solid so it stays legible at 14px inside a pin.
 */
export default function FlaskIcon({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={className}
    >
      {title && <title>{title}</title>}
      <path d="M8.25 2.5h7.5a1.1 1.1 0 0 1 0 2.2h-.6v3.05a2.2 2.2 0 0 0 .29 1.09l5.02 8.94A2.4 2.4 0 0 1 18.36 21.5H5.64a2.4 2.4 0 0 1-2.09-3.57l5.02-8.94a2.2 2.2 0 0 0 .28-1.09V4.7h-.6a1.1 1.1 0 0 1 0-2.2Zm2.6 2.2v3.05c0 .77-.2 1.53-.58 2.2l-1.2 2.15h5.86l-1.2-2.15a4.4 4.4 0 0 1-.58-2.2V4.7h-2.3Z" />
    </svg>
  );
}
