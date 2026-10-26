import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ScrollReveal } from "@/components/scroll-reveal";
import { MarketplaceProvider } from "@/components/marketplace-state";

export const metadata: Metadata = {
  title: "Artenós | Artesanato com história",
  description: "Descubra peças autorais e lojas artesanais na Artenós.",
  manifest: "/manifest.webmanifest?v=3",
  icons: {
    icon: [
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/favicon.ico?v=3" },
      { url: "/favicon-16.png?v=3", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png?v=3", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=3",
    apple: "/apple-touch-icon.png?v=3",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased"><MarketplaceProvider>{children}</MarketplaceProvider><ScrollReveal /><Toaster position="bottom-right" visibleToasts={1} closeButton /></body>
    </html>
  );
}
