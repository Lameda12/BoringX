import type { Metadata } from "next";
import Link from "next/link";
import { tools } from "@/lib/tools";

export const metadata: Metadata = { title: "About", description: "What BoringX is, and what it deliberately is not.", alternates: { canonical: "/about" } };

export default function About() {
  return (
    <article className="prose">
      <h1 className="tool-h">About</h1>
      <p>BoringX is {tools.length} small tools that each do one dull job: merge a PDF, format some JSON, strip the location from a photo. Everything runs in your browser. There is no server doing the work.</p>
      <h2 className="cat-h">What it is not</h2>
      <ul>
        <li>Not an account. There is nothing to sign up for.</li>
        <li>Not limited. No daily caps, no file-size paywalls, no watermarks.</li>
        <li>Not tracking you. There is no analytics script.</li>
      </ul>
      <h2 className="cat-h">The Sandbox</h2>
      <p>Most text and data tools here are small chains of blocks. The <Link href="/sandbox">Sandbox</Link> lets you rearrange those blocks into your own tool, including a Custom JavaScript block that runs in an isolated Worker. You can save the result in your browser or share it as a link; the whole recipe is in the link, so it opens and runs with no server.</p>
      <h2 className="cat-h">Honest limits</h2>
      <ul>
        <li>Heavy tools (background removal, OCR) download their engine from this site the first time, then work offline. They are slower than a server with a GPU.</li>
        <li>PDF compression is either a lossless tidy-up, or a lossy flatten to images. There is no magic third option in a browser.</li>
        <li>AVIF output depends on your browser. Where it cannot encode AVIF, the tool says so.</li>
        <li>OCR is English only.</li>
      </ul>
      <p>Source code is on <a href="https://github.com/Lameda12/BoringX">GitHub</a> under the MIT licence. Adding a tool is adding one file.</p>
    </article>
  );
}
