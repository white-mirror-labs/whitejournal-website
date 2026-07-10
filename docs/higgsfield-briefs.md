# Higgsfield Shot Briefs — White Mirror

Optional cinematic layer for the marketing site. The homepage already ships a code-authored SVG animation (`.journal-anim`) that carries every section with zero dependencies. These briefs are for photoreal clips you render in Higgsfield (or Runway / Kling / Sora) and drop into the ready `<video class="journal-film">` slot.

## Brand constraints (apply to every shot)

- **Palette**: strict greyscale. Paper white, ink black, soft greys. No color casts, no warm/cool grade — neutral.
- **Mood**: quiet, still, deliberate. Slow moves only. No fast cuts, no zooms, no flashy transitions.
- **Light**: soft, single-source, natural window light. Gentle shadows.
- **Texture**: matte paper, real ink, natural hand. Nothing glossy or plasticky.
- **Length**: 4–8s, seamless loop (start frame ≈ end frame).
- **Format**: MP4, H.264, muted, 1:1 or 4:5 for the journal slot (matches the visual card). Also render a 16:9 master.
- **No text, no logos baked in** — copy lives in HTML over/beside the clip.

## Shot 1 — The Journal (primary slot: `.journal-film`)

- **Prompt**: "A minimalist matte-white hardcover journal resting on a pale grey desk, soft diffused window light from the left, a hand slowly opening the cover to a blank ruled page, shallow depth of field, greyscale, calm and meditative, slow gentle motion, cinematic still-life."
- **Duration**: 6s, loop (cover closed → opening → settle, reversible).
- **Aspect**: 1:1 (slot), plus 4:5.
- **Use**: the journal section — layers over the SVG.

## Shot 2 — App in hand

- **Prompt**: "A person holding a phone in soft greyscale light, thumb slowly scrolling a clean minimalist journaling app, screen glow subtle and neutral, quiet interior, shallow depth of field, unhurried motion, no visible UI text."
- **Duration**: 5s, loop.
- **Aspect**: 4:5 / 9:16 for a future app section.
- **Use**: companion-app teaser (App section) — future.

## Shot 3 — The Mirror (concept)

- **Prompt**: "Abstract greyscale reflection on still water, a single slow ripple expanding from center then settling to a perfect calm mirror surface, soft light, meditative, seamless loop, no objects, minimalist."
- **Duration**: 8s, loop.
- **Aspect**: 16:9 and 1:1.
- **Use**: method / hero background accent — optional.

## Wiring a rendered clip in

1. Drop the file in `assets/` (e.g. `assets/journal-film.mp4`) with a poster frame `assets/journal-film.jpg`.
2. In `index.html`, inside `<video class="journal-film" ...>`, add:
   ```html
   <source src="assets/journal-film.mp4" type="video/mp4" />
   ```
   and set `poster="assets/journal-film.jpg"` on the `<video>`.
3. Reveal it over the SVG by setting the attribute `data-ready="1"` on the `<video>` (CSS fades it in). Add `autoplay` if you want it to play on load.
4. Keep the SVG in place — it's the instant-load fallback before the video buffers and the reduced-motion default.
