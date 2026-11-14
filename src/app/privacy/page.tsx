import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy", description: "Your files never leave your device. Here is how that is enforced, and how you can check.", alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <article className="prose">
      <h1 className="tool-h">Privacy</h1>
      <p><strong>Nothing you give a tool is uploaded.</strong> Files, text and images are processed by JavaScript and WebAssembly running in your browser tab. There is no server that receives them, and there is no database to store them.</p>
      <h2 className="cat-h">Why you can believe that</h2>
      <p>Every page is served with a Content-Security-Policy whose <code>connect-src</code> is limited to this site itself (plus <code>blob:</code> and <code>data:</code>, which are local to your browser). The browser refuses any attempt by the page, or by code you run in the Sandbox, to send data to another host. You can check it: open developer tools, look at the Network tab while you use a tool, and read the response headers.</p>
      <p>The Custom JavaScript block runs in a Worker served with <code>connect-src &apos;none&apos;</code>, so it cannot make network requests at all.</p>
      <p>One page is slightly looser: Remove Background adds <code>&apos;unsafe-eval&apos;</code> to <code>script-src</code>, because its machine-learning runtime needs it. Its <code>connect-src</code> is the same as everywhere else. The model, the OCR engine and the AVIF encoder are all served from this site, never from a CDN.</p>
      <h2 className="cat-h">What is stored</h2>
      <ul>
        <li>Your theme choice and any Sandbox tools you save, in your browser&apos;s local storage. They never leave your device. Clear them any time in your browser settings.</li>
        <li>A service worker caches the site&apos;s own files so it works offline.</li>
      </ul>
      <h2 className="cat-h">What we do not do</h2>
      <ul>
        <li>No analytics, no cookies, no fingerprinting, no ads, no third-party scripts, no third-party fonts.</li>
        <li>No accounts, so no personal data to hold.</li>
      </ul>
      <h2 className="cat-h">Hosting</h2>
      <p>The site is static files on Vercel. As with any host, Vercel&apos;s infrastructure sees ordinary request metadata (IP address, requested page) when you load a page. It never sees your files, because they are not sent.</p>
      <h2 className="cat-h">Shared links</h2>
      <p>A Sandbox share link stores its recipe after the <code>#</code>. Browsers do not send that part to servers. Anyone you give the link to can read the recipe, including any input you chose to include.</p>
    </article>
  );
}
