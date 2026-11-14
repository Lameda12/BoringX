import type { Metadata } from "next";
import { Sandbox } from "@/components/Sandbox";

export const metadata: Metadata = {
  title: "Sandbox: build your own boring tool",
  description: "Chain blocks into a pipeline: input, a stack of blocks, output. Live, in your browser. Save it, or share it as a link that runs with no server.",
  alternates: { canonical: "/sandbox" },
  openGraph: { images: ["/og/sandbox.png"] }, twitter: { card: "summary_large_image", images: ["/og/sandbox.png"] },
};

export default function Page() {
  return (
    <>
      <h1 className="tool-h"><span className="boring">Boring</span> Sandbox</h1>
      <p className="lede">Input, a stack of blocks, output. It reruns on every change. Name it, save it, or share it as a link.</p>
      <Sandbox />
    </>
  );
}
