export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-display font-black italic leading-none text-orange ${className}`}
      style={{
        WebkitTextStroke: "1.5px #ffffff",
        paintOrder: "stroke fill",
        letterSpacing: "-0.02em",
      }}
    >
      NOVA
    </span>
  );
}
