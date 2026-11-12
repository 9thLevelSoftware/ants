# Biology dossier: *Lasius niger* (black garden ant), FOUNDRESS reference species

Purpose: concrete, honest numbers for game design and simulation parameters. Every non-obvious number carries a source tag `[S#]` (list at the end). Tags used inside tables:

- `[S#]` = measured/reported in a source I actually read.
- `[2ND]` = reported only in a secondary or hobbyist source (flagged weak).
- `[MEM]` = general background knowledge not re-verified in this session; treat as unsourced.
- `[EST]` = my estimate, with reasoning. `not found` = searched, no number located.

Research limits: web search budget ran out before the last two checks (see Caveats). Most primary pay-walled papers (Springer/Wiley) could only be read via abstracts or secondary summaries.

**Fact-check status (adversarial pass, 2026-11-12):** the 25 most gameplay-relevant claims were re-checked against the sources; verdicts and URLs are in the "Verification log" at the end. Values changed by that pass are marked `[CORRECTED]` in place; claims that could not be confirmed are marked `[UNVERIFIED]` or `[EST]`. Additional tag: `[V]` = number re-read in the cited source during the fact-check.

---

## 0. Time model used throughout (read first)

The seed fixes 1 game day = 600 s at 1x and a 28-day year, so the calendar is compressed 365/28 = **13.04 real days per game day** (1 season = 7 game days ~ 91 real days). Ant kinematics (walking, trophallaxis, trail evaporation) run at 1x real seconds, otherwise the third-person view would be unplayable. Therefore the game has **two clocks**:

| Clock | Governs | Compression |
|---|---|---|
| Fast clock ("game seconds / minutes" = real seconds at 1x) | walking, digging strokes, trophallaxis, trail decay, fights | none (x1) |
| Slow clock (game days) | development, lifespans, egg laying, consumption per day, seasons | x13.04 |

Consequence: a forager can make only ~3-6 round trips per game day (600 s), about the same number as in reality (`[EST]`), so **resource quantity per trip must be multiplied by 13.04** to keep colony throughput per game day = 13 x real throughput per day. This is the "load multiplier" used in section 12.

Season mapping (year starts at spring equinox, 1 game day ~ 13 real days): Spring = days 1-7 (late Mar-mid Jun), Summer = 8-14 (mid Jun-mid Sep), Autumn = 15-21, Winter = 22-28.

---

## 1. Identity and morphology

| Item | Value | Source |
|---|---|---|
| Taxonomy | Formicinae, Lasiini; monomorphic, no soldier caste | [S1][S2] |
| Worker length | 3.4-5.0 mm (Collingwood: 3.5-5.0) | [S3][S4] |
| Queen (gyne) length | 8.0-9.0 mm (Collingwood); Wikipedia 6-9 mm | [S4][S2] |
| Male length | 3.5-4.7 mm (NatureSpot) [V] / 3.5-5.0 (Collingwood); Wikipedia contradicts itself (3.5-4.5 mm in one place, 5-7 mm in another) [V] | [S3][S4][S2] |
| Worker head width, lab, early-stage colonies (~8 mo old) | 1.08 +/- 0.07 mm; 20-month colonies 1.15 +/- 0.06 mm | [S5] |
| Worker fresh mass | ~1.04 mg (20 pooled workers = 20.84 +/- 1.54 mg, measured at week 64, control group; the article gives the text values without units, mg inferred) [V] | [S6] |
| Queen fresh mass, fed lab queens 64 weeks after founding | 33.1 +/- 6.0 mg (N = 8, control group) [V]; the "abdomen alone 24.8 +/- 4.5 mg" figure was not re-found in the text retrieved [UNVERIFIED] | [S6] |
| Newly mated queen mass | not found; [EST] 15-25 mg, loses mass during claustral phase | -- |
| Colour | worker dark brown to blackish, "greyish brown to dark brownish black"; wings of alates hyaline; queen brownish black, massive thorax relative to head | [S4] |
| Key anatomy | single petiole node; acidopore (poison gland opens as a nozzle at gaster tip, formic acid); no sting; dense erect hairs on scapes/tibiae | [S4][MEM] |
| Size variation | very low: head-width CV ~6%; no morphological sub-castes. Small workers forage disproportionately in hot afternoons (reported for the species; temperature values not retrieved) | [S5][2ND] |

Game scale: BU = 4 mm = standard worker (within 3.4-5 mm). Proposed relative scales: nanitic 0.85, standard worker 1.0 (range 0.9-1.15), male 0.95 with wings and slimmer build, queen/gyne ~2.0 length (8-9 mm / 4 mm = 2.0-2.25) and ~30x worker mass for a fed established queen (33.1 / 1.04 = 32x [CORRECTED from "25-30x"]; a newly mated queen is lighter, [EST] 15-24x).

---

## 2. Life cycle

| Stage | Reported durations | Source |
|---|---|---|
| Founding lab colonies, stage durations, control group, medians [Q1;Q3]: preoviposition 1 [1;2] d; egg 18 [18;19] d; larval 8 [8;9] d; pupal 25 [24;26] d; total "ontogenesis" 52 [51;52] d. The article does not define the start/end points of each stage (so do not assume they are first-appearance intervals) [CORRECTED] | rearing at room temperature **19-23 C** (mean ~21 C) [CORRECTED from "~23 C"]; no significant differences between neonicotinoid treatments (0 / 4.5 / 30 ug/L) [V] | [S6] |
| Same, 20 C | larvae ~day 26, pupae ~day 34, first workers ~day 70 (attributed to A. Buschinger, forum quote) | [2ND] |
| Hobbyist caresheet, 25 C | egg->larva 9-16 d, larva->pupa 9-13 d, pupa->worker 9-12 d; total 4-6 weeks (up to 10) | [2ND] |
| Founders, 21 C, claustral tubes | first eggs soon after tube set-up; first pupa and first worker earlier in 2-queen tubes (P = 0.01 / 0.011); 53-day observation window; day values only in Figure 2 (not retrieved) [V] | [S7] |
| Encyclopaedic | "eggs will develop to imagines in 8-10 weeks" (56-70 d, temperature unstated) [V]; consistent with the 52-70 d range above | [S2] |
| Pupae | in silk cocoons (formicine character); callow workers emerge pale and harden over 3-4 days | [S5][MEM] |
| Larval instars | not found for *L. niger*; ants generally 3-4 instars [MEM] | -- |

Notes on the S6 stage figures [CORRECTED]: the previous version of this dossier called them "first-appearance intervals" of the fastest individual; the article only says it "derived life-stage durations" and does not define the endpoints, so that interpretation is unsupported. What is safe to say: first eggs to first workers in a lab founding colony at 19-23 C took ~52 d (median, IQR 51-52, about 10 founding queens per treatment group at the start, which gives a very tight spread), and the larval stage (8 d) looks short compared with the hobbyist range, so the stage split (not the total) is the uncertain part. The temperature dependence is not available per stage for *L. niger*. Kipyatkov et al. (2004) measured the effect of temperature on first-brood rearing by *L. niger* founders (northern vs southern populations differ; northern larvae enter diapause more readily at low temperature) but the numeric table was not retrievable [S8].

Degree-day model (my estimate, [CORRECTED] because S6 was run at 19-23 C, mean ~21 C, not ~23 C): lower developmental threshold ~10 C (assumed, not measured). Anchor: 52 d at ~21 C [S6] -> (21-10) x 52 = ~575 degree-days from first egg to first worker. Cross-checks: the hobbyist 20 C figure (~70 d, = 700 DD) is 20% slower, and the hobbyist 25 C figure (4-6 weeks = 28-42 d) brackets the model's 38 d. Predicts 30 C ~29 d, 25 C ~38 d, 23 C ~44 d, 21 C ~52 d, 20 C ~58 d, 15 C ~115 d, <=10 C no development (uncertainty roughly +/-20%). [EST]

