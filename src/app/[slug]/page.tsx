import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ToolHost } from "@/components/ToolHost";
import { SITE, toolBySlug, tools } from "@/lib/tools";

export const dynamicParams = false;
export const generateStaticParams = () => tools.map((t) => ({ slug: t.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = toolBySlug((await params).slug);
  if (!t) return {};
  const title = `${t.name}: free, private, in your browser`;
  return {
    title, description: t.description, keywords: t.keywords,
    alternates: { canonical: `/${t.slug}` },
    openGraph: { title: `${t.name} | BoringX`, description: t.description, url: `/${t.slug}`, images: [`/og/${t.slug}.png`] },
    twitter: { card: "summary_large_image", title: `${t.name} | BoringX`, description: t.description, images: [`/og/${t.slug}.png`] },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = toolBySlug(slug);
  if (!t) notFound();
  const related = tools.filter((x) => x.category === t.category && x.slug !== t.slug).slice(0, 5);
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: t.name, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", description: t.description, url: `${SITE.url}/${t.slug}`, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }) }} />
      <nav aria-label="Breadcrumb" className="crumb"><Link href="/">All tools</Link> / {t.category}</nav>
      <h1 className="tool-h"><span className="boring">Boring</span> {t.name}</h1>
      <p className="lede">{t.blurb}</p>
      <ToolHost slug={t.slug} />
      <section className="about-tool">
        <h2 className="cat-h">About this tool</h2>
        <p>{t.description}</p>
        <p className="help">Nothing is uploaded. This page makes no network requests with your data, and its Content-Security-Policy forbids them.</p>
        {t.recipe && <p className="help">This tool is built from Sandbox blocks. Use &ldquo;Take it apart&rdquo; to change how it works.</p>}
      </section>
      {related.length > 0 && (
        <section><h2 className="cat-h">More {t.category} tools</h2>
          <ul className="ledger">{related.map((r) => <li key={r.slug}><Link className="ledger-row tool-row" href={`/${r.slug}`}><span className="tool-name">{r.name}</span><span className="tool-blurb">{r.blurb}</span></Link></li>)}</ul>
        </section>
      )}
    </article>
  );
}
