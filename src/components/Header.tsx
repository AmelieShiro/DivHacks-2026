import Link from "next/link";
import HeaderMenu from "./HeaderMenu";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-black/5">
      <HeaderMenu>
        <Link href="/" className="flex items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/nova-wordmark.png"
            alt="NOVA"
            width={120}
            height={40}
            className="h-10 w-auto object-contain"
          />
        </Link>
      </HeaderMenu>
    </header>
  );
}