| Item | Value | Source |
|---|---|---|
| Worker lifespan, lab (22 C, no hibernation, no queen, no foraging; callow workers from source colonies ~8 months old = "early stage" ES, or 20 months old = "intermediate stage" IS) | mean 434.35 d (95% CI +/- 43.58, i.e. a confidence interval, not an SD) for ES workers; 309.23 d (95% CI +/- 36.24) for IS workers; maximum 1129 d (ES) / 1094 d (IS). Workers from larger colonies live shorter lives (Cox p < 0.001) [V] [CORRECTED: "+/-" is a 95% CI; colony-size dependence added] | [S5] |
| Worker lifespan, literature | 1-2 years average (Kutter and Stumper 1969) | [S5] |
| Worker lifespan, field | not found; forager hazard much higher (risk rises with outdoor tasks) | [S5] |
| Queen lifespan | maximum 28 years (lab; Kutter and Stumper 1969, as quoted by S5) [V]; "up to 29 years" in Wikipedia, which also says "typically almost 15 years" [citation needed] [V] | [S5][S2] |
| Overwintering brood | queens stop laying and all brood is converted to larvae before/during hibernation; colony-level diapause is partly endogenous (a dormancy timer) | [S5][S9][S10] |
| Hibernation temperature | lab 6 C in a fridge from week 15 to week 32 (~17 weeks, article wording ambiguous) with 2 weeks at 14 C either side [V]; at +2 C vs +7-8 C, worker survival fell while founding queens' survival was unaffected [V, abstract]; keepers use 5-10 C for 2-5 months [2ND] | [S6][S11][2ND] |

---

## 3. Colony founding (claustral)

| Item | Value | Source |
|---|---|---|
| Mode | independent, claustral: queen digs in, seals the chamber, does not forage, rears first brood from body reserves (flight-muscle histolysis and fat) | [S12][S7][S2] |
| Where queens dig | small burrows in open soil or under stones [V]; the "must find shelter within ~24 h or die" statement is only the authors' assumption justifying their 24 h lab arena ("queens that do not find a shelter within such a timeframe would most likely not survive") [V], not a measured survival time [CORRECTED: downgraded to assumption] | [S12] |
| First clutch size | brood items (eggs + larvae; at day 17 mostly eggs: 152 of 231 queens had only eggs) recorded 17 d after the nuptial flight as a fecundity proxy. **The 65.5 +/- 7.8 and 30.5 +/- 11.6 figures are the top 25% and bottom 25% of the distribution (queens selected for pairing), not the typical range**; the population mean/median was not retrieved, so the game's 40 +/- 12 is a design choice [V] [CORRECTED]. Thorax length 3.2 +/- 0.4 mm (small queens 2.8 +/- 0.3) | [S7] |
| Larvae/workers reached | median week 13: 18 workers (control, IQR 12-18; low-dose 16.5, high-dose 16) [V]; ~35-40 larvae and the "~40% of clutch survives to adult" were not re-found in the retrieved text [UNVERIFIED] | [S6] |
| Time to first workers (nanitics) | ~52 d (lab, 19-23 C, mean ~21 C) [S6] [V]; ~70 d at 20 C [2ND]; field timing "Aug-Sept in temperate climates" is [UNVERIFIED] (no source retrieved; in nature first brood commonly overwinters, so first workers may emerge only next spring) | |
| Nanitic size | head width 1.08 mm vs 1.15 mm at 20 months (~6% narrower); strictly "minims" smaller than later workers; nanitics are more efficient at brood care [S5]; true nanitic body length not found, [EST] ~3-3.5 mm | [S5] |
| Queen mortality | lab: 3 single-queen tubes lost their queen at days 4, 11 and 16 (denominator not retrieved; the earlier "3 of 15" is [UNVERIFIED]) [V][S7]; overall lab queen mortality 20% over 64 weeks (~10 queens per group at start) [V][S6]; the earlier "1.5% died of Metarhizium within 1 week in one Austrian field study" is **[UNSUPPORTED]**: S12 contains neither "Metarhizium" nor that figure, and no other source was found; S12 only says founding failure is "as high as 99% in some species" [V]; numeric field survival for *L. niger* not found, [EST] order 1% of dealates | [S7][S6][S12] |
| Pleometrosis | 18-25% of incipient colonies have 2-5 unrelated queens in nature [V]; queens do actively group; co-founded colonies produce first pupae and workers earlier (P = 0.01 / 0.011) and more workers [V]; "per-queen output not higher" [UNVERIFIED]; after first workers emerge the queens fight (or workers cull) until one survives; winner is determined by fecundity (egg output), not size [S7 title/abstract] | [S12][S7] |
| Brood raiding between incipient colonies | not documented for *L. niger* in anything I read; documented in fire ants and *Messor* (cited in S12 refs). Offered as a game mechanic only, flagged as analogy | [S12] |
| Pre-flight loss | predators catch many queens during flight and nest search | [S12] |

---

## 4. Colony growth

| Colony age | Workers (real) | Source |
|---|---|---|
| ~3 months (before 1st hibernation) | 18 (median; IQR 12-18) | [S6] |
| ~8 months (after 1st hibernation) | 18 +/- 8 (mean, spread type not stated) [V] | [S5] |
| ~20 months (after 2nd hibernation) | 250 +/- 79 (range 122-392) [V]; Schlappi (week 64): 290.5 (IQR 230.75-306.75) [V]; "105 larvae" not re-found [UNVERIFIED] | [S5][S6] |
| Year 3 | not found; [EST] 800-2,000 (growth slows as the lab ratio ~14x/yr cannot continue) | -- |
| Year 4-5 | not found; [EST] 2,500-5,000 | -- |
| Mature (5+ y) | typical 4,000-7,000 and "rare cases" up to 40,000 (Wikipedia) [V]; "from several hundred up to 10,000" (BWARS) [V]; lab colonies of 2,000-3,000 workers (Khuong) or 2,400-4,700 (Gruter) used in experiments [V]; "thousands to tens of thousands" (Khuong intro) [V]. The "5+ y" age attached to these sizes is [EST] | [S2][S1][S13][S14] |

| Item | Value | Source |
|---|---|---|
| Foraging switch | collective (trail) foraging and regular-size workers appear at a "threshold colony size of 75 individuals" (Mailleux et al. 2003, as quoted by Kramer et al. 2016) [V, secondary]. **Citation fixed [CORRECTED]**: the primary paper is Mailleux, Deneubourg and Detrain 2003, "How does colony growth influence communication in ants?", Insectes Sociaux 50:24-31 (doi 10.1007/s000400300004), not the Proc R Soc B paper at PMC1691411 that [S31] pointed to; the primary abstract was not retrievable | [S5][S31] |
| Alate production | colonies "a few years old" at ~4,000 workers; 97% of UK alate sightings in July-August | [2ND][S15] |
| Queen number | monogynous (one queen); lab/field polygyne supercolonies are a separate invasive-style phenomenon in *L. neglectus*, rare in *L. niger* | [S1][2ND] |
| Egg output of mature queen | not found; derived [EST]: ~6,000 workers with ~1.2-yr mean life and ~40% brood loss need ~20 eggs/day averaged over the year, ~40-60/day during the ~5-month laying season; peak 100+/day unlikely to be exceeded | -- |

---

## 5. Nest architecture

| Item | Value | Source |
|---|---|---|
| Sites | under stones, paving slabs, wood, plastic, metal that the sun warms; where none exist, large soft mound nests in soil/turf | [S1] |
| Mound nests (field meadow near Marquefave, France; X-ray CT of two nests) | mound A 27 cm high x 26 cm diameter, mound B 21 cm high x 27 cm diameter [V]; nest volume 5,390 and 7,099 cm3 [V]; chambers+galleries ~30% of volume (1,730 and 2,134 cm3) [V]; gallery height peak 5.9 mm (A) / 5.5 mm (B) [V]; width distribution centred on ~12 mm [V]. The colony populations of these field nests were not stated | [S16] |
| Lab colonies in that study | about 2,000-3,000 workers with brood but no queen (experiments used groups of 500); built in sand:clay 1:1 (10 g dry weight thin layer) [V] | [S16] |
| Depth | no *L. niger* value found. Congener *L. neoniger*: galleries and chambers concentrated in top 0.3 m; some vertical shafts to ~0.7 m; chambers 10-20 mm across and 30-50 mm long; nest volume 20-250 cm3. Used as an analog | [S17] |
| Heat | workers at high temperature excavate deeper; warmer surface changes chamber placement and some upper chambers are refilled | [S18][2ND] |
| Spacing | in one meadow, nests >= 3 m apart, mound diameter 40-60 cm (summary; source page not verified) | [2ND] |
| Founding chamber | single small cell, ~10 cm tube in lab; field depth not found, [EST] 2-5 cm below a stone or ~3-6 cm in open soil | -- |
| Soil | no preference data found for *L. niger*; lab uses sand-clay 1:1; [EST] well-drained loam/sand, avoids waterlogging | [S16] |
| Satellite structures | soil/carton "tents" (pavilions) over aphid colonies on stems and roots are widely reported but I have no source in hand | [MEM] |
| Excavated soil | carried as pellets and piled at the entrance, forming crater/mound; pillar spacing when building ~10 mm | [S16][S18] |
| Brood translocation | no *L. niger* measurement found. Leaf-cutter evidence (brood moved first, preferred range 21-25 C) is an analogy only; keeper observations say brood is shifted along heat/humidity gradients, into sun-warmed spots by day | [S19][2ND] |

