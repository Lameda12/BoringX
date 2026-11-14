import type { Metadata, Viewport } from "next";
import "@fontsource/familjen-grotesk/latin-500.css";
import "@fontsource/familjen-grotesk/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./tokens.css";
import "./base.css";
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
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f9fc" }, { media: "(prefers-color-scheme: dark)", color: "#151a24" }] };

const themeScript = `try{var t=localStorage.getItem("boringx.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <Header />
        <div className="trust" role="note"><p><strong>Nothing is uploaded.</strong> Everything runs in this browser tab. <a href="/privacy">How we know</a>.</p></div>
        <main id="main" className="container">{children}</main>
        <footer className="site-foot">
          <p>Nothing exciting happens here.</p>
          <nav aria-label="Footer"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="https://github.com/Lameda12/BoringX">Source (MIT)</a></nav>
        </footer>
        <Palette />
        <SwRegister />
        <HardNav />
      </body>
    </html>
  );
}
