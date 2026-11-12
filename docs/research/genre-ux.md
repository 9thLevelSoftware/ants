# FOUNDRESS genre and UX research

Compiled 2026-11-12. Genre-mechanics level only: no designs, names, art or layouts are borrowed from any title (see `docs/01-design-seed.md` section 0).

**Evidence limits, stated up front.**
- The shared web-search budget ran out part-way through this task. Everything below comes from direct page fetches: Wikipedia, Steam store pages, Steam community review pages, the Steam store-search endpoint, the Game Accessibility Guidelines.
- Review evidence is a small sample of the top-voted reviews, summarised by the fetch tool. Treat it as a pattern, not a statistic.
- AntWiki returned HTTP 403, so species details come from Wikipedia. Items marked **[unverified]** are widely reported ant biology that I could not source this session. The biology research task should confirm them before they become sim parameters.
- Not found: any primary-source usability study of ant-colony games. The "lessons" are my synthesis of reviews, not measured findings.

---

## 1. Genre survey (mechanics level)

### 1.1 What the reference games are, in one line each

| Title / group | Core loop (mechanics only) | Evidence |
| --- | --- | --- |
| The 1991 ant sim | One controllable ant on a small patch, recruiting and laying trails, digging, fighting a rival colony. A win condition exists, which is unusual for the "Sim" family. Surface hazards: footsteps, spray, mower, rain washing out trails. A larger mode expands by producing winged reproductives who found new colonies. | [Wikipedia: SimAnt](https://en.wikipedia.org/wiki/SimAnt) |
| Documentary-style ant RTS (released June 2024 after early access from Dec 2017) | Hex-based nest digging, storage and nursery chambers, workers foraging on the surface, warrior groups steered with pheromone markers and rules of engagement, several species, day/night, skirmish and campaign modes. | [Steam store page](https://store.steampowered.com/app/463530/Empires_of_the_Undergrowth/), [Wikipedia](https://en.wikipedia.org/wiki/Empires_of_the_Undergrowth) |
| Ant-keeping sims | Feed a colony from a test tube to thousands, upgrade housing, manage water and humidity. "Semi-idle" in tone. | [Steam page](https://store.steampowered.com/app/2827520/Ant_Keeping_Simulator/) |
| 2026-27 top-down colony sims (not yet released) | One reports queen founding after a nuptial flight, up to 10 chamber types, pheromone overlay, aphid farming, single-ant possession, satellite nests. Another has seekers and loaders on shaped supply lines, 2D pixel art, tunnel chokepoints. | [Steam: first](https://store.steampowered.com/app/4910350/Antopolis_The_Ant_Colony_Simulator/), [Steam: second](https://store.steampowered.com/app/1238190/Ant_Colony_Wild_Forest/) |
| Shrunk-human survival (Grounded) | Third-person or first-person survival at ant scale: base building, crafting, insect behaviours, an option that changes how frightening spiders look. Nominated for an accessibility award in 2020. | [Wikipedia: Grounded](https://en.wikipedia.org/wiki/Grounded_(video_game)) |
| General colony sims | Indirect control by priorities (the settlers decide, the player queues work); an event director that paces trouble; deep systems with steep learning curves. | [RimWorld](https://en.wikipedia.org/wiki/RimWorld), [Dwarf Fortress](https://en.wikipedia.org/wiki/Dwarf_Fortress), [Oxygen Not Included](https://en.wikipedia.org/wiki/Oxygen_Not_Included) |

**Market note.** At least two unreleased ant sims already advertise "found from a queen" and "possess an ant". FOUNDRESS cannot lean on those hooks alone. Its differentiators are in the seed: a true surface-walker in 3D on walls, ceilings and tunnels, species-specific biology, free-form carved nests, a readable-causality tool and a quiet observation focus.

### 1.2 What players praise (sampled)

- **Realism and education.** Reviewers of the documentary-style RTS (95% positive of 11,133 reviews on the fetch date) praise its natural behaviour, one reviewer self-identified as an entomologist, plus presentation, music and narration. They also praise research and upgrades adding depth. [Steam reviews](https://steamcommunity.com/app/463530/reviews/?browsefilter=toprated&filterLanguage=english)
- **Emergent stories.** Dwarf Fortress reviewers praise outcomes "often hilarious, occasionally tragic, and always surprising"; RimWorld is praised for generating drama and for handling failure well. [Dwarf Fortress](https://en.wikipedia.org/wiki/Dwarf_Fortress), [RimWorld](https://en.wikipedia.org/wiki/RimWorld)
- **Indirect control that still lets tasks wait.** In the space colony sim, if a material is missing the order stays open while workers do something else. Players are not blocked by one stuck job. [Wikipedia: Oxygen Not Included](https://en.wikipedia.org/wiki/Oxygen_Not_Included)
- **Gravity-relative traversal.** Critics praised the changing-gravity mechanic of a planet-hopping platformer as feeling almost second nature, and the designer reportedly regretted offering several camera modes because choosing one became a burden. [Wikipedia](https://en.wikipedia.org/wiki/Super_Mario_Galaxy)
- **Wonder.** The 1991 game's own designer called it too simple and said it failed to convey "how cool ants are". [Wikipedia: SimAnt](https://en.wikipedia.org/wiki/SimAnt)

### 1.3 What players complain about (sampled)

| Complaint | Where seen | Lesson for FOUNDRESS |
| --- | --- | --- |
| No pause or save mid-session; 30-60+ minute missions with waiting and busywork | [Negative reviews, RTS](https://steamcommunity.com/app/463530/negativereviews/?browsefilter=toprated&filterLanguage=english) | Pause-with-orders and autosave are non-negotiable. The seed already has pause and autosave. |
| Marker or pheromone micromanagement is tedious and gets worse late; the dominant strategy becomes "build a bigger swarm" | same | Few, durable, area-based markers. Let autonomy do the routine so "more ants" is not the only answer. |
| Weak AI opponents; difficulty spikes; players must follow one fixed order | same | Rivals need readable goals. Event pacing needs a director, not raw randomness (see 2.3). |
| Grindy progression (replay missions to upgrade); limited randomisation | [Positive and mixed reviews](https://steamcommunity.com/app/463530/reviews/?browsefilter=toprated&filterLanguage=english) | Seeded worlds plus lineage give replay without grind. No currency for upgrades. |
| Tutorial incomplete or absent; "had to research the game" | RTS reviews; [ant-keeping reviews](https://steamcommunity.com/app/2827520/negativereviews/?browsefilter=toprated&filterLanguage=english); [Dwarf Fortress](https://en.wikipedia.org/wiki/Dwarf_Fortress) | Onboarding is a feature, not an afterthought (2.1). |
| Clunky camera: hard to aim at ants, zoom/pan/rotate awkward; ants and queen clip through walls | ant-keeping reviews | The camera and collision share one `f(p)` field in the seed. Keep it that way and test tight tunnels first. |
| Time controls too slow even at very high multipliers; confusing economy | ant-keeping reviews | Fast-forward must produce visibly meaningful change; offer "skip to next event". |
| Steep early game (RimWorld's early game criticised); complexity barrier for casual players; no in-game learning tools | [RimWorld](https://en.wikipedia.org/wiki/RimWorld), [ONI](https://en.wikipedia.org/wiki/Oxygen_Not_Included) | Ramp complexity by tier; the codex doubles as the learning tool. |
| Late-game stagnation: story ends in about an hour, sandbox has few goals beyond building; respawning enemies become trivial; chores such as spoiling food in the inventory | [Negative reviews, shrunk-human survival](https://steamcommunity.com/app/962130/negativereviews/?browsefilter=toprated&filterLanguage=english) | The world must change in response to the colony's actions. Avoid inventory chores entirely. |
| Third-party tools fill UI gaps (a community labour-management tool exists for the big dwarf sim) | [Dwarf Fortress](https://en.wikipedia.org/wiki/Dwarf_Fortress) | If players need an outside tool to see why something is happening, the game has failed at legibility. |

**Camera and control convention evidence.** Wikipedia's survey of third-person cameras lists occlusion, poor framing and awkward behaviour against walls and turns as classic problems, and notes that fully player-controlled cameras are hard to implement well. [Wikipedia: Virtual camera system](https://en.wikipedia.org/wiki/Virtual_camera_system) Nothing in the sampled reviews discusses tunnels directly, so the tunnel recommendations below are design judgement.

---

## 2. Recommendations for FOUNDRESS

### 2.1 Onboarding without dialogue or characters

**Principle:** teach by doing, in the order the player's body needs the verbs. No narrator, no named guide, no pop-up wall of text.

1. **Diegetic cues first.**
   - A subtle "sniff" key makes antennae sweep and a faint glowing scent haze appear. This is the entry point for all scent teaching.
   - Soil texture visibly changes where digging is possible.
   - Light and shade, damp patches and cracks carry the "where to found" hint.
   - The queen's body shows reserve: a thinning abdomen (the founding queen of the reference species loses roughly half her body weight; [Wikipedia: Lasius niger](https://en.wikipedia.org/wiki/Lasius_niger)).
2. **Contextual prompts.**
   - A small input glyph appears near the ant, not in a corner, only when the verb is available and not yet learned.
   - After two or three successful uses it never reappears (per verb, stored in the save).
   - Prompts never block movement or take focus.
   - A "Remind me of controls" key re-shows them. This meets the guideline to allow a reminder of controls during play. [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)
3. **Field-journal codex as the only "text".** The journal opens on a key at any time and is never forced open.
   - Entries unlock by *observing*, not by reading: watch trophallaxis once and the sketch fills in.
   - Each entry has three parts: a hand-drawn plate, one real-biology fact (with a source line), and one "in this game" consequence.
   - The journal includes a "Current focus" line of 1-3 open questions phrased as a naturalist would ("Where does the trail break?"). This satisfies the guideline to let players recall current objectives. [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)
4. **Safe practice.** The founding phase is itself the tutorial in a low-risk space, and Gentle difficulty removes predators. The guidelines list "a means of practicing without failure" as an intermediate item.
5. **Skippable.** Every teaching beat has a "I know this" skip. Experienced players can disable all prompts in settings.
6. **Test criterion (proposed).** A first-time tester should dig a chamber and lay eggs without reading any text beyond glyph labels. Run this as a usability check on the headless build and on a few humans.

### 2.2 Pacing of the founding phase

**Calendar arithmetic (derived, not sourced).** The seed's year is 28 game days and 1 game day = 10 real minutes at 1x. The reference species takes 8-10 real weeks for eggs to become workers ([Wikipedia: Lasius niger](https://en.wikipedia.org/wiki/Lasius_niger)). Compressed to the game calendar that is 8/52 to 10/52 of 28 days, so about 4.3 to 5.4 game days, or roughly 43-54 real minutes at 1x. That is too long to sit through, which confirms the seed's choice of a skippable time-lapse.

Proposed beat sheet. Targets are for a first-time player; a fast route should be under 6 minutes of active play.

| Beat | Target real time | Player activity | Naturalistic hook |
| --- | --- | --- | --- |
| 0. Dealation | 0:30 | Cinematic-free: the queen sheds her wings; the camera settles. | Queens shed wings after mating ([Wikipedia](https://en.wikipedia.org/wiki/Lasius_niger)). |
| 1. Choose a site | 2-4 min | Explore. Read damp, shade, light, crack hints with the sniff key. Light threats (a beetle, a footfall shadow). | Site choice has consequences for later moisture and temperature. |
| 2. Dig | 2-4 min | Excavate an entrance and a small chamber; soil pellets carried out to a mound. | Seed: free-form carved grid, pellets to a mound. |
| 3. Lay and tend | 1-2 min | First clutch; light brood handling (turn, lick, move for warmth). | Eggs, larvae and pupae are distinct stages ([brief S4](https://pmc.ncbi.nlm.nih.gov/articles/PMC7862224/)). |
| 4. Time-lapse | 60-90 s, skippable | Watch eggs, larvae, pupae pass, her body thin. | Pupae and white callow workers that darken within about an hour ([Wikipedia](https://en.wikipedia.org/wiki/Lasius_niger)). |
| 5. Interruptible beats inside the time-lapse | 0-2 per founding | Rare: a damp spell, an intruder. The player may drop out of the time-lapse to respond. | Keeps the player a participant. Entirely optional; the default outcome is survival. |
| 6. First workers | 1-2 min | Control a worker for the first time: sniff for food, exit, return. | Early workers are small ([Wikipedia](https://en.wikipedia.org/wiki/Lasius_niger)). |

**Design stakes.** Real founding has genuine risk: the queen does not eat, may eat some eggs, and several founding queens often fight until one remains once workers appear ([Wikipedia](https://en.wikipedia.org/wiki/Lasius_niger)). On Gentle, expose only mild stakes (a poor site slows development). On Harsh, allow failure of a founding.

### 2.3 Keeping an open-ended sandbox engaging

1. **Milestones as journal observations, not points.** First trail, first aphid herd, first midden, first winter survived, first alates, first daughter colony. No rewards besides a plate and a line in the lineage book. This follows the brief's "optional milestones" and avoids a grind economy.
2. **Event director, with a tone dial.** One colony sim pairs a "story teller" with presets for rising/falling tension, calmer pacing and pure randomness ([Wikipedia: RimWorld](https://en.wikipedia.org/wiki/RimWorld)). The mechanic transfers; we do not copy names. Proposal: an event director with three feel presets (Gentle seasons, Naturalist, Restless) and these rules:
   - minimum quiet interval between hazards, scaled by difficulty;
   - at most one major threat active at a time;
   - events drawn from real ecology first (weather, season, rival territory, prey availability), human events second.
3. **A world that answers.** The late-game complaint in survival games is a static world. FOUNDRESS ties events to colony state: a big colony attracts rival pressure and parasites; its trails become routes that human activity (watering, cleaning, a moved object) can cut.
4. **Late-game layers.**
   - *Generational:* nuptial flights, daughter colonies and the lineage tree (seed section 1).
   - *Comparative:* compare a lineage's colonies across species and seeds.
   - *Naturalist goals:* optional census, mapping, "find all micro-connections" tasks.
   - *Shareable seeds:* a seed string needs no server. A "locality of the day" derived from the date also needs none (proposal).
5. **Dignified failure.** Per the seed, failure ends in an epitaph/history screen. Make it a readable life history. RimWorld's praised handling of failure is the model ([Wikipedia](https://en.wikipedia.org/wiki/RimWorld)).

### 2.4 Making autonomous agents legible ("why is this happening")

Failure mode to avoid: a stalled job with no reason shown. The space colony sim's orders "stay incomplete" when a material is missing, which is robust but silent ([Wikipedia](https://en.wikipedia.org/wiki/Oxygen_Not_Included)).

1. **Every trend has a Why.** Any rate on the colony panel (food intake, brood growth, dig progress) carries a "Why?" affordance that opens a ranked cause list with magnitudes, for example "Food intake down 38% over 3 days: 2 of 5 trails cut by rain; 1 trail blocked by a moved object; fewer foragers (priority slider)."
2. **Cause highlighting in the world.** Choosing a cause pulses the entities involved and moves the camera there.
3. **Per-ant "last decisions" ring.** Select any ant to see its current task, carried item, and its last five decisions with the winning reason ("following trail, strength above remembered route", "returning: crop full"). This exposes the AI in plain language and makes unreliable-AI complaints diagnosable.
4. **Overlays (on demand).** Scent channels (trail, home, alarm), traffic density, temperature and humidity, brood and nutrition, territory. Each has a legend. The seed's scent view and diagnostics view map to this.
5. **Alert tray.** Rules:
   - at most three visible alerts, ranked by severity;
   - de-duplicate and cool down;
   - per-category snooze;
   - never modal;
   - each alert has a jump-to key and one cause line.
6. **Diegetic alerts.** An alarm-scent plume near a breach, brood restlessness, a change in nest sound. Audio cues should be paired with visuals for deaf and hard-of-hearing players.
7. **Time travel for causes.** Keep a rolling 2-5 minute event log (what happened, where) so "why did that happen?" can scrub back. Not found in the sampled games; this is a proposal.

### 2.5 Third-person control on walls, ceilings and tunnels

These are design judgement built on the conventions above and the seed's surface-walker.

1. **Orientation.** The camera "up" follows the ant's surface normal with eased smoothing (roughly 0.25-0.5 s) so wall and ceiling transitions are not a snap. Offer a **world-up lock** comfort option: the horizon stays level and the ant moves "sideways" on walls. It reduces disorientation at the cost of immersion.
2. **Input continuity at transitions.** When the surface normal changes sharply (a wall edge, a crack lip), keep the player's input mapped to the *previous* frame until the stick is released or deflects past a threshold. This prevents the classic "input flips when I cross the edge" failure.
3. **Camera follows, player overrides.**
   - Never auto-re-centre while the player is dragging the camera.
   - After release, decay gently toward a default behind-and-above framing.
   - Do not auto-rotate on the player's behalf during tight turns.
   - One mode only; the platformer evidence suggests offering many modes becomes a burden ([Wikipedia](https://en.wikipedia.org/wiki/Super_Mario_Galaxy)).
4. **Collision.** The sphere-traced camera against `f` from the seed should pull in smoothly and widen the field of view in tunnels. Fade the near geometry rather than clipping through it.
5. **Tunnels.**
   - Use a close over-shoulder framing with look-ahead along the nest's BFS centreline.
   - In a chamber, pull back to a looser orbit.
   - When the camera cannot see the ant, turn nearby walls translucent for a cutaway.
6. **Look-around without pointer lock.** Drag to orbit is mandatory (seed); also offer hold-key peek and a free "observer" camera.
7. **Possession switching.** Swap to a selected ant with a short camera transition, not a hard cut. Leaving returns the ant to autonomy (seed pillar 1).
8. **Gamepad.** Left stick moves relative to camera; right stick orbits; triggers for zoom/crouch-to-grip; bumpers cycle nearby ants.

### 2.6 Time controls

- Pause, 1x, 2x, 4x, 8x per the seed (8x only when not possessing an ant).
- **Orders while paused.** The RTS complaint list names inability to pause and issue orders; the accessibility guidelines recommend letting actions happen while paused. [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)
- **Auto-slow on events** (configurable): drop to 1x or pause when a major alert fires.
- **Skip-to-next-event** button for quiet stretches, so fast-forward is not the only way through waiting.
- **Time-lapse** (first brood, overwintering) uses a crossfade in reduced-motion mode instead of fast flicker.
- **Game speed option.** The guidelines list adjustable game speed as a basic item. [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/)

### 2.7 Difficulty and comfort options

| Option | Proposal | Evidence |
| --- | --- | --- |
| Difficulty | Gentle / Naturalist / Harsh plus toggles (seed). Allow changing mid-game. | Guidelines list wide choice and mid-game change as basic and intermediate items. |
| Arachnid comfort | Ladder: Off / Stylised (simplified silhouette) / Abstract (no visible legs) / Replaced (a non-arachnid model with identical behaviour and a label). A live preview in the menu. Applies to every spider and mite model. | The shrunk-human survival game ships a spider-appearance option ([Wikipedia](https://en.wikipedia.org/wiki/Grounded_(video_game))). The exact ladder is my proposal. |
| Other comfort filters | Flying insects, brood clusters (some players dislike dense clustered pits), combat gore (hide haemolymph, fade bodies). Not sourced; proposed. | -- |
| Reduced motion | Disable camera bob, shake, FOV kick, depth-of-field motion and haze parallax; crossfade time-lapses. | Guidelines: option to hide background movement; avoid sudden unexpected movement. |
| Photosensitivity | No flashes or repetitive strobing patterns. | Guidelines: avoid flickering images and repetitive patterns. |
| Colour-blind safe overlays | Never rely on hue alone. Differentiate scent channels by pattern and motion (arrows for trail, dots for home, zigzag for alarm) plus a selectable palette. | Guidelines: no essential information by fixed colour alone. A colour-universal palette such as Okabe-Ito is the usual reference **[unverified this session]**. |
| UI scale and text | Scale 75-200%; text size separate; high-contrast mode. | Guidelines: resizable interfaces, adjustable font size, adjustable contrast. |
| Input | Full remapping; toggle vs hold for sprint, grip and sniff; gamepad; one-handed layout. | Guidelines list remapping as a basic item. |
| Photo mode | Free camera, hide-HUD, DOF and exposure sliders, time-of-day lock, species-appropriate rule-of-thirds guides. Works while paused. | Supports "quiet is good" (seed pillar 6). Not sourced. |
| Audio | Captions for all audio cues that carry information (alarm, nest crackle). Separate volume sliders. | Guidelines (captions). |

---

## 3. HUD and information design

### 3.1 Conventions that fit the tone

- Most HUDs are static and non-diegetic, but placing information in the world preserves immersion; dynamic HUDs show only what is relevant and reduce clutter. [Wikipedia: Head-up display (video games)](https://en.wikipedia.org/wiki/Head-up_display_(video_games))
- One game lets players set each HUD element to always show, show when relevant, or never show. Copy this as a **per-element visibility setting**. Same source.
- Skin: paper, ink, soil tones, field-sketch plates. **Legibility wins over theme:** the texture lives behind the text, and text contrast is checked against the high-contrast setting.
- Use plain words and units: "workers", "crop full", "damp". No game-y jargon (no "XP", "buffs").

### 3.2 Proposed information hierarchy

**A. Always visible (maximum six elements, each hideable).**
1. Date, season glyph, time-of-day, speed indicator.
2. A collapsed colony pulse: workers, brood count, food trend arrow. One line.
3. Alert tray (up to three).
4. Contextual input glyph near the ant when relevant.
5. Possession indicator: which ant, which caste, one-word task.
6. Compass or heading marker (optional; hidden by default).

**B. Diegetic, on the creature or in the world (no panel needed).**
- Carried item in the mandibles; crop fullness as a translucent glow on the abdomen.
- Queen's abdomen size as reserve.
- Brood restlessness and chamber light as stress signals.
- Trail brightness as strength (only in sniff mode).

**C. Peek (hover or hold key).**
- Ant card: caste, age, task, carrying, last five decisions.
- Chamber card: function, occupancy, humidity, temperature.
- Food-source card: type, amount, who is using it.

**D. On demand (panels and overlays, one key each).**
- Colony panel: workforce allocation sliders, caste and alate production, diet emphasis.
- Marker palette: dig plan, forage, avoid, rally, new entrance, move brood.
- Overlays: scent channels, traffic, climate, brood and nutrition, territory.
- Diagnostics "Why?" view and the event log.
- Lineage tree.

**E. Codex (field journal).**
- Species notes, behaviour plates, milestones, season logs, glossary.
- A searchable list of every tooltip term.
- Settings-linked help: "Remind me of controls", "Current focus".

**Rule of thumb:** if a number can be read off an ant or a chamber, it does not belong in panel A.

---

## 4. Title check

**Method.** No web search was possible (budget exhausted), so I queried the Steam store search endpoint and itch.io's search page directly on 2026-11-12. I did not check Epic, GOG, mobile stores, trademark registers or domains.

**Findings for "Foundress".**
- Steam: **0 results** for "foundress".
- itch.io: no game titled "Foundress"; one unrelated title contains the word ("Recast: The Foundress's Penance"). I did not open it to establish what it is.
- Wikipedia has no article called "Foundress" (404).
- **Conclusion: no notable conflict found.** Keep FOUNDRESS.

**Alternatives were checked anyway (Steam store endpoint, same date):**

| Candidate | Steam hits | Note |
| --- | --- | --- |
| Underfoot | **Taken**: a game named "Underfoot" ($4.99) and "Underfoot Queens" both exist | Reject. |
| Formicarium | 0 | Generic word for an ant nest, so weak as a distinctive mark. |
| Claustral | 0 | Technical term for queens founding from stored reserves, so it fits the opening. Best fallback. |
| Trailborn | 0 | Reads as fantasy; says little about ants. |
| Hypogeum | 0 | Evocative (underground chamber); hard to say and spell. |
| Gyne | 0 | Technical term for a reproductive queen; obscure and easily misread. |

**Related names on Steam to avoid sounding like:** "Might and Mandibles", "Myrmidon", "Antopolis".

**Recommendation.** Keep **FOUNDRESS**. If a conflict appears in the unchecked registers, fall back to **Claustral**. Before launch, run proper trademark and store checks (national trademark registers, Epic, GOG, app stores, domain and social handles).

---

## 5. Naturalistic delight moments (at least 25)

**Species tags:** LN = *Lasius niger*; CP = *Camponotus pennsylvanicus*; MB = *Messor barbarus*; AT = *Atta texana*; ALL = every species. **[u]** = widely reported but not verified this session. Sources: [Lasius niger](https://en.wikipedia.org/wiki/Lasius_niger), [Atta texana](https://en.wikipedia.org/wiki/Atta_texana), [leafcutter ants](https://en.wikipedia.org/wiki/Leafcutter_ant), [Messor barbarus](https://en.wikipedia.org/wiki/Messor_barbarus), [Camponotus pennsylvanicus](https://en.wikipedia.org/wiki/Camponotus_pennsylvanicus), [Ant](https://en.wikipedia.org/wiki/Ant), and the [brief's S5](https://pubmed.ncbi.nlm.nih.gov/22972897/).

1. **Callow dawn** [LN, ALL]: new workers emerge pale and darken to black over about an hour, so the first generation visibly "colours in".
2. **The thinning queen** [LN]: the founding queen's abdomen shrinks as she lives off her reserves, losing roughly half her body weight by the time workers hatch.
3. **A hard choice** [LN]: a hungry founding queen may eat some of her own eggs, and the player sees it happen.
4. **Hooked larvae** [LN]: larvae cling to each other by hooked hairs so workers can carry a bunch at once, then individually before the last moult.
5. **The buried cocoon** [LN]: workers bury a larva in soil so it can spin its cocoon undisturbed.
6. **Dealation** [ALL]: a newly mated queen sheds her wings, and the player's first act is a small physical change.
7. **Flying day** [LN, ALL]: nuptial flights synchronise across a region after hot spells, with thousands of reproductives in the air (more spread out in overcast weather).
8. **Males gather at a landmark** [ALL]: males collect at tall landmarks such as a tree, and a young queen can fly toward one.
9. **A short life** [LN, ALL]: males die within a day or two of flying, shown without fuss.
10. **Mouth-to-mouth** [ALL]: trophallaxis is visible, with the donor's crop glowing and the receiver's abdomen filling.
11. **Alarm frenzy** [ALL]: a crushed ant's alarm scent sends nearby ants into an attack frenzy that spreads and fades.
12. **Trail repair** [ALL]: when a path is blocked ants mill at the break, explore, and the shortest successful route becomes the new trail.
13. **Memory versus scent** [LN]: a worker may follow a remembered route over a weaker trail, and the player can feel the difference when possessing one (route learning and trail use in this species are documented in [S5](https://pubmed.ncbi.nlm.nih.gov/22972897/)).
14. **Colony smell** [ALL]: strangers are rejected by body odour, and a player ant that carries nest scent is let in at the door.
15. **Stroking the herd** [LN, CP]: workers antennate aphids and collect droplets of honeydew, and drive off ladybirds.
16. **Guarded caterpillar** [LN]: a rare event where a butterfly larva is guarded and "milked" for a sugary secretion, then emerges as an adult in June.
17. **Quarantine** [LN, ALL]: the nest has compartments with few connections; infected ants forage more, travel farther and avoid nestmates indoors.
18. **A quiet takeover** [LN]: a temporary social-parasite queen of a related species slips into a nest, a rare dramatic event.
19. **Queens fighting it out** [LN]: co-founding queens share a nest and fight until one remains once the first workers appear.
20. **Honeydew relay** [CP]: small workers collect honeydew and pass it to larger workers who carry it home.
21. **The nest that crackles** [CP]: a large colony in wood makes audible cracking sounds, a sound-only delight for the observer camera.
22. **Sandpaper galleries** [CP]: galleries run along the grain with a rough, frass-lined finish, so wood nests look and sound different from soil nests.
23. **Night shift** [CP]: workers forage mostly at night, up to roughly 90 m, so dusk visibly changes the colony's mood.
24. **Leg amputation** [CP]: *Camponotus* workers amputate injured legs of nestmates to prevent infection (reported for the genus; assumed for this species; **[u]** for *C. pennsylvanicus* specifically).
25. **The worn road** [MB]: permanent trunk trails up to about 30 m long persist when not in use, so the ground itself shows the colony's history.
26. **Relay line** [MB]: along a seed chain, smaller and medium workers sit toward the front and larger workers toward the end carrying heavier loads.
27. **Picky about seeds** [MB]: seeds under about 0.4 mg are rarely taken and scouts recruit groups of five to thirty to rich finds, so the seed choice looks purposeful.
28. **Granary and chaff** [MB]: stored seeds sit in dry chambers while husks go to a pile outside **[u]**.
29. **Green parasols** [AT]: leaf fragments sway along a cleared trail, with the largest ants clearing debris.
30. **Hitchhiker guards** [AT]: a tiny minim rides on a carried leaf to ward off parasitic flies.
31. **Weeding the garden** [AT]: workers pick out infected fungus and stop collecting leaves that harm it.
32. **The refuse heap** [AT]: waste workers sort and turn the heap, and some leafcutters place dead ants around its edge.
33. **Carrying the garden** [AT]: a founding queen carries a pellet of fungus from her mother's nest to start a new one, and only about 2.5% of young queens found a long-lived colony.
34. **Nest door at dusk** [ALL]: workers plug the entrance with soil or pebbles when rain or cold approaches **[u]**.
35. **The undertakers** [ALL]: hygiene workers carry the dead out to a midden, triggered by a chemical cue from dead nestmates (oleic acid in one leafcutter species).
36. **A human event with ant-scale consequences** [ALL, AT]: a leafcutter colony can defoliate a citrus tree in under 24 hours, which should provoke a garden-side response.

---

## 6. Source list

- [Wikipedia: SimAnt](https://en.wikipedia.org/wiki/SimAnt)
- [Wikipedia: Empires of the Undergrowth](https://en.wikipedia.org/wiki/Empires_of_the_Undergrowth), [Steam page](https://store.steampowered.com/app/463530/Empires_of_the_Undergrowth/)
- [Steam community reviews: positive](https://steamcommunity.com/app/463530/reviews/?browsefilter=toprated&filterLanguage=english) and [negative](https://steamcommunity.com/app/463530/negativereviews/?browsefilter=toprated&filterLanguage=english)
- [Ant Keeping Simulator: Steam page](https://store.steampowered.com/app/2827520/Ant_Keeping_Simulator/) and [negative reviews](https://steamcommunity.com/app/2827520/negativereviews/?browsefilter=toprated&filterLanguage=english)
- [Antopolis](https://store.steampowered.com/app/4910350/Antopolis_The_Ant_Colony_Simulator/) and [Ant Colony: Wild Forest](https://store.steampowered.com/app/1238190/Ant_Colony_Wild_Forest/) Steam pages (not yet released as of this date)
- [Wikipedia: Grounded](https://en.wikipedia.org/wiki/Grounded_(video_game)) and [Grounded negative reviews](https://steamcommunity.com/app/962130/negativereviews/?browsefilter=toprated&filterLanguage=english)
- [Wikipedia: RimWorld](https://en.wikipedia.org/wiki/RimWorld), [Dwarf Fortress](https://en.wikipedia.org/wiki/Dwarf_Fortress), [Oxygen Not Included](https://en.wikipedia.org/wiki/Oxygen_Not_Included)
- [Wikipedia: Virtual camera system](https://en.wikipedia.org/wiki/Virtual_camera_system), [Super Mario Galaxy](https://en.wikipedia.org/wiki/Super_Mario_Galaxy), [Head-up display (video games)](https://en.wikipedia.org/wiki/Head-up_display_(video_games))
- [Game Accessibility Guidelines, full list](https://gameaccessibilityguidelines.com/full-list/)
- Species and ant biology: the Wikipedia pages linked in section 5, and the brief's [S4](https://pmc.ncbi.nlm.nih.gov/articles/PMC7862224/) and [S5](https://pubmed.ncbi.nlm.nih.gov/22972897/)
- Title checks: Steam store search endpoint (`store.steampowered.com/api/storesearch`) and [itch.io search](https://itch.io/search?q=foundress), queried 2026-11-12