Game values (BU = 4 mm): tunnel width 2-3 BU (8-12 mm), chamber 4-12 BU wide x 1.5-2.5 BU tall (flat), shaft depth typical 25-75 BU (10-30 cm), maximum 175 BU, founding cell 2-3 BU wide at 8-15 BU depth. Real mound nest 5.4-7.1 L (5,390 and 7,099 cm3 = 84,000-111,000 BU^3) is a mound only **~65-68 BU across and ~52-68 BU high** (26-27 cm / 4 mm = 65-68 BU; 21-27 cm = 52-68 BU) [CORRECTED: the earlier "400-500 BU across" was wrong by ~7x; 400-500 BU would be a 1.6-2 m mound]; scale the nest volume with colony size per section 12.

---

## 6. Diet and nutrition

| Item | Value | Source |
|---|---|---|
| Staples | aphid honeydew, nectar (incl. extrafloral nectaries), fruit, small insects, scavenged carrion; occasionally predation on larvae (e.g. codling moth) | [S1][S2] |
| Honeydew share | not found as a percentage; honeydew is a carbohydrate-rich but incomplete diet and workers still need prey (Offenberg 2001). Game default [EST]: 70-90% of carbohydrate energy from honeydew when aphids are available | [S20] |
| Sugar preference | prefers aphid-type sugars (melezitose, trisaccharides) over sucrose and higher concentrations; honeydew matches attendance rates of four aphid species on tansy | [S21][S22] |
| Aphids tended | black bean aphid *Aphis fabae* (ants remove ladybirds; bean yield 56 / 17 / 8 seeds per plant with no aphids / aphids without ants / aphids with ants); willow aphid *Pterocomma salicis* (ants carry nymphs between plants); root aphids (e.g. *Anoecia*); ant-tended lycaenid larvae (*Plebejus argus*) | [S2][S23][S24] |
| Husbandry | antennal stroking to solicit droplets; patrols repel predators; footprints contain chemicals that slow tended aphids ~30%; workers occasionally move aphids | [S25][S23] |
| Honeydew droplet size | 0.7 uL was the droplet size the experimenters offered, "chosen to be comparable to the honeydew an aphid produces"; it is **not** a reported maximum of honeydew droplets [CORRECTED]. 0.6 M sucrose was used as "close to the total sugar concentration in aphid-emitted droplets" (no separate measured honeydew concentration) [V] | [S26] |
| Worker intake per feeding | 0.47 +/- 0.25 uL at the first droplet (~51 +/- 12 s drinking), 0.28 +/- 0.20 uL at the second (23 +/- 11 s), 0.75 +/- 0.30 uL total (n = 63) [V]; the model's critical volume Vc = 1 uL is the volume at which 50% of foragers stop feeding [V]; trail laying: 38% of ants after the first droplet and 84% of the 63 foragers across both sources (model: 79%) [V] [CORRECTED: the earlier "~90% of ants reaching the threshold lay a trail" is [UNVERIFIED]; the "~0.006 uL/s + 0.15 uL" drinking-rate fit is also [UNVERIFIED]]; crop capacity itself not found (the abstract says the threshold is not set by maximal crop capacity) | [S26] |
| Trophallaxis | liquid exchange between crop and mouth; queen is fed by workers; toxins/nutrients spread through colony | [S6][S26] |
| Carbohydrate vs protein | carbohydrates fuel adult activity and longevity; protein is needed for queen egg laying and larval growth; excess protein harms workers | [S27][S28] |
| Brood effect on collective intake | Dussutour and Simpson 2009: foragers act as "collective mouth and gut", extract carbohydrate and eject protein; collected amount, balance and regulation precision depend on larvae; excess protein shortened lifespan, an effect greatly reduced when larvae were present [V, abstract]. **[CORRECTED] This study was done on the green-headed ant *Rhytidoponera metallica*, NOT *L. niger*** (species confirmed through a secondary review, PMC4342766; the abstract does not name it). It is therefore only an analogy for *L. niger*; all mechanisms and magnitudes built on it are [EST]. For *L. niger*: brood presence mobilised foraging and increased protein collection [2ND, unverified]; individual scouts did not change their drinking decision at a protein droplet when brood was present, though brood changed how many laid trails [unverified, S30] | [S29][S30] |
| Human food | sugar, honey, jam, fruit, fatty/protein crumbs are taken readily; bait studies show *L. niger* takes sucrose and amino-acid baits in the field | [S27][MEM] |

Quantitative needs (not found for *L. niger*; all [EST]): resting adult worker ~0.03 mg sucrose/day, active average ~0.06-0.1 mg/day (1 mg ant, 1-3 uL O2/h); larva needs ~0.5-0.8 mg protein over its whole development (pupal dry mass ~0.5 mg, ~50% protein, ~40% conversion); queen ~10x worker energy plus egg protein.

---

## 7. Foraging

| Item | Value | Source |
|---|---|---|
| Walking speed | mean 23.5 mm/s (ants coming from the short path) and 26 mm/s (long path) in Y-maze/runway trail experiments (= 5.9-6.5 BU/s) [V]; pheromone did not raise speed in that study [V]; the temperature is not stated in the retrieved text (the "room temperature" label is an assumption) [UNVERIFIED]; "an earlier study found 25-29% faster only when route memory AND pheromone coincide" was taken from a search summary and is [UNVERIFIED] | [S32][S33] |
| Speed vs temperature | no *L. niger* curve found; general ant physiology [MEM] ~Q10 2 below ~25 C. Foraging increases with moderate warming (+3 C) and the mutualism benefits fall again at 26 C in lab | [S34] |
| Foraging range | not found; nests >= 3 m apart in a meadow [2ND]; [EST] trails commonly 1-10 m, scouts further | -- |
| Trail pheromone | formicine; compounds exit via acidopore; a 3,4-dihydro-8-hydroxy-3,5,7-trimethylisocoumarin has been reported for *L. niger* (secondary citation of Bestmann et al. 1992); sourced from hindgut contents; trace amounts (<150 pg per ant) | [S35] |
| Trail lifetime | mean ~47 min (Beckers et al. 1993, as cited in the Springer record; weak 1 M sugar trails) **[UNVERIFIED: the Springer page was paywalled/blocked during the fact-check and no second source gave the figure]**; trails reinforced by many passes decayed to control level in ~20-24 h (attributed to Evison et al. 2008) **[UNVERIFIED]**; model assumption ~45 min to threshold [EST] | [S36][2ND][S37] |
| Trail-laying modulation | foragers on 1 M sugar lay 43% more marks than on 0.05-0.1 M [UNVERIFIED, S36 not readable]; 84% of the 63 foragers laid a trail over two 0.6 M droplets [V, S26]; the "~90% of ants reaching the volume threshold" is [UNVERIFIED] | [S36][S26] |
| Pheromone ignorers | ~20% of foragers ignore pheromone (lapse rate in Y-maze lab tests; "high at around 20%") [V]; no stable "scout caste" of specialist ignorers: ignoring is not repeatable within individuals [V] | [S38] |
| Route memory | accurate memories after a few visits; trail pheromone + private memory are combined; ants can learn to ignore but not to avoid trails | [S39][S40] |
| U-turns | trail-following ants U-turn at lower rates on the correct heading; wrong-way ants U-turn more (Beckers et al. 1992) | [MEM] |
| Crowding | one feeding hole accommodates max 8 foragers (a property of the lab feeder design, used as a model parameter, not a species constant) [V]; crowding causes negative feedback that allows colonies to switch to a better source without needing pheromone decay | [S37] |
| Home range marking | non-volatile cuticular hydrocarbons deposited passively by tarsi; gradient outward from nest entrance; outbound foragers lay less pheromone than inbound on hydrocarbon-marked trails | [S39][S41] |
| Activity limits | alates fly only above 13 C; foraging threshold not found; [EST] foragers active ~8-38 C on surface, peak 18-30 C, nocturnal activity in summer [MEM] | [S15] |

---

## 8. Division of labour

