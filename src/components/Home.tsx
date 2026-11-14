"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { byCategory, score, tools } from "@/lib/tools";

export function Home() {
  const [q, setQ] = useState("");
  const results = useMemo(() => (q.trim() ? tools.map((t) => ({ t, s: score(t, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t) : null), [q]);
  return (
    <>
      <section className="hero">
        <h1 className="hero-h"><label htmlFor="hero-q"><span className="boring">Boring</span></label>
          <input id="hero-q" className="hero-in mono" autoComplete="off" spellCheck={false} placeholder="PDF, JSON, QR, case…" value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="hero-help" />
        </h1>
        <p id="hero-help" className="help">Type what you need done. {tools.length} tools, each does one dull job. Press <kbd>/</kbd> to search from anywhere.</p>
      </section>
      {results ? (
        <section aria-live="polite" aria-label="Search results">
          {results.length ? (
            <ul className="ledger">{results.map((t) => <ToolRow key={t.slug} t={t} />)}</ul>
          ) : (
            <div className="empty">
              <p>Nothing matches &ldquo;{q.trim()}&rdquo;.</p>
              <Link className="btn btn-primary" href={`/sandbox#n=${encodeURIComponent(q.trim())}`}>Build Boring {q.trim()}</Link>
              <p className="help">Opens the Sandbox, where you can chain blocks into your own tool.</p>
            </div>
          )}
        </section>
      ) : (
        <>
          <ul className="ledger lead"><li><Link href="/sandbox" className="ledger-row tool-row"><span className="tool-name">Sandbox</span><span className="tool-blurb">Chain blocks into your own tool. Save it, or share it as a link.</span><span className="tag">Build</span></Link></li></ul>
          {byCategory().map(({ category, tools: list }) => (
            <section key={category} aria-labelledby={`c-${category}`}>
              <h2 id={`c-${category}`} className="cat-h">{category}</h2>
              <ul className="ledger">{list.map((t) => <ToolRow key={t.slug} t={t} />)}</ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function ToolRow({ t }: { t: (typeof tools)[number] }) {
  return (
    <li><Link href={`/${t.slug}`} className="ledger-row tool-row"><span className="tool-name">{t.name}</span><span className="tool-blurb">{t.blurb}</span><span className="tag">{t.category}</span></Link></li>
  );
}
