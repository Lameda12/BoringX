"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { byCategory, score, tools } from "@/lib/tools";

export function Home() {
  const [q, setQ] = useState("");
  const results = useMemo(() => (q.trim() ? tools.map((t) => ({ t, s: score(t, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t) : null), [q]);
  return (
    <>
      <section className="hero" aria-label="Find a tool">
        <div className="hero-text">
          <h1 className="hero-h">
            <label htmlFor="hero-q"><span className="boring">Boring</span></label>
            <input id="hero-q" className="hero-in" autoComplete="off" spellCheck={false} placeholder="PDF, JSON, QR" value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="hero-help" />
          </h1>
          <p className="lead">{tools.length} small tools that each do one dull job, in your browser.</p>
          <p id="hero-help" className="sr-only">Type to filter the tools. Press slash to search from any page.</p>
          <div className="row"><Link href="/sandbox" className="btn btn-primary" style={{ minHeight: 48 }}>Open the Sandbox</Link></div>
        </div>
        <aside className="hero-panel" aria-label="A Sandbox recipe">
          <header>Sandbox recipe</header>
          <pre>{`input    banana, apple, Banana,
         cherry, apple, date
`}<span className="tk">1 Clean list</span>{`     dedupe, A to Z
`}<span className="tk">2 Change case</span>{`    UPPER CASE
`}<span className="tk">3 SQL IN list</span>{`    column: fruit
`}<span className="mut">output</span>{`   fruit IN ('APPLE', 'BANANA',
         'CHERRY', 'DATE')`}</pre>
        </aside>
      </section>

      {results ? (
        <section aria-live="polite" aria-label="Search results" className="results">
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
        byCategory().map(({ category, tools: list }) => (
          <section key={category} className="cat-row" aria-labelledby={`c-${category}`}>
            <div>
              <h2 id={`c-${category}`} className="cat-name">{category}</h2>
              <p className="cat-count">{list.length} tools</p>
            </div>
            <ul className="ledger">{list.map((t) => <ToolRow key={t.slug} t={t} />)}</ul>
          </section>
        ))
      )}
    </>
  );
}

function ToolRow({ t }: { t: (typeof tools)[number] }) {
  return (
    <li><Link href={`/${t.slug}`} className="ledger-row tool-row"><span className="tool-name">{t.name}</span><span className="tool-blurb">{t.blurb}</span></Link></li>
  );
}
