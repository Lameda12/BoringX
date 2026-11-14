# BoringX design system

Locked system for every page. Theme: Cobalt (Hallmark), light and dark. Genre: modern-minimal.

- **Tokens:** `src/app/tokens.css` (colour, type scale, spacing, motion, dark block). No literal colour or font-family elsewhere.
- **Type:** Familjen Grotesk 500/600 for headings, labels and keys; IBM Plex Sans for body; JetBrains Mono only for typed input, code and machine values. Labels are sentence case and untracked.
- **Surfaces:** 1px rules, panels cut on two opposite corners (8px radius fallback), graphite for results and code. Cobalt stays under 5% of a screen.
- **Controls:** keycaps (3px bottom edge, lift on hover, sink on press); one solid cobalt key per view; tabs are keys on a sunken tray. App screens use 40px keys with a 44px hit area.
- **Pages (home, about, privacy):** one idea per screen, 120px or more between sections. **App screens (40 tools, Sandbox):** panels in a 62rem column, dense, four states on anything that loads.
- **Voice:** dry and short. Footer line: "Nothing exciting happens here."
- **Floor:** no gradients except the transparency checkerboard, no emoji, no eyebrows, no tracked capitals, no `transition: all`, reduced-motion fallback, visible focus.