| Item | Value | Source |
|---|---|---|
| Age polyethism | youngest workers nurse and tend the queen; oldest forage, handle waste; no morphological castes | [S42][S5] |
| Network structure | baseline interaction networks separate foragers (disease sources) from young nurses and the queen; infected foragers spend more time outside | [S43] |
| Task switching | flexible; physiology differs between nest workers and foragers, partly independent of age | [S42] |
| Forager risk | outdoor tasks raise mortality (general result cited in S5) | [S5] |
| Queen after founding | stays inside, specialises in egg laying once workers are present; before workers she performs brood care; fed by workers; she is the interaction-network centre | [S44][S43][S6] |

---

## 9. Communication and defence

| Item | Value | Source |
|---|---|---|
| Alarm | not characterised for *L. niger*. Formicine pattern: poison gland formic acid (repels nestmates away) plus Dufour gland undecane (attracts), mandibular terpenes; *L. claviger* discharges mandibular+Dufour; *L. alienus* panic-run | [S45][MEM] |
| Defence | bite, hold, curl the gaster forward and spray formic acid (acidopore); no sting | [S4][MEM] |
| Non-nestmates | recognition by colony-specific cuticular hydrocarbon profile; aggression scale does not depend on relatedness or distance; neighbours are not special; local recruitment around fights | [S46][S41] |
| Territoriality | hydrocarbon home-range marking; interspecific displacement by *Tetramorium* and large colonies reported | [S41][2ND] |
| Social immunity | fungal infection controlled by social behaviour (grooming, relocation); systemic immunity against bacteria | [S43][2ND] |

---

## 10. Seasonal cycle (temperate NW Europe)

