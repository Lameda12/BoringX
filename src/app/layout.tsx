import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "./globals.css";
import { Header, HardNav, SwRegister } from "@/components/Chrome";
import { Palette } from "@/components/Palette";
import { SITE } from "@/lib/tools";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "BoringX: small tools that each do one dull job", template: "%s | BoringX" },
  description: "40 free browser tools: PDF, images, text, data, dev, generators and converters. Nothing is uploaded. No accounts, no limits, no watermarks.",
  applicationName: "BoringX",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  openGraph: { siteName: "BoringX", type: "website", locale: "en" },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#e9e8e4" }, { media: "(prefers-color-scheme: dark)", color: "#1b1c1e" }] };

const themeScript = `try{var t=localStorage.getItem("boringx.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <div className="page">
          <Header />
          <p className="trust" role="note"><strong>Nothing is uploaded.</strong> Everything runs in this browser tab. <a href="/privacy">How we know</a>.</p>
          <main id="main">{children}</main>
          <footer className="site-foot">
            <p>Nothing exciting happens here.</p>
            <p><a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="https://github.com/Lameda12/BoringX">Source (MIT)</a></p>
          </footer>
        </div>
        <Palette />
        <SwRegister />
        <HardNav />
      </body>
    </html>
  );
}
