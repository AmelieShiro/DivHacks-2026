export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`nova-wordmark font-display font-black italic leading-none text-orange ${className}`}>
      NOVA
    </span>
  );
}
