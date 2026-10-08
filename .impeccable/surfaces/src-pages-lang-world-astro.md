---
version: 1
slug: "src-pages-lang-world-astro"
primary_target: "src/pages/[lang]/world/index.astro"
related_targets: ["src/pages/[lang]/world/selva.astro"]
---

# Surface brief: /[lang]/world/ (KHIPU worlds: Qhapaq Ñan, Wasi, Antisuyu)

Mode: Experience. Opt-in from the header ("Mundo 3D"). Audience: same as the site, in a curious, playful moment. Job: walk the career as a climb up an Andean mountain along the Inca trail, discover the arcade, reach contact. The HTML site stays the fast path.

## Direction contract

THESIS: The career is a climb up the Qhapaq Ñan. A stylized Andean mountain (asymmetric, organic, terraced) where a stone Inca trail winds from the valley to the summit; each company is a tambo (Inca waystation) along the way holding its khipu. Toon-shaded with ink outlines like Messenger (messenger.abeto.co), warm and handmade like a cozy diorama. Refuses neon/cyberpunk and the floating-cards portfolio.

OWN-WORLD: Flat toon colors with 3-step shading and dark ink outlines (#1f1a17 at day, deep indigo at night). Day palette: sky #9fd7d0→#e9f2e6, andesite stone #b9b1a3/#8f877b, terrace grass #7fae6a/#5f8f55, ichu straw #d8b46a, adobe/thatch #c98b5a/#a8743f, river #5fb8c2. Khipu dyes as accents on cords and textiles: cochineal #c4383f, indigo #3446a6, ochre #dda63c, turquoise #2a9d8f, alpaca #a8825f, cotton #efe6d6. Night: deep blue #1b2340 sky, moon light cool #a9b8ff, torches/lamps warm #ffb35c. Typography: Archivo condensed caps for signs/panels titles, Hanken Grotesk body, JetBrains Mono data. UI as paper/cloth cards with ink borders (Messenger-like square buttons, slight drop offset only because this world is hand-inked).

STORY: Title: the mountain floats like an island in a soft teal void with "KHIPU" in chunky block letters and a COMENZAR/BEGIN button (Messenger opening) → camera swoops down to the trailhead → the traveler climbs: Avances (2014) → Hundred → Belcorp → Auna (3 cords) → Xepelin (+ Complutense cord) → TopSort → Globant → Q'eswachaka rope bridge over a gorge (artifacts as cords tying the bridge) → Arcade Tambo (stone house with blocky arcade cabinets; E to play) → AI Intihuatana (observatory stone, glyph screen "Del ruido a la señal") → Chasqui post at the summit (contact) → under-construction plots with scaffolding and cones.

FIRST VIEWPORT: The floating mountain island with the KHIPU title and BEGIN, slowly rotating, clouds drifting, current local time sets day or night.

SIGNATURE: Day/night cycle: the sun and moon travel, the sky and ink color shift, and at dusk tambo lamps and torches light up along the trail. Approaching a tambo: its khipu knots light one by one and the panel unfolds.

GUARDRAILS: Third-person camera behind the traveler (Messenger-like), smooth follow, no clipping; WASD/arrows, Shift run, Space jump, E interact, M map, T toggle day/night; mobile joystick + buttons; guided tour along the trail. Generic Andean traveler (chullo, poncho with khipu stripes, backpack with a laptop), not a real person. No external assets; procedural geometry + canvas textures. 60 fps target on a mid laptop (instancing, merged static meshes, outline at full res but cheap, DPR cap 1.5, quality toggle). Content only from src/data/career.ts and site.ts. Reduced motion: no camera swoop/shake, time cycle paused at the chosen time. No WebGL: message + link back. Bilingual. URLs /es/world/ and /en/world/.

WORLDS: The direction above is the mountain (Qhapaq Ñan). The same language extends to the Wasi house at the trailhead (adobe, red tile, woven rugs; interior loaded on approach) and to the Antisuyu jungle on its own page /[lang]/world/selva/ (a long road beside a brown river: laterite earth, deep greens, palm-thatch and stilt houses, a paddled canoe, a canopy walkway, Amazon wildlife). Same toon ramp, ink, paper UI and guardrails.
