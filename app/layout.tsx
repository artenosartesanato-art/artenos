import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ScrollReveal } from "@/components/scroll-reveal";
import { MarketplaceProvider } from "@/components/marketplace-state";
import { StorefrontActionsProvider } from "@/components/storefront-actions";
import { SuspensionNotice } from "@/components/suspension-notice";
import { SiteChrome } from "@/components/site-chrome";
import { CookieConsentBanner } from "@/components/cookie-consent";

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

export const viewport: Viewport = {
  themeColor: "#faf2eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin} crossOrigin="anonymous" />
        )}
        <link rel="preload" href="/fonts/Figtree-Variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/CormorantGaramond-Variable-lf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <MarketplaceProvider>
          <StorefrontActionsProvider>
            <SuspensionNotice />
            <SiteChrome>{children}</SiteChrome>
          </StorefrontActionsProvider>
        </MarketplaceProvider>
        <ScrollReveal />
        <CookieConsentBanner />
        <Toaster position="bottom-center" visibleToasts={1} closeButton toastOptions={{ duration: 5000 }} />
      </body>
    </html>
  );
}