| Period | Event | Source |
|---|---|---|
| Hibernation (about Nov-Mar) | colony dormancy; queen stops laying; all brood overwinters as larvae; workers cluster deep | [S5][S10] |
| Spring (resumption) | colony resumes development as temperature rises; queen restarts oviposition; Kipyatkov: temperature, not photoperiod, drives laying; stops at <= ~20 C for Russian *L. niger* (from L. japonicus paper citing Kipyatkov, weak) | [S9][2ND] |
| Alate rearing | sexual brood timing is not documented for *L. niger* in my sources; [EST] eggs laid early spring, larvae fed richly, pupae by June-July | -- |
| Nuptial flight | June-September, 97% of UK sightings in July-August (July 64.6%, August 32.6%, June 2.1%) [V]; annual peak days 24 Jul 2012, 1 Aug 2013, 17 Jul 2014 [V]; winged ants (88.5% of them *L. niger*, citizen-science sightings) only observed at >13 C and wind < 6.3 m/s (14 mph; the paper's "6.3 m-1" is a typo) [V]; all days with mean >25 C had observations [V]; changes in temperature and wind from the previous day also significant [V]; recent rain can make initial nest digging easier [V]; Boomsma and Leusink (1981): no flights above ~1.7 m/s wind at 2 m height until part-way through the season, then at higher winds [V, via S15] [CORRECTED: the earlier "before 20 August" date was not in S15]; urban, heat-retaining nests fly earlier [V]; "warm summer afternoons" [S1]; BWARS: "early July to mid August" [V] | [S15][S47][S1] |
| Autumn | brood shrinks, larvae diapause | [S9] |

---

## 11. Enemies, associates, hygiene

| Class | Items | Source |
|---|---|---|
| Social parasites | *L. umbratus* (temporary parasite of *L. niger*; young queen is adopted, host brood raises hers); *L. fuliginosus* is in turn a hyperparasite of *L. umbratus* (and can be adopted experimentally by *L. niger*); *L. mixtus*, *L. sabularum* host records unconfirmed | [S48][S49] |
| Pathogens | *Metarhizium* (the earlier "field queen deaths, 1.5% in a week" is [UNSUPPORTED]; S12 does not contain it), *Laboulbenia formicarum*, bee viruses; *L. niger* shows strong social immunity | [S12][S50][2ND] |
| Predators | during nuptial flight and nest search: birds, spiders, other ants, beetles [MEM]; no specific data retrieved | [S12] |
| Competitors | *Tetramorium caespitum*, other *Lasius*, *Myrmica*; *L. neglectus* supercolonies | [2ND] |
| Associates | ant-tended lycaenid *Plebejus argus* larvae; aphids; root-aphid eggs are guarded in winter by the congener *L. flavus* | [S2][S51] |
| Necrophoresis / middens | corpses removed to a refuse pile near the nest or scattered away; oleic and linoleic acids as post-mortem cues established for *Myrmica rubra* (analog); queens of *L. niger* remove dead co-founders | [S52][2ND] |

---

## 12. GAME TRANSLATION (proposed parameter table)

Notation: `w` = represented real workers per sim worker. Dev compression = 13.04.

### 12.1 Scale-down of colony size

Reality: 4,000-7,000 (up to 10,000+). Target: up to ~1,500 sim agents at maturity.

Arithmetic check [V by recomputation]: all N_sim and w values in the table below follow from the formula (e.g. N_real 1,500 -> 611; 3,500 -> 961; 5,500 -> 1,173; 7,000 -> 1,275; 10,000 -> 1,393). Inverse: N_sim 600 <-> N_real ~1,450; N_sim 700 <-> N_real ~1,920; N_sim 1,000 <-> ~3,800. A quick difference-equation check using the parameters of 12.2 (start 18 workers after first winter; q(N); season factor s; 4 gd egg-to-worker delay; 45% brood survival below 60 workers, 70% above; worker mean life 33 gd) gives ~290 workers one game year later (matches the lab 250 +/- 79 and 290 at 20 months), ~630 sim agents (~1,600 real) at +2 years, and a seasonal sawtooth plateau of ~900-1,100 sim agents (~3,000-4,500 real) from +3 years. With mean life 24 gd the plateau drops to ~650-800. To reach the 1,275-1,393 range of a 7,000-10,000 real colony, raise q or brood survival; do not shorten development.

`N_sim = N_real` up to 300 (individual 1:1, matching the lab data 250-290 at 20 months). Above 300:
`N_sim = 300 + 1200 * (1 - exp(-(N_real - 300)/4000))`, hard cap 1,500.

| N_real | N_sim | w | Rough age |
|---|---|---|---|
| 18 | 18 | 1 | founding year |
| 270 | 270 | 1 | ~20 months (game year 2) |
| 1,500 | 611 | 2.5 | year 3 |
| 3,500 | 961 | 3.6 | year 4 |
| 5,500 | 1,172 | 4.7 | year 5 |
| 7,000 | 1,275 | 5.5 | year 6 |
| 10,000 | 1,393 | 7.2 | cap region |

Rationale: the early game, where the player builds personal relationships with individuals, stays exactly biological. Above 300 individual identity stops mattering visually; resources per sim ant are multiplied by `w`, and food, brood and digging yields are computed with `w`. Pheromone/CHC maps are unchanged. Growth timeline target: 4-5 game years (1 game year = 28 x 10 min = 4.67 h, so ~19-23 h at 1x, ~2.3-2.9 h at 8x [CORRECTED from "~3 h"]); if too slow, scale egg-laying, never development times.

### 12.2 Parameter table

| Parameter | Real | Game value | Rationale |
|---|---|---|---|
| Egg duration at 21 C | 18 d (S6, 19-23 C) | **1.4 gd** at 21 C [CORRECTED: the old row said "1.3 gd (13 d)", but 13 d = 1.0 gd and 1.3 gd = 17 d; the 23 C label was also wrong]; degree-day scaling: x(21-10)/(T-10) | [S6] |
| Larva | 8 d (S6; the earlier "14-20 d" has no source and the hobbyist 9-13 d is at 25 C) | **0.6 gd** at 21 C [CORRECTED from 1.1 gd to the S6 median; flagged: S6 does not define stage endpoints, so the larval/pupal split is uncertain, the total is not] | [S6] |
| Pupa (cocoon) | 25 d (S6) | **1.9 gd** at 21 C [CORRECTED from 1.5 gd (= 19.6 d), which matched neither the S6 25 d nor the stated "18-25 d" upper end] | [S6] |
| Preoviposition | 1 d (S6) | 0.08 gd | [S6] |
| Egg to worker | 52 d at ~21 C (S6) | **4.0 gd** at 21 C (= 1 + 18 + 8 + 25 = 52 d, 1.4 + 0.6 + 1.9 + 0.08 = 3.98 gd); 23 C 3.4 gd; 25 C 2.9 gd; 30 C 2.2 gd; 20 C 4.4 gd; 15 C 8.8 gd; <=10 C paused [CORRECTED: previously 3.9 / 3.3 / 2.5 / 5.0 / 10 gd, calibrated on a wrong 23 C anchor and K = 650 DD; now K = 575 DD] | [EST] degree-days, anchor [S6] |
| Larvae diapause | winter | any stage <= 10 C pauses; larvae overwinter | [S5][S6] |
| First workers | 52-70 d | ~4.0-5.4 gd after laying (52 d = 4.0 gd; 70 d = 5.4 gd) (founding in the flight window gd ~10-12 -> workers gd ~15-17, i.e. autumn, when falling temperature slows development: the degree-day rule may push first workers past winter) | [S6][2ND] |
| Founding clutch | brood items at day 17: top quartile 65.5, bottom quartile 30.5 (population mean not retrieved); 18 workers median at week 13 | 40 +/- 12 eggs over 1.3 gd (17 d = 1.30 gd, ok); ~45% reach adult (~18 workers); the 40 +/- 12 is a design value, not a measured mean [EST] | [S6][S7] |
| Nanitic scale | head 6% narrower | 0.85 body scale; more efficient nurses | [S5] |
| Worker lifespan | mean 434 d (workers from ~8-month colonies) or 309 d (from ~20-month colonies); max ~1100 d (lab, no foraging) | nest worker mean life depends on the colony the worker hatched in [CORRECTED: the old single value of 33 gd ignored the S5 result that larger colonies produce shorter-lived workers]: **33 gd** (434 d / 13.04) while N_real < ~100; **24 gd** (309 d / 13.04 = 23.7) once N_real >= ~250; linear in between; sd 10 gd; forager hazard x5 once foraging, typical forager tenure 2-5 gd | [S5], forager [EST] |
| Queen lifespan | up to 28 y | immortal for play; optional senescence after 10 game years | [S5] |
| Walk speed (room temp, assumed ~20-22 C) | 23.5-26 mm/s (5.9-6.5 BU/s) | 6 BU/s cruise; 10-12 BU/s sprint/alarm (player ant); loaded -15% | [S32] [V] (seed's 12 BU/s is sprint, not cruise); sprint and loaded factor are [EST] |
| Speed vs T (x cruise) | no curve | 5 C: 0; 10 C: 0.25; 15 C: 0.55; 20 C: 0.9; 22-28 C: 1.0; 30 C: 1.1; 35 C: 0.9 and seek shade; >= 40 C: 0 | [EST] Q10~2, [S15] |
| Trail pheromone half-life (22 C) | mean life ~47 min (weak, [UNVERIFIED]), up to ~day (strong, [UNVERIFIED]) | **15 sim-minutes** (900 s of simulation time = 1.5 game days on the seed's 600 s/day clock); x2^((22-T)/10); soil/sun x0.5, shade x1.5; reinforcement >> decay | shortened ~2x vs the exponential half-life implied by a 47 min mean life (47 x ln2 = 33 min; arithmetic ok) for play; round trip over 4 m: 2 x 4000 mm / 24 mm/s = 333 s (ok) |
| Pheromone ignorers | ~20% | 20% of foragers ignore trail | [S38] |
| Home-range CHC marks | non-volatile | half-life 2 gd, wash-out by rain x0.5; gradient from nest entrance | [S39][S41] |
| Route memory | a few visits | 3-4 visits to fix; fades over ~2 gd | [S39] |
| Cooperative foraging threshold | 75 workers | trail recruitment unlocks at >= 75 workers | [S5] [V via Kramer, citing Mailleux et al. 2003, Insectes Soc.] |
| Sugar need per adult | ~0.06-0.1 mg/day [EST] | 1.0 SU per gd resting-avg, forager 2.0, queen 8 (1 SU = 1 mg sucrose-eq; x13 from calendar: 0.06-0.1 x 13.04 = 0.8-1.3, ok) | scaled x13 |
| Forager crop load | 0.5-1 uL at 0.6 M (0.6 M sucrose = ~205 mg/mL -> 0.1-0.2 mg sugar; measured intake 0.47-0.75 uL [V, S26]) | **load = 2 SU per trip (x13 load multiplier)**. Trips per game day [CORRECTED]: with 24 mm/s walking and ~60 s of feeding/unloading per trip, round trip = 2 x d / 24 mm/s + 60 s, giving ~4.2 trips per 600 s at d = 1 m, ~3.2 at 1.5 m, ~2.6 at 2 m and only ~1.5 at 4 m. The old "3-5 trips per gd" only holds for sources within ~1.5 m. Game-internal balance check: 25% of 270 workers foraging (68) x ~2.5 trips x 2 SU = ~340 SU/gd vs a demand of ~270 SU/gd (1 SU per adult) plus brood: consistent | the justification "keeps throughput per gd = 13x real" relies on the unsourced [EST] assumption that a real forager makes only ~3-6 trips per day; real foragers on a 4 m trail could plausibly make dozens of trips per day, so treat the x13 multiplier as a game-balance constant to be tuned in headless runs, not as a measured ratio [UNSUPPORTED as biology] |
| Protein need per larva | ~0.5-0.8 mg over development [EST] | one-off total of ~0.65 PU per larva (PU = 1 mg protein-equivalent, not time-scaled), i.e. **~1.1 PU per gd of the 0.6 gd larval stage** [CORRECTED: the old "0.6 PU per gd" times the old 1.1 gd larval stage gave 0.66, but with the S6-based 0.6 gd stage it would give only 0.36 PU]; adults 0.1 PU per gd; excess adult protein shortens lifespan, buffered when larvae are present (**analogy only: this effect was measured in *Rhytidoponera metallica*, not *L. niger***) [S29]; magnitude [EST] -15% mean life if protein-rich diet persists without larvae | [S29] |
| Honeydew yield | droplet <=0.7 uL | aphid colony yields 0.5-2 SU per gd per 10 aphids when tended; sets honeydew nodes | [S26] |
| Starvation | days-weeks | adults die after ~6 gd without sugar (= ~78 real days at 13.04 days/gd, which is long for a worker with no sugar; no source, so treat 3-6 gd (39-78 d) as the plausible range) ; larvae are eaten or starve in 2 gd without protein (= 26 real days) | [EST] [UNSUPPORTED] |
| Egg-laying rate (peak season, well fed) | 20-60/day mature (derived, [EST]) | `q(N) = 30 + 70*(1-exp(-N_sim/300))` eggs per gd (per game day, not per real day): 34 at N=18; **50 at N=100** [CORRECTED from 66; 66 is the value at N~215]; 74 at N=300; 97 at N=900; -> 100 | with the 12.1 check: reproduces ~290 workers after one game year (lab 250 +/- 79 at 20 months) with 45-70% brood survival [V by simulation] |
| Season factor s | resumes spring | winter 0 (gd 22-28); spring gd 1: 0.3; gd 2-4: ramp to 1.0; summer 1.0; autumn gd 15-17: 0.6; gd 18-20: 0.2; gd 21: 0 | [S9] |
| Brood survival | -- | 0.45 early colony; 0.7 when nurses >= 1 per 3 brood and protein sufficient | [EST] |
| Alate production gate | ~4,000 workers (a few years old) [2ND, unverified] | N_sim >= 700 (N_real ~1,900 by the 12.1 formula) [CORRECTED from "N_real ~2,500"; ~2,500 real is N_sim ~830], >= 2 game years, protein/sugar stores > 14 gd, in spring gd 2-6 | [2ND][EST] |
| Alates per year | hundreds-thousands | 5-8% of N_sim (60-120): ~40% gynes, 60% males | [EST] |
| Nuptial flight window | July-Aug | summer gd 9-12.5 (early Jul to ~20 Aug in the calendar mapping), afternoons 14:00-18:00 game clock; peak gd 10-11 | [S15][S1] |
| Flight weather gate | >13 C, wind <6.3 m/s | T >= 13 C (hard), probability rises linearly to 1 at 25 C (the "all days >25 C had sightings" finding supports ~1; the linear ramp is [EST]); wind < 6.3 m/s hard (S15), < 1.7 m/s preferred early in the season (Boomsma and Leusink via S15); prior-day warming and falling wind raise odds | [S15][S47] |
| Founding survival | ~1% in field [EST] | 'Naturalist': 50% if founding site chosen well and queen unhurt; Gentle 80%, Harsh 25%; co-founding +10 pts | design |
| Pleometrosis | 18-25% | optional join; after first workers, fecundity-based fight (lower egg count loses) | [S12][S7] |
| Overwinter worker loss | not found | 5-15% (higher with low stores, small colony, <=2 C) | [S11][EST] |
| Winter | endogenous dormancy | 7 gd skippable time-lapse; consumption ~5% of summer; brood frozen as larvae | [S10][S5] |
| Nest | mounds 5.4-7.1 L (field, colony size unknown), ~26-27 cm across = ~65-68 BU | pellet mound at entrance (~65 BU across at maturity, not 400-500 BU); chamber/tunnel dimensions per section 5; nest volume proportional to colony size | [S16] [V] |

---

## 13. Third-person actions (what each body can physically do)

| Action | Worker | Queen, founding | Queen, established | Male | Virgin queen (alate) |
|---|---|---|---|---|---|
| Walk, climb walls/ceilings (surface walker) | yes | yes | slow | yes | yes |
| Dig, carry soil pellet to mound | yes | yes (chamber and entrance) | no (waits) | no | only after dealation |
| Carry brood (egg/larva/pupa) | yes | yes (alone, in the chamber) | rarely | no | no |
| Lay eggs | no (rare unfertilised in some species, not modelled) | yes (fertilised; trophic eggs for larvae) | yes (main task) | no | no (until mated) |
| Trophallaxis (give/receive) | give+receive | receive none; feeds larvae from reserves | receive; solicits | begs briefly | receive |
| Solicit honeydew by antennating aphids | yes | no | no | no | no |
| Lay trail by dabbing gaster tip | yes | no | no | no | no |
| Home-range footprints | passive | passive | passive | passive | passive |
| Spray formic acid (acidopore) | yes, short range, depleting | yes | yes | no (males harmless) | yes |
| Bite and hold | yes | yes | yes | weak | yes |
| Groom self/nestmates/brood | yes | yes | yes | self only | self |
| Drag prey, cooperative carry | yes | no | no | no | no |
| Carry corpse/waste to midden | yes (older workers) | yes (dead co-founders) | no | no | no |
| Carry aphids | yes | no | no | no | no |
| Fly | no | wings shed | no | yes (nuptial flight) | yes (nuptial flight) |
| Mate | no | -- | -- | yes; dies afterwards (not verified) | yes; then dealates, histolyses wing muscle |
| Dig founding burrow | -- | yes | -- | -- | yes (as foundress) |
| Defend entrance (block with head) | [MEM] | yes (hide) | rarely | no | no |

Control-scheme implication: verbs `Dig`, `Carry` (item/brood/aphid/corpse), `Feed` (trophallaxis), `Tend` (antennate aphids), `Mark` (trail dab, toggle), `Bite/Hold`, `Spray`, `Groom`, `Cooperative drag`, `Fly` (alates only). Queen verbs: `Lay`, `Command` (section above), `Nest-dig` (founding only).

---

## Caveats and gaps (honest list)

1. Web search budget ran out before any further check of Evison et al. 2008, Beckers et al. 1993 and Kipyatkov et al. 2004 numerics (still unverified after the fact-check pass; Springer pages are paywalled). The Dussutour and Simpson species question is now resolved: *Rhytidoponera metallica*, so S29 is an analogy only.
2. No *L. niger*-specific per-stage temperature response, walking speed vs temperature, trail evaporation vs temperature, queen egg-laying rate, nest depth, soil preference, foraging range, honeydew percentage, crop capacity, queen mass at founding, field queen survival, male lifespan, or alate sex ratio was found. All such cells are [EST].
3. The first-worker durations (52 d, ~70 d, 4-6 weeks) come from three very different conditions; the degree-day curve is a fitted compromise, not a measurement.
4. Quote on the trail lifetime (47 min) is from a catalogue record of Beckers et al. 1993; the 20-24 h figure's attribution is uncertain.
5. Colony sizes beyond 20 months are estimates; the ">4,000 at a few years old" and "~4,000 alate threshold" claims are from a hobbyist-grade source.

## Sources

- [S1] BWARS species account: https://bwars.com/index.php/ant/formicidae/formicinae/lasius-niger
- [S2] Wikipedia, Black garden ant: https://en.wikipedia.org/wiki/Black_garden_ant
- [S3] NatureSpot, Small Black Ant: https://mail.naturespot.org.uk/species/small-black-ant
- [S4] Collingwood 1979 text as reproduced: https://greekants.myspecies.info/taxonomy/term/114/descriptions and https://gbif.org/species/100120075
- [S5] Kramer, Schaible, Scheuerlein 2016, Exp Gerontol 85:18-23: https://www.rug.nl/research/gelifes/tres/publications/_pdf/Kramer_etal_ExpGerontol_2016.pdf
- [S6] Schlappi et al. 2020, Commun Biol (neonicotinoids; Table 1 and 2): https://pmc.ncbi.nlm.nih.gov/articles/PMC7320190
- [S7] Fecundity determines the outcome of founding queen associations (2021): https://pmc.ncbi.nlm.nih.gov/articles/PMC7862224
- [S8] Kipyatkov et al. 2004, J Evol Biochem Physiol 40:165-175 (SPbU portal, listing only)
- [S9] Kipyatkov, as cited in https://core.ac.uk/download/478532034.pdf (L. japonicus paper)
- [S10] Willot et al. 2026 dormancy dataset: https://datadryad.org/dataset/doi:10.5061/dryad.931zcrk1q
- [S11] Haatanen et al. 2015, overwintering temperature: https://research.utu.fi/converis/portal/detail/Publication/3223334?lang=en_US
- [S12] Aron and Deneubourg 2020, Sci Rep: https://pmc.ncbi.nlm.nih.gov/articles/PMC7419493
- [S13] Wikipedia colony size statement (same page as S2)
- [S14] Khuong et al. 2016 PNAS (lab colonies): https://pmc.ncbi.nlm.nih.gov/articles/PMC4747701
- [S15] Hart et al. 2018, Ecography: https://eprints.glos.ac.uk/4780/1/Hart%20et%20al%20flying%20ants.pdf
- [S16] same as S14 (field mound CT data)
- [S17] *L. neoniger* nest structure: https://experts.illinois.edu/en/publications/nest-structure-of-ant-lasius-neoniger-emery-and-its-implications-/
- [S18] temperature and nest digging, Sci Rep 2021: https://link.springer.com/10.1038/s41598-021-02491-w (abstract only)
- [S19] Romer and Roces 2014 (leaf-cutter analog): https://pmc.ncbi.nlm.nih.gov/articles/PMC4022738
- [S20] Offenberg 2001: https://antbase.net/pdf/offenberg-2001.pdf
- [S21] Volkl et al. 1999, Oecologia: https://link.springer.com/doi/10.1007/s004420050751
- [S22] Renyard et al. 2024: https://pmc.ncbi.nlm.nih.gov/articles/PMC10923885
- [S23] Collins and Leather 2002: https://gwct.org.uk/research/scientific-publications/2000-09/2002/collins2002/
- [S24] *Plebejus argus* via S2
- [S25] Oliver et al. 2007 summary: https://www.nationalgeographic.com/science/article/ants-herd-aphids-with-tranquilisers-in-their-footsteps
- [S26] Mailleux, Deneubourg, Detrain 2009, C R Biologies 332:500: https://comptes-rendus.academie-sciences.fr/biologies/articles/en/10.1016/j.crvi.2008.10.005/
- [S27] Renyard et al. 2024 (bait/nutrients) as S22
- [S28] Portha et al. context via https://difusion.ulb.ac.be/vufind/Record/ULB-DIPOT:oai:dipot.ulb.ac.be:2013/93800/TOC
- [S29] Dussutour and Simpson 2009, Curr Biol 19:740: https://pubmed.ncbi.nlm.nih.gov/19345104/
- [S30] Portha et al. (brood and scouts) as S28
- [S31] [CORRECTED] The 75-worker threshold is from Mailleux, Deneubourg, Detrain 2003, "How does colony growth influence communication in ants?", Insectes Sociaux 50:24-31, doi 10.1007/s000400300004 (not retrievable; confirmed only as quoted in S5). The link formerly listed here (https://pmc.ncbi.nlm.nih.gov/articles/PMC1691411) is a different paper, Mailleux et al. 2003 Proc R Soc B 270:1609, "Regulation of ants' foraging to resource productivity" (honeydew productivity model).
- [S32] Poissonnier et al. 2026, Insectes Sociaux: https://epub.uni-regensburg.de/79499/1/s00040-026-01106-9.pdf
- [S33] Czaczkes et al. 2011 synergy (via search summary)
- [S34] Blanchard et al. 2021 Ecol Entomol, doi 10.1111/een.12982
- [S35] Trail chemistry: https://link.springer.com/article/10.1007/s10886-025-01651-w
- [S36] Beckers, Deneubourg, Goss 1993, J Insect Behav 6:751: https://link.springer.com/article/10.1007/BF01201674
- [S37] Gruter et al. 2012, PLoS ONE: https://pmc.ncbi.nlm.nih.gov/articles/PMC3440389
- [S38] Koch and Czaczkes 2021: https://epub.uni-regensburg.de/44615/7/een.12995.pdf
- [S39] Czaczkes et al., home range markings: https://pmc.ncbi.nlm.nih.gov/articles/PMC3291321
- [S40] Wenig et al. 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC8214833
- [S41] Lenoir et al. 2009, J Chem Ecol: https://insectes-sociaux.univ-tours.fr/dictionnaire-amoureux-des-fourmis/Publications/2009-Lenoir-JCE-withSuppl.pdf
- [S42] Quque et al. 2023: https://pmc.ncbi.nlm.nih.gov/articles/PMC9814961
- [S43] Stroeymeyt et al. 2018, Science: https://pubmed.ncbi.nlm.nih.gov/30467168/
- [S44] Le Lay et al. 2026: https://pmc.ncbi.nlm.nih.gov/articles/PMC13724878
- [S45] AntWiki alarm communication: https://antwiki.org/wiki/Alarm_Communication
- [S46] Czaczkes et al. 2023 (aggression): https://epub.uni-regensburg.de/54939/1/Ecological%20Entomology%20-%202023%20-%20Czaczkes%20-%20Not%20dear%20neighbours%20Antennation%20and%20jerking%20but%20not%20aggression%20correlate%20with.pdf
- [S47] Boomsma and Leusink 1981: https://dx.doi.org/10.1007%2FBF00348045
- [S48] AntWiki *L. umbratus*: https://antwiki.org/wiki/Lasius_umbratus
- [S49] AntWiki *L. fuliginosus*: https://antwiki.org/wiki/Lasius_fuliginosus
- [S50] Immunity: https://doaj.org/article/c6b117097e824e2ebc3a9ba9cd55bff7
- [S51] Parmentier and Wybouw 2025 (*L. flavus*): https://pmc.ncbi.nlm.nih.gov/articles/PMC12308343
- [S52] Diez et al. 2013 (Myrmica): https://link.springer.com/article/10.1007/s10886-013-0365-1
- [2ND] hobbyist: https://r.datuan.dev/r/antkeeping/wiki/caresheets/lasius_niger , https://www.antstore.net/forum/post7896.html , https://antkeepers.com/pages/lifecycle-of-an-ant-colony

## Verification log (adversarial fact-check, 2026-11-12)

Method: each claim below was re-read in the cited source where it was reachable (PMC/Europe PMC full text, open PDFs, publisher abstracts); game-translation arithmetic was recomputed against the seed (1 game day = 600 s; 28-day year; 365/28 = 13.04 real days per game day; BU = 4 mm). Verdicts: CONFIRMED (matches the source), CORRECTED (value or interpretation changed in place), UNSUPPORTED (no source found; kept only as a labelled estimate or removed), UNVERIFIED (source not readable; value kept but flagged).

### A. Source claims

| # | Claim (as written before the check) | Verdict | What the source says | Source |
|---|---|---|---|---|
| 1 | Worker lifespan 434 +/- 44 d and 309 +/- 36 d, max 1129 / 1094 d, lab 22 C | CORRECTED | Values right, but +/- is a 95% CI (not SD) and the two groups differ by the age/size of the source colony (8-month vs 20-month); workers from larger colonies live shorter lives. Lab cohorts were not foraging and had no queen. Game used 33 gd for all colony sizes -> now 33 gd small colonies, 24 gd (309 d) for >= ~250 workers | https://www.rug.nl/research/gelifes/tres/publications/_pdf/Kramer_etal_ExpGerontol_2016.pdf |
| 2 | Queen lifespan up to 28 y | CONFIRMED | "maximum lifespan of 28 years" (Kutter and Stumper 1969, quoted by Kramer); Wikipedia says up to 29 y, typically ~15 y [citation needed] | same as 1; https://en.wikipedia.org/wiki/Black_garden_ant |
| 3 | Colony size 18 +/- 8 (8 months), 250 +/- 79 (20 months, range 122-392), Schlappi 290 (IQR 231-307) and 18 (IQR 12-18) at week 13 | CONFIRMED | 18 +/- 8; 250 +/- 79, range 122-392; week 64 control 290.5 [230.75;306.75]; week 13 control 18 [12;18]. "105 larvae" not found | Kramer (above); https://pmc.ncbi.nlm.nih.gov/articles/PMC7320190 |
| 4 | First egg to first worker 52 d "at ~23 C" and "first-appearance intervals" of the fastest individual | CORRECTED | Table 1: preoviposition 1, egg 18, larval 8, pupal 25, ontogenesis 52 d (medians). Rearing at 19-23 C (mean ~21 C). Stage endpoints are not defined, so the "fastest individual" reading is unsupported | https://pmc.ncbi.nlm.nih.gov/articles/PMC7320190 |
| 5 | Founding clutch 30-65 brood items by day 17 (65.5 +/- 7.8; 30.5 +/- 11.6) | CORRECTED | Those are the top and bottom 25% of 231 queens (selected for pairing); brood items are mostly eggs (152/231 queens had only eggs); thorax 3.2 +/- 0.4 mm and 21 C confirmed | https://pmc.ncbi.nlm.nih.gov/articles/PMC7862224 |
| 6 | Single-queen lab deaths "3 of 15" at days 4, 11, 16; lab queen mortality 20% over 64 weeks | CORRECTED (partly) | Deaths at days 4, 11, 16 confirmed; denominator "15" not found. 20% over 64 weeks confirmed (about 10 queens per group) | S7 URL above; https://pmc.ncbi.nlm.nih.gov/articles/PMC7320190 |
| 7 | "1.5% of field queens died of Metarhizium within 1 week (Austrian study)", cited to S12 | UNSUPPORTED | Aron and Deneubourg 2020 does not contain "Metarhizium", "fung" or that figure; it says only that founding failure is "as high as 99% in some species". Removed as a cited fact | https://pmc.ncbi.nlm.nih.gov/articles/PMC7419493 |
| 8 | Queens must find shelter within ~24 h or die | CORRECTED | Only an author assumption for the 24 h arena: queens without shelter "would most likely not survive". Not a measured survival time | same as 7 |
| 9 | Pleometrosis in 18-25% of incipient colonies, 2-5 queens, fighting after first workers emerge | CONFIRMED | "In about 18-25% of cases, groups of 2-5 unrelated queens co-found colonies"; fighting after first workers emerge | same as 7 |
| 10 | Queen mass 33.1 +/- 6.0 mg; worker ~1.04 mg (20 pooled = 20.8 +/- 1.5); queen ~25-30x worker mass | CORRECTED (ratio) | Masses confirmed (week 64, control; worker mass units not stated in text, mg inferred); ratio is 32x, so "25-30x" -> "~30x". Abdomen-only 24.8 mg not re-found | https://pmc.ncbi.nlm.nih.gov/articles/PMC7320190 |
| 11 | Worker 3.4-5 mm, queen 8-9 mm, male 3.5-4.7 mm | CONFIRMED | NatureSpot: 3.4-5, 8-9, 3.5-4.7 mm. Wikipedia: worker 3-5, queen 6-9, male 3.5-4.5 and 5-7 (self-contradictory) | https://mail.naturespot.org.uk/species/small-black-ant ; https://en.wikipedia.org/wiki/Black_garden_ant |
| 12 | Walking speed 23.5 mm/s (short path) and 26 mm/s (long path); pheromone did not raise speed | CONFIRMED | Exact quote found; "room temperature" is not stated in the retrieved text | https://epub.uni-regensburg.de/79499/1/s00040-026-01106-9.pdf |
| 13 | ~20% of foragers ignore pheromone; no specialist ignorer caste | CONFIRMED | "~20% of L. niger foragers ignoring pheromone"; ignoring is not repeatable within individuals (Y-maze lab) | https://epub.uni-regensburg.de/44615/7/een.12995.pdf |
| 14 | Trail recruitment switches on at ~75 workers (Mailleux 2003), cited as PMC1691411 | CORRECTED (citation) | "threshold colony size of 75 individuals (Mailleux et al., 2003)" is quoted in Kramer 2016; the primary paper is Insectes Sociaux 50:24-31, not the Proc B paper at PMC1691411. Primary not readable | Kramer URL above; doi 10.1007/s000400300004 |
| 15 | Dussutour and Simpson 2009 brood/protein/lifespan effects used as *L. niger* evidence | CORRECTED | Abstract names no species; a secondary review names *Rhytidoponera metallica* as the study species. Downgraded to an analogy | https://pubmed.ncbi.nlm.nih.gov/19345104/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC4342766 |
| 16 | Honeydew droplet max 0.7 uL; 0.6 M; intake 0.47 / 0.75 uL; Vc 1 uL; ~90% of ants reaching threshold lay a trail | CORRECTED | 0.7 uL was the offered droplet size ("comparable to honeydew"), not a maximum; 0.6 M used as close to aphid droplets; intake 0.47 +/- 0.25 and 0.75 +/- 0.30 uL (n = 63) confirmed; Vc = 1 uL is a model value; 38% laid a trail after droplet 1, 84% overall (not ~90%) | https://comptes-rendus.academie-sciences.fr/biologies/articles/en/10.1016/j.crvi.2008.10.005/ |
| 17 | Trail pheromone mean lifetime ~47 min (Beckers 1993); reinforced trails 20-24 h (Evison 2008) | UNVERIFIED | Springer record blocked/paywalled; no second source found. Kept as weak input only; the game value (900 s) is a design decision | https://link.springer.com/article/10.1007/BF01201674 |
| 18 | Nuptial flights: 97% of sightings in July-August; >13 C; wind < 6.3 m/s; all days >25 C had sightings; peaks 17 Jul-1 Aug; Boomsma wind rule "before 20 August" | CONFIRMED (one detail CORRECTED) | All confirmed in Hart et al. (88.5% of winged ants were L. niger; peaks 24 Jul 2012, 1 Aug 2013, 17 Jul 2014; July 64.6%, August 32.6%). The "before 20 August" date is not in the paper ("until part way through the season") | https://eprints.glos.ac.uk/4780/1/Hart%20et%20al%20flying%20ants.pdf |
| 19 | Field mound CT: mound 27 x 26 and 21 x 27 cm, 5,390 / 7,099 cm3, ~30% void, gallery height 5.5-5.9 mm, width ~12 mm; lab colonies 2,000-3,000 | CONFIRMED | All values match (Marquefave, France). Game text converting this to "400-500 BU across" was wrong (see B) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4747701 |
| 20 | Overwintering: +2 C reduced worker survival, queens unaffected; lab hibernation 6 C, weeks 15-32 | CONFIRMED | Haatanen abstract: +2 C vs +7-8 C, worker survival decreased, queen survival not affected; Schlappi: 6 C fridge, week 15 to 32 | https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=Haatanen%20AND%20%22Lasius%20niger%22&resultType=core&format=json ; PMC7320190 |
| 21 | One feeding hole holds max 8 foragers | CONFIRMED (scope-limited) | Stated as a finding about the lab feeder and used as a model parameter, not a species constant | https://pmc.ncbi.nlm.nih.gov/articles/PMC3440389 |
| 22 | Home-range CHCs are non-volatile; outbound ants deposit less trail pheromone than returning ants on CHC-marked trails | CONFIRMED | Exact result on a 7 cm trail section (z = 3.984, p < 0.001); persistence time not given ("long lasting") | https://pmc.ncbi.nlm.nih.gov/articles/PMC3291321 |
| 23 | Mature colonies 4,000-7,000, up to 40,000; "several hundred up to 10,000" | CONFIRMED (secondary) | Wikipedia and BWARS quotes found; Khuong: "thousands to tens of thousands". The "5+ y" age is an estimate | https://en.wikipedia.org/wiki/Black_garden_ant ; https://bwars.com/index.php/ant/formicidae/formicinae/lasius-niger |
| 24 | First workers appear Aug-Sept in temperate climates (field) | UNVERIFIED | No source retrieved; first brood may overwinter | n/a |

### B. Game-translation arithmetic (recomputed against docs/01-design-seed.md)

| # | Item | Verdict | Detail |
|---|---|---|---|
| B1 | Calendar compression 365/28 = 13.04; 1 season = 7 gd = ~91 d; sugar need x13 (0.06-0.1 mg/d -> 0.8-1.3 SU/gd) | CONFIRMED | Recomputed |
| B2 | Egg stage "1.3 gd (13 d)" | CORRECTED | 13 d = 1.0 gd; 1.3 gd = 17 d. Now 18 d = 1.4 gd at 21 C |
| B3 | Larva 1.1 gd, pupa 1.5 gd, egg-to-worker 3.9 gd at "23 C" | CORRECTED | S6 medians 8 d / 25 d / 52 d at ~21 C -> 0.6 gd / 1.9 gd / 4.0 gd (sum 3.98 gd) |
| B4 | Degree-day table (K = 650 DD: 3.3 / 2.5 / 5.0 / 10 gd) | CORRECTED | Anchor corrected to 21 C; K = 575 DD -> 25 C 2.9 gd, 30 C 2.2 gd, 20 C 4.4 gd, 15 C 8.8 gd |
| B5 | N_sim and w table (12.1) | CONFIRMED | All rows recomputed from the formula (5,500 -> 1,173 vs 1,172 listed, rounding) |
| B6 | Alate gate "N_sim >= 700 (N_real ~2,500)" | CORRECTED | Inverse of the formula gives N_real ~1,920 |
| B7 | q(N) = 30 + 70(1 - e^(-N/300)); "66 at N = 100" | CORRECTED | 49.8 at N = 100; 66 occurs at N ~ 215. Other values (34, 97, 100) fine |
| B8 | "Fits 18 -> 250 workers in ~1 year" | CONFIRMED | Difference-equation check gives ~290 after one game year; plateau ~900-1,100 sim agents (see 12.1) |
| B9 | Worker lifespan 33 gd (430 d / 13.04) for all colony sizes | CORRECTED | Conversion right (33.3 gd), but S5 shows 309 d (23.7 gd) for workers of larger colonies |
| B10 | Forager "3-5 trips per gd" and "x13 load multiplier keeps throughput = 13x real" | CORRECTED / UNSUPPORTED | At 24 mm/s plus ~60 s handling, trips per 600 s are 4.2 (1 m), 3.2 (1.5 m), 2.6 (2 m), 1.5 (4 m); the x13 argument rests on an unsourced "3-6 real trips per day"; internal supply/demand check is consistent (~340 SU/gd supply vs ~270 SU/gd demand for 270 workers) |
| B11 | Protein "0.6 PU per gd of larval stage" vs 0.5-0.8 mg total | CORRECTED | With a 0.6 gd larval stage this gives 0.36 PU; use ~1.1 PU per gd (0.65 PU total) |
| B12 | Mound "5-7 L = 400-500 BU across" | CORRECTED | 26-27 cm / 4 mm = 65-68 BU across (height 52-68 BU) |
| B13 | "4-5 game years = ~19-23 h at 1x, ~3 h at 8x" | CORRECTED | 4.67 h per game year: 18.7-23.3 h at 1x, 2.3-2.9 h at 8x |
| B14 | Trail half-life: 47 min mean life -> 33 min half-life -> 900 s game value; round trip over 4 m ~330 s | CONFIRMED (arithmetic) | 47 x ln2 = 32.6 min; 2 x 4000 / 24 = 333 s. The biological input (47 min) itself is UNVERIFIED |
| B15 | Nuptial window "summer gd 9-12.5, peak gd 10-11" | CONFIRMED | 1 Jul ~ gd 8.8-9, 20 Aug ~ gd 12.7; peak 17 Jul-1 Aug ~ gd 10.1-11.2 |
| B16 | Starvation 6 gd / 2 gd | UNSUPPORTED | = 78 real days / 26 real days; no source; flagged as an estimate with a 3-6 gd range |
| B17 | Founding survival, speed vs T curve, season factor, brood survival, overwinter loss, queen-lifespan rule | not checkable | Pure design values labelled [EST] or "design"; no biological source claimed |

### C. Counts

Claims checked: 24 source claims + 17 arithmetic/translation items. Verdicts on source claims: 12 CONFIRMED (1 with a detail corrected), 9 CORRECTED, 1 UNSUPPORTED, 2 UNVERIFIED. Arithmetic: 5 CONFIRMED, 11 CORRECTED or downgraded, 1 not checkable.
