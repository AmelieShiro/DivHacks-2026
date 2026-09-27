import type { Metadata } from "next";
import { Fredoka, Nunito, Sansita_Swashed } from "next/font/google";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import StemChatMount from "@/components/StemChatMount";
import "./globals.css";

const sansitaSwashed = Sansita_Swashed({
  variable: "--font-sansita-swashed",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "NOVA · K–5 STEM programs in NYC",
  description: "Zero-friction STEM discovery for NYC families.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sansitaSwashed.variable} ${fredoka.variable} ${nunito.variable}`}>
      <body suppressHydrationWarning>
        <div className="min-h-screen flex flex-col">
          <Header />

          <main className="flex-1">{children}</main>

          <Footer />
        </div>
        <StemChatMount />
      </body>
    </html>
  );
}
