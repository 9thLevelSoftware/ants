# Dossier: Leafcutter / fungus-farming playstyle (*Atta texana*)

Status: research dossier for the FOUNDRESS design team. Reference species for the playstyle: *Atta texana* (Buckley, 1860), the Texas leafcutter ant. BU = 7 mm (media worker). Conventions: "[Sn]" cites the source list at the end. "EST" marks my own estimate with reasoning. "NF" means not found. "Analog" means the value comes from a congener (A. cephalotes, A. sexdens, A. colombica, A. vollenweideri, A. laevigata, Acromyrmex spp.) and is not measured in *A. texana*.

Honest headline on evidence quality: *A. texana* itself has good natural-history coverage (Moser's nest excavations, Mintzer's founding work, the first-ever identified ant trail pheromone, Texas extension literature), but the physiology and behaviour numbers that matter for a simulation (load sizes, cutting times, caste head widths, garden nutrition, hygiene) mostly come from tropical congeners. Roughly half of the parameters in section 12 are analog-based or EST. A fact-check pass (see Verification log at the end) has since corrected or down-graded several values. Web search budget ran out before every gap could be closed; items that need a second pass are listed under "Open gaps" at the end.

---

## 1. Identity and morphology

*A. texana* is a higher-attine leafcutter in the tribe Attini, found in east Texas, Louisiana and north-eastern Mexico [S3]. It is the only Atta in the USA and is nearly always described as a rusty-brown, strongly polymorphic ant with three pairs of thoracic spines (Atta has 3 pairs; Acromyrmex has 4 and a rough thorax) [S3, S14]. Subfamily Myrmicinae: two-node petiole (petiole + postpetiole); the sting is reduced and not used in defence in Atta (general myrmecological knowledge, not confirmed in the fetched sources); defence is mandibular plus gland secretions, with no acidopore or formic acid spray. The metapleural gland (antimicrobial secretion, phenylacetic acid among others) is large [S18].

| Caste | Head width (HW) | Body length | BU (7 mm = 1.0) | Source / status |
|---|---|---|---|---|
| Worker range overall | 0.6 to over 4 mm | workers 3 to 12 mm (ADW) or 3 to 18 mm (Wikipedia, which lumps in alates) or 1.6 to 12.7 mm (TAMU, "1/16 to 1/2 inch"); 18 mm is the queen/alate maximum (ADW: "overall range 3-18 mm") | workers 0.2 to 1.8 (TAMU range) or 0.4-1.7 (ADW); queen/alate to 2.6 | [S1, S2, S3]; VERIFIED: the sources conflict (ADW 3-12 mm workers; Wikipedia 3-18 mm). I use the TAMU worker range (1.6-12.7 mm) and 18 mm for queens/alates only |
| Minim (gardener, nurse, hitchhiker) | about 0.6 mm (0.59-0.71 in A. vollenweideri) | EST 2.0-3.0 mm | 0.3-0.45 | HW analog [S8, S12]; body EST |
| Small media (processing/tending) | 1.0-1.5 mm | EST 4-5 mm | 0.6-0.7 | Analog [S8]; body EST |
| Media (forager/cutter) | about 1.8-2.8 mm; most efficient cutters 2.2-2.6 mm | EST 6-9 mm | 0.85-1.3 | A. sexdens HW range from search summary; the 7 mm BU reference worker sits here |
| Major (soldier) | over 2.7-3.0 mm (2.5-3.35 mm in A. vollenweideri) | EST 11-13 mm (largest A. laevigata soldiers 16 mm, HW 7 mm [S12]) | 1.6-1.9 | Analog [S8, S12]; *A. texana* major size NF |
| Queen / alate female | NF | up to 18 mm (ADW; "3/4 inch" per TAMU is about 19 mm) | 2.6 (2.7 at 19 mm) | [S1, S2, S3] (verified) |
| Male (alate) | much smaller head than females [S3] | NF; EST 12-15 mm | EST 1.7-2.1 | winged, brown-yellow wings [S3] |

Polymorphism: body mass varies up to about 200-fold across workers within one colony (A. vollenweideri) [S8]; the same data show forager-class brains are about 4-fold larger by volume than minim brains but minims keep the highest mushroom-body fraction [S8]. ADW says "twelve morphs"; that figure is a loose count of size bins, not discrete castes (size classes overlap in task repertoire) [S2, search summary of Dijkstra et al. 2023]. Colour: rusty brown; larvae cream, 6-13 mm [S3]. Mass anchors (analog): Acromyrmex media 5.3 mg, minima 0.87 mg [S5]; an *A. sexdens* queen weighs about 207 mg [S7]; *A. texana* queen mass NF (EST 250-350 mg).

Game note: the body-length scale gives the game one species with a 6-fold length range (minim 0.35 BU to major 1.8 BU, queen 2.6 BU). This is the largest size spread in the roster and drives rendering (multiple instanced meshes), nav (minims fit in tunnels majors cannot use) and camera (the queen needs wide galleries).

## 2. Life cycle and development; lifespans

Holometabolous: egg, 3-4 larval instars (EST; ADW says "four stages" of development, i.e. egg-larva-pupa-adult), pupa, adult. Larvae are legless, fed only fungus; nobody feeds them trophallactically [Quinlan & Cherrett, search summary].

| Item | Value | Source / status |
|---|---|---|
| Egg to adult worker, typical attine | 40-60 days | review via search; hobbyist page claims 35-38 d from pupa to adult for *A. texana*/A. cephalotes (low reliability) |
| Egg to adult, game basis | EST: minim 45 d, small media 50 d, media 55 d, major 65 d at 25 C | EST (bigger castes develop longer; stage split about 20% egg, 40% larva, 40% pupa) |
| Temperature dependence | NF for Atta. EST: development rate x0.5 at 20 C, x1.0 at 25 C, x1.4 at 28 C, arrested below 15 C or above 32 C | EST (Q10 about 2.5, typical for ants) |
| Queen life span | at least 10-15 years (lab: A. cephalotes 13 y, A. sexdens 15.3 y) | [S2] |
| Worker life span | ADW: 1-2 years (Wikipedia Atta page says about 7 y, which looks wrong for workers; treated as unreliable). Note [S17] gives queens "more than 20 years", ADW 13-15 y lab records; game uses the conservative 10-15 y | [S2, S19]; EST (no source) foragers 3-6 months because foraging is lethal work; only the "refuse-heap workers live about half as long as peers" part is sourced [S17] |
| Male life span | 1-2 weeks | [S19] |

Game conversion (1 game day = 13.04 real days; 365/28): egg-to-minim 3.5 gd, to media 4.2 gd, to major 5.0 gd; queen 10-15 game years = 280-420 gd; worker 1-2 game years = 28-56 gd; forager 3-6 months = 91-183 d = 7-14 gd (EST; corrected from 6-12, which was an arithmetic error).

## 3. Colony founding

Mode: independent, fully claustral for *Atta*: a single mated queen (or a few co-foundresses) digs in alone, never forages, and lives on body reserves plus her own eggs until the first workers open the nest [Mehdiabadi & Schultz 2009 via search; S5]. Contrast: *Acromyrmex octospinosus* is semi-claustral (the foundress forages leaves herself) [S15].

| Step | Detail | Time | Source |
|---|---|---|---|
| 1. Nuptial flight, mating | females mate on the wing; ADW is self-contradictory on mating number (one passage "may mate twice", another "once in their lifetimes"), so *A. texana* mating frequency is NF; Atta in general mate with multiple males to collect about 300 million sperm [S12] | hours | [S2, S12] (verified; corrected from "ADW suggests single mating") |
| 2. Landing, wing shedding | dealation; most queens die before founding. The earlier "more than 99.95% die in the first year" figure was NOT FOUND in [S12] or [S13] (removed); use the sourced figures under Mortality | minutes-hours | see Mortality below |
| 3. Dig founding tunnel | straight down about 20-30 cm [S13, generic Atta; A. laevigata 20-30 cm, S6]; general leafcutter range 10-30 cm [S5]; A. sexdens 4-month nests about 15 cm deep [S7]; chamber about 6 cm across [S13]; entrance crater 5-8 cm [S6]. The previously stated "15-25 cm in *A. texana*" (attributed to Moser via a search summary) is UNSUPPORTED; *A. texana*-specific founding depth is NF, EST 15-30 cm | hours-days | depth [S5, S6, S7, S13]; chamber [S13]; crater [S6] |
| 4. Seed the garden | queen carries a mycelial pellet in her infrabuccal pocket from the natal nest, spits it on the chamber floor; hangs/places it, fertilises with faecal droplets | within the first 1-3 days | [S12, S13, Mehdiabadi & Schultz 2009] |
| 5. Eggs | 3-6 eggs within about 3 days of planting (NF in any fetched source; EST); "approximately 90 percent of this first brood will be eaten by the queen" (TAMU wording is "first brood", not specifically "trophic eggs") | days | 90% from [S1] (verified); egg count EST |
| 6. Claustral phase | EST (UNSUPPORTED: the Mintzer 1987 *A. texana* abstract could not be opened, so "queen loses about 30% of body weight, then a further 25-35% over 5 months, grouped = solitary" is unverified; the paper exists: Insectes Sociaux 34:108-117, "Primary polygyny in the ant *Atta texana*: number and weight of females and colony foundation success in the laboratory"). Treat the percentages as design placeholders | first workers 8-12 weeks after founding [S5] | timing [S5]; weight loss EST |
| 7. First workers | minims; "about 3 to 4 months" after the claustral phase starts, workers clear the channel the queen closed [S7]; 4-month field nests of *A. sexdens* had mean about 120 workers and about 144 eggs, queen about 207 mg (the mapping of the paper's five values to variables is inferred) | first workers eclose at 8-12 weeks [S5]; surface opening 3-4 months [S7] | [S5, S7] (verified) |
| 8. Handover | workers forage; queen only lays and recovers weight | | [S5] |

Mortality: about 2.5% of young queens found a long-lived colony (Atta/Acromyrmex general) [S12]; for *A. sexdens* about 2.53% still exist after three months, about 10% for A. cephalotes (a few months), and 0.09% for *A. capiguara* [S13] (all verified). In Acromyrmex octospinosus about 50% of incipient nests die each month [S15] (not re-opened). Escovopsis is found in 6.6% of colonies at founding, almost 60% of 1-2 year old colonies [S12] (verified). Group founding (pleometrosis) is "confirmed only in *Atta texana*" [S12]. In the related *A. laevigata*, ONE lab digynous colony's workers attacked and killed both co-foundresses (n = 1 nest, "the perils of polygyny") [S6]. Crucially, Mintzer states that such aggression "was never observed ... in concurrent and previous studies of A. texana" and that "A. texana worker offspring do not eliminate any females present in the initial colony-founding group" [S6]. So worker execution of co-foundresses is NOT an *A. texana* trait (earlier draft of this dossier wrongly applied it to the playable species). The digynous *A. laevigata* colony's culture "continued to grow fastest" in the lab, and had over 250 workers and about 200 mL of fungus at about +3 months [S6]; the "10-50 mL, under 100 workers" values are the month-0 state of nine single-queen field nests, not a +3-month comparison.

Early growth snapshots (A. laevigata, analog) [S6]: month 0 (field, Oct 1988) about 10-50 mL garden and under 100 minors/medias (up to 6 mm body length) in one chamber 20-30 cm deep; one two-queen nest had about 100 mL and over 100 workers; month 3 about 200 mL, over 250 workers (digynous); month 11 about 3 L garden ("3 1" in the OCR text, read as 3 L) and the first majors (head width "2 6 mm" in OCR, read as 2.6 mm; both OCR readings are uncertain). Implied garden growth: from about 100 mL to about 3 L in 330 d is about 5 doublings, a doubling time of about 65 d (about 5 gd); month 0 to month 3 (digynous) about 45-90 d per doubling. A. colombica first-year garden maxima: 20-2,100 mL across colonies (Weber 1977, via search; not verified).

Game: the opening is a hands-on queen sequence (dig about 20-30 cm, plant pellet, tend garden, eat part of the first brood). The player cannot forage; the queen's body-mass budget (section 12) is the countdown. This is the most distinctive opening of the four species.

## 4. Colony growth and mature size; reproduction; monogyny vs polygyny

| Item | Value | Source / status |
|---|---|---|
| Mature colony workers | up to 2 million (TAMU, ADW); Wikipedia says supercolonies over 10 million (single mention, treat as unreliable); other Atta: A. cephalotes up to 5 million [S17], A. colombica up to 3.55 million [S12] | [S1, S2, S3] |
| Colony age to maturity | NF for *A. texana*; EST 3-4 years to produce the first alates (A. sexdens literature, recalled, unverified) | EST |
| Growth profile | slow first year (hundreds to low thousands of workers), then exponential, then plateau; **mature nest 15-24 m across (50-80 ft)**, up to about 1,000 entrance holes, area up to 420 m2 (Wikipedia) or "1/5 ha" (Moser 1967, via search) | [S1, S3] |
| Annual production | reproductives "number in the thousands" each year once the colony is large enough | [S1, S2] |
| Queens per colony | ADW/Wikipedia/TAMU conflict: usually 1, often 2 (Wikipedia calls the species polygyne), up to 4-5 (TAMU) | [S1, S2, S3]; decision in section 12: monogyne default, polygyne as rare event |
| Queen output | "up to two million eggs" per queen over her life | [S2] |
| Reproduction timing | alate brood is reared in the winter central cavity and flies April-June | [S4, S1] |

## 5. Nest: substrate, architecture, special structures

Substrate: well-drained sandy or loamy soil, mostly pine-hardwood forest edges in east Texas/Louisiana [S3]; not rock, pavement, standing water or compacted fill. Winter mean temperatures in the central cavity may set the species' northern limit at about 33 N [S4].

| Structure | Real dimension | BU (7 mm) | Source / status |
|---|---|---|---|
| Founding tunnel | 20-30 cm deep generic Atta (range 10-30 cm), chamber about 6 cm | 29-43 deep (typical), 14-43 (full range), 9 wide | [S13], [S5], [S6] (corrected from 15-25 cm, which was unsupported) |
| Entrance crater (incipient) | 5-8 cm across | 7-11 | [S6] |
| Mature mound (TAMU: "crater-shaped mounds", each with one central entrance hole; the earlier "crescent-shaped" claim is UNSUPPORTED and removed) | 13-36 cm high (5-14 in), 30-46 cm across (1-1.5 ft); older centres 60-90 cm higher than surroundings (not re-verified); nest has up to about 1,000 entrance holes [S3] | 19-51 high, 43-66 across | [S1] (verified), [S3] |
| Nest spread | 15-24 m (50-80 ft), area up to 420 m2 | 2,100-3,400 | [S1, S3] |
| Mature fungus chamber | about 30 cm in Atta (50 cm in Acromyrmex) | about 43 | [S5] |
| Depth | typical 4.6-6 m (15-20 ft, TAMU), up to 6-7 m (Wikipedia/Moser 1967), 7.6 m (ADW "25 feet"); vertical shafts "possibly as deep as 32 m" serving as wells (Moser 2006 abstract; this is exceptional and conflicts with the 1967 figure; treat as unverified) | 650-1,100 typical | [S1, S2, S4] |
| Lateral foraging tunnels | up to 150 m (500 ft) | 21,400 | [S1] |
| Cavity inventory (one medium nest, N Louisiana) | 97 fungus gardens, 27 dormancy cavities, 45 detritus cavities (169 total); a funnel-shaped nest with a large central cavity at its lower centre used as the winter domicile and the rearing site for alate brood | n/a | [S4] |
| Inquilines | cockroach *Attaphila fungicola*, milichiid fly *Pholeomyia comans*, beetles | | [S4] |

Ventilation (analog, A. vollenweideri): wind pulling air out of the central tunnels is the main driver, followed by delayed inflow through peripheral tunnels; turret-like openings on the mound reinforce this; CO2 stays under 2.8% down to 2 m in healthy nests; closing openings in rain or flood raises CO2 quickly [Kleineidam & Roces 2000/2001, via search]. Turret shape is built in response to CO2 in the tunnels, not airflow or humidity [Halboth & Roces 2017, via search]. Early (4-month) A. sexdens nests had median CO2 1.4%, rising with fungus biomass [S7]. Attine nests can reach about 5% CO2 [S10 text of Tschinkel 2004, PMC528881].

Game scale-down (see section 12): the real nest footprint (2,100-3,400 BU) is 53-86% of the whole 4,000 BU map width, so the game nest (600-900 BU) is compressed by about 3.5-4:1 in footprint (corrected from 4-5:1) and about 2:1 in depth. CO2 reaching "up to 5%" in attine nests is verified in Tschinkel 2004 quoting Kleineidam & Roces 2000 [S10].

## 6. Diet, nutrition and the colony economy

*A. texana* is a farmer: workers do not eat leaves. Leaves are the substrate; the cultivar *Leucoagaricus gongylophorus* converts it into food.

The resource chain (quantitative where found):

| Link | What happens | Numbers | Source / status |
|---|---|---|---|
| Plant input | leaves 96.2% of foraging effort (the remainder flowers/fruit); 44 plant species used by one A. colombica colony; *A. texana* harvests over 200 species | one colony up to 370 kg dry mass/yr (A. colombica); one S. American colony took about 13,000 lb (5,900 kg) in 6 y | [S11, S1, S3] |
| Sap | workers drink sap at cut edges; large ants mostly while foraging, media/small ants during substrate preparation | sap supplies much of the workers' energy (not quantified in [S13]); in a lab experiment "only 5% of workers' energy needs were met by fungal staphylae" [S13, verified, citing Quinlan & Cherrett 1979]; the "hyphae at most 9% (Atta sexdens)" figure was NOT FOUND in [S13] and is unsupported (EST: fungus is a minor adult energy source) | [S13]; Littledyke & Cherrett 1976, Bass & Cherrett 1995 (search summaries, unverified) |
| Substrate processing | cut to 1-2 mm pieces, chewed to pulp, treated with faecal droplets (enzymes), inoculated with hyphae, added to garden | the fungus takes about 6 weeks to break down harvested material | [S2, S11] |
| Fungus | fungus degrades leaf into hyphae plus gongylidia in bundles (staphylae) | hyphal growth maximised across a broad gradient up to about 60% carbohydrate (of diet dry mass), staphylae density maximised up to about 40% carbohydrate and about 30% protein; growth and survival fall when protein exceeds c. 20% of substrate dry mass; Cu, Mn, Zn toxic at 60 mg/L in vitro (Ca, K, Mg, Na tolerated above 600 mg/L) | [S11] (verified; in vitro, Acromyrmex-associated *Leucoagaricus* work, not *A. texana*) |
| Food for larvae/queen | larvae and queen eat only fungus; larvae prefer staphylae to hyphae and gain more weight on them; staphylae are richer in lipid and carbohydrate, poorer in protein | larvae fed whole or worker-chewed staphylae | [S2; Quinlan & Cherrett 1979] |
| Growth rate | a new 1.3 L garden was built in one week with ad libitum feeding in the lab (study species A. lundi; the paper does not clearly name the species for this figure) [S5]: a burst rate, not a sustained one | first-year doubling time about 45-65 d (about 3.5-5 gd) from the A. laevigata snapshots in section 3 [S6] (corrected: the earlier "doubling about 19 days" does not follow from [S6], which implies about 65 d) | [S5], [S6], EST |
| Output | spent substrate removed to detritus chambers | 45 of 169 cavities | [S4] |

Key consequence: two linked currencies. (1) Sap/carbohydrate energy for adults is gathered at the leaf edge; (2) garden mass (and therefore larvae and the queen) is limited by substrate quality and quantity. The player must supply leaf quality as well as quantity: too much protein or toxic metals or secondary metabolites shrinks the garden.

## 7. Foraging

| Item | Value | Source / status |
|---|---|---|
| Foraging style | mass recruitment on cleared, persistent trails | [S3] |
| Range | foragers commonly 600 ft or more (about 180 m); lateral foraging tunnels up to 500 ft (about 150 m) [S1, verified]. (A. vollenweideri "carries leaves up to 150 m" attributed to [S13] was NOT FOUND there; unsupported, ignore) | [S1] |
| Activity rhythm | summer: almost exclusively at night; rest of year: day foraging at air temperatures 45-80 F (7-27 C); not on cold, wet or cloudy days | [S1, S2] |
| Temperature response | in A. cephalotes foraging rises steadily from 15 to 35 C (Colombia 2019), in a grass-cutter walking speed has Q10 4.1 (15-20 C), 2.3, 1.5, 1.4 (30-35 C) | search summary, [S9] |
| Walking speed (analog, *A. heyeri*, grass-cutter) | laden 20 mm/s at 17 C, 32 mm/s at 27.5 C; speed falls with load ratio; unladen outward similar | [S9]; *A. texana* NF; EST laden media 25-40 mm/s at 25 C (3.5-5.5 BU/s) |
| Load | "burden" up to 7.5 for leaf-cutting ants in general [S5]; [S5] defines burden = (ant mass + load mass) / ant mass, so burden 7.5 means a load of up to 6.5 x ant mass, and the experimental items in [S5] were burden about 2-3.5. Measured *A. heyeri* grass loads had burden only about 1.2-1.5 (load about 0.2-0.5 x ant mass) [S9]. Popular figure "up to 50 times body weight" [S12] is for lifting, not carrying; fragment size scales with cutter size and leaf density (via search, not verified) | [S5, S9, S12]; for broadleaf Atta: EST burden 2-3 (load 1-2 x ant mass) |
| Cutting | cutters anchor their hind legs and swing the mandibles on a pivot; cutting time (grass analog) 25 s per mm of cut width at 25 C, 77 s per mm at 15 C | [S9]; broad-leaf cutting time NF, EST 30-120 s per fragment |
| Cutting vibration | foragers stridulate while cutting; the vibrations travel through the leaf and recruit nearby nestmates; fewer ants stridulate on low-palatability leaves, so it is recruitment (mechanical help is a side effect); hitchhiking is more frequent on carriers cutting from a stridulating leaf | Roces, Tautz & Hölldobler 1993; Roces & Hölldobler 1995/1996 (search summaries) |
| Trail pheromone | methyl 4-methylpyrrole-2-carboxylate (MMPC) in Atta; *A. sexdens* uses 3-ethyl-2,5-dimethylpyrazine; identified first from *A. texana* (Tumlinson et al. 1971, Nature 234:348-349; citation verified via Crossref, DOI 10.1038/234348b0; paper text not opened). Potency: [S13] states that 1 mg of MMPC could in theory mark a trail about 120,000 km long (74,703 mi, about 3 times the Earth's circumference) for *A. texana*/*A. cephalotes* (Riley et al. 1974), so threshold is extremely low; per-ant dose NF | [S13] |
| Trail upkeep | trails are kept physically clear (workers, especially larger ones, remove debris); persist for years; the plant species flagged as good is switched by the colony to avoid stripping a tree | [S14]; trail clearing detail from general literature, NF in fetched sources |
| Peak damage | small to medium trees defoliated in one night to a few hours; pine seedlings destroyed in days but seedlings 2-3 ft tall are not attacked | [S1, S2] |

## 8. Castes and division of labour

Temporal polyethism is weak; size-based (physical) polyethism is strong. Task overlap exists at size boundaries [Dijkstra et al. 2023 via search; S8].

| Class | In-nest tasks | Out-of-nest tasks | Source |
|---|---|---|---|
| Minim | tend fungus garden, tend brood, weed Escovopsis, slow spore growth with metapleural phenylacetic acid | hitchhike on leaf fragments to defend carriers against phorids; sometimes on trails | [S8, S12, S17, S18] |
| Small media | process substrate (clean, cut, pulp, inoculate), carry fungus/brood, tend gardens, dig | short-range foraging, trail work | [S8; analog] |
| Media | substrate preparation; waste hauling | cut and carry leaf fragments (the standard forager) | [S8, S17] |
| Major | dig, guard entrances and trails, (A. vollenweideri large workers also cut and transport leaf material) | defence; trail clearing | [S8, S17] |
| Refuse workers | stay on the refuse heap and are attacked if they contact garden workers; live about half as long | | [S17; Hart & Ratnieks via search] |
| Queen | lay eggs (up to 2 million lifetime); fed by workers on fungus | | [S2] |
| Males/alates | none, mating | | [S19] |

## 9. Communication and defence

Chemical: trail pheromone (MMPC) from the poison gland; alarm pheromones from the mandibular glands (general Atta knowledge; not fetched). Vibration: stridulation while cutting (above); stridulation also used for rescue of buried nestmates (general). Defence is by size: majors bite (bite force about 800 mN, 2,600x body weight, [S12]); minims hitchhike; metapleural gland secretions plus (in Acromyrmex) cuticular Pseudonocardia protect the garden [S10, S18]. Atta lack a functional sting. Human-scale threat: bait/insecticide is the main control; activity declines over 4-6 weeks after baiting and returns about half the time within 4-6 months [S1].

## 10. Seasonal cycle and nuptial flights

| Season (Texas) | Colony state | Source / status |
|---|---|---|
| Spring (Mar-May; gd 1-7) | alate production completes; flights April-June (gd 3-10, running into early summer) on clear, moonless nights, usually after more than 1/4 inch (6.35 mm) of rain [S2]; day foraging in cool weather | [S1, S2] |
| Summer | night foraging only (hot days); gardens kept cool by deep chambers | [S1] |
| Autumn | day foraging resumes; colony stockpiles; alate larvae begin | EST |
| Winter | colony retreats to the central cavity; the fungus is not dormant; day foraging on warm days at 7-27 C | [S4, S2] |

Flight conflict: ADW/TAMU say night flights on clear moonless nights after rain; a search summary of Moser 1967 says *A. texana* flies at dawn. Decision: allow both in the sim as one flight window from late evening to early morning. Flights are regionally synchronised [S3]. Alate mass (females carrying fungus pellet and fat) and the strong sexual dimorphism make it a spectacle. Daughter colonies: females need soil, fresh pellet, no rival nest nearby.

## 11. Enemies, parasites, competitors, pathogens; hygiene and waste

| Threat | Detail | Source |
|---|---|---|
| Garden parasite *Escovopsis* | microfungus that consumes the garden; spreads by infected material and between colonies; can destroy a garden and collapse a colony in weeks (review summary); prevalent in 60% of 1-2 year colonies | [S12, S18, search] |
| Antibiotic defence | *Pseudonocardia* on the cuticle (best documented in Acromyrmex; verified [S10]): Escovopsis growth fully suppressed in 54.2% of bioassay pairings, not suppressed (resistant) in 11.8%; 45.3% (29 of 64) of pairings between symbionts from the two sympatric Acromyrmex species showed weak or no inhibition (so it is a cross-species mismatch figure, not a share of all pairings); garden weight measured 1 week after inoculating subcolonies (80 mg garden, two major workers) with 11,500 +/- 252 spores per subcolony; metapleural phenylacetic acid; weeding and grooming compensate | [S10, S18] |
| Infrabuccal pocket | acts as a sterilising filter that kills Escovopsis spores (study summary) | search |
| Phorid fly parasitoids | *Myrmosicarius texanus* (Texas and Louisiana) and *Apocephalus wallerae* (Texas) parasitise *A. texana* foragers; the latter runs up to workers cutting leaves rather than hovering; the maggot develops in the host's head | USDA SRS Waller (search summary); [S12] |
| Hitchhiker defence | hitchhikers reduce time flies spend on leaf fragments and the chance they land; "about 50% of returning minims hitchhike" and "energy savings under 10%" are UNVERIFIED (paper "Defense against parasites by hitchhikers in leaf-cutting ants: a quantitative assessment", Behav. Ecol. Sociobiol. 1990, exists per Crossref but could not be opened; [S12] confirms only that minims sometimes stand on a worker's leaf to ward off phorids) | Feener & Moss 1990 (A. colombica; not opened); [S12] |
| Predators | nine-banded armadillo (ADW); humans (bait, mounds), plus other ants/birds EST | [S2] |
| Inquilines | cockroach Attaphila, fly Pholeomyia, beetles | [S4] |
| Waste | detritus cavities inside the nest (45 of 169 in the excavated nest); *A. colombica* uses an external heap; heap workers rarely leave the heap; contaminated workers are attacked; heap workers turn over waste | [S4, S12, S17; Hart & Ratnieks] |

## 12. GAME TRANSLATION

Calendar: 1 game day (gd) = 600 s of sim time at 1x = 13.04 real days of biology (365/28). Year = 28 gd; seasons are 7 gd each. Assumed calendar start: gd 1 about 1 March (spring = gd 1-7, Mar-May; summer = gd 8-14). Flight window April-June = elapsed 2.4-9.4 gd = gd 3-10 (corrected from 3-9; the June flights fall in the first 3 gd of the 7-gd summer). Conversion factor: gd = real days x 0.0767 (1/13.04).

### 12.1 Scale-down

Real mature colony about 1-2 million workers (TAMU/ADW). Simulated cap: 1,500 worker agents; each sim worker has a weight w (the number of real ants it represents).

| Stage | Real workers | Sim agents | w |
|---|---|---|---|
| Founding (queen alone) | 0 | 0 | |
| First workers (gd about 5) | 5-30 | same | 1 |
| End of year 1 | EST 500-3,000 | 100-300 | 1-10 |
| End of year 2 | EST 20,000-100,000 | 400-800 | 50-130 |
| Year 3+ (alate production) | EST 300,000-1,000,000 | 1,000-1,500 | 300-700 |
| Max | 2,000,000 | 1,500 | about 1,300 |

Check (arithmetic verified): 2,000,000 / 1,500 = 1,333; 300,000-1,000,000 / 1,000-1,500 = 200-1,000 (stated 300-700 is the central band); 20,000-100,000 / 400-800 = 25-250 (stated 50-130 is the central band). The 4-month A. sexdens field figure of about 120 workers [S7] supports first-year counts of order 100 at +4 months; the year-1 EST above is unsupported by any measured *A. texana* data.

Rules: the first 100 workers are individually simulated at w = 1; beyond that agents are promoted to represent a clump. Loads, damage and garden effects scale with w (each LU carried feeds the garden w real fragments). The possessed ant always has w = 1 (they are special cases). Brood is aggregated per chamber as counts, not agents. Gardens: up to 24 sim garden chambers (real excavated nest: 97), each representing about 4 real gardens at maturity.

Spatial compression (needed because 4,000 BU = 28 m for this species): game nest footprint 600-900 BU (about 4.2-6.3 m, ratio about 3.5-4:1), depth cap 400-500 BU (2.8-3.5 m, ratio about 2:1), foraging radius cap about 1,500 BU (about 10 m, ratio about 18:1 from 180 m), mounds up to 40 (not 1,000).

### 12.2 Parameter table (game-time values)

| Parameter | Real value | Game value | Status |
|---|---|---|---|
| BU | media 7 mm | 7 mm | binding |
| Body size | minim 0.35, small media 0.65, media 1.0, major 1.8, queen 2.6 BU | same | EST/analog |
| Incipient depth | 20-30 cm typical (10-30 cm range); *A. texana* specific NF | 35 BU (about 25 cm); corrected from 30 BU/15-25 cm | [S5, S6, S13] |
| Egg to minim / media / major | 45/55/65 d | 3.5/4.2/5.0 gd | EST |
| Claustral phase to first workers | 8-12 weeks (56-84 d) to first workers; 3-4 months (91-122 d = 7.0-9.4 gd) until workers open the nest to the surface [S7] | first workers eclose 4.3-6.4 gd, default 5 gd; nest open and first foraging at gd 7-9 | [S5, S7] |
| Queen mass at founding | 100% | UNSUPPORTED/EST: -30% by first workers (about gd 5), -25-35% further over 5 months (about 12 gd); recovers once workers forage. Real queen mass about 207 mg in *A. sexdens* [S7]; Mintzer 1987 percentages unverified | EST |
| Trophic egg fraction | "approximately 90 percent of this first brood" eaten by the queen | 90% of first brood; the decay to 0 by worker 20 is EST | [S1] (90%), EST (decay) |
| Fungus pellet | 1 pellet | 1 per queen; loss ends the colony | [S12] |
| Worker life | 1-2 y | 28-56 gd; forager 7-14 gd (3-6 months; corrected from 6-12) | [S2], EST |
| Queen life | 10-15 y | 280-420 gd | [S2] |
| Foraging air temperature | 7-27 C | active 7-27 C, peak 20-25 C; Q10 speed multiplier 4.1/2.3/1.5 | [S1, S9] |
| Summer rule | night only | no surface foraging above 27 C | [S1] |
| Walking speed | laden 20-32 mm/s (analog) | laden 5 BU/s at 25 C, unladen 10 BU/s (game convention 12) | EST |
| Cutting time | 25 s/mm at 25 C, 77 s/mm at 15 C (grass, *A. heyeri*, verified [S9]); a 1 mm cut width would be about 25 s | 8-15 s per fragment at 25 C; x3 at 15 C (the x3 matches 77/25 = 3.1). The 8-15 s is a deliberate EST below the grass analog (broadleaf cutting time NF) | EST, [S9] |
| Load ratio | burden (ant+load)/ant 1.2-1.5 (grass, [S9]), 2-3.5 in lab items, 7.5 max [S5]; i.e. load = burden - 1 | 1 LU = 1.5 x forager mass (burden 2.5); large carriers load up to 3 x mass (burden 4) | [S5, S9], EST |
| Trips/night | NF | 2-3 at 400-600 BU | EST |
| Hitchhikers | "about 50% of returning minims" UNVERIFIED (Feener & Moss 1990 not opened); minims standing on leaves to ward off phorids confirmed [S12] | 0-2 per carrier | EST, [S12] |
| Hitchhiker effect on fly success | "significant" (unverified) | EST -60% per hitchhiker | EST |
| Garden turnover | about 6 weeks (6 weeks = 42 d = 3.2 gd, arithmetic verified; source claim from [S2, S11] not re-opened) | 3.2 gd | [S2, S11] unverified |
| Garden growth | burst: 1.3 L in a week (lab, ad libitum feeding) [S5]; sustained first-year doubling about 45-65 d [S6] | sustained exp rate about 0.17 per gd (doubling about 4 gd; range 0.14-0.20), burst cap 0.47 per gd (doubling 1.5 gd) only while substrate-saturated; corrected from using 0.47 as the sustained rate | [S5], [S6], EST |
| CO2 safe/limit | under 2.8% healthy, about 5% bad | stress above 3%, damage above 5% | [S7, Tschinkel via S10] |
| Fungus temperature | 20-30 C ideal in vitro; ants choose 21-25 C when relocating fungus/brood [S5] | optimum 21-25 (aligned to [S5]; was 22-26), health penalty outside 18-30 (the 18/30 margins are EST) | [S5] |
| Fungus humidity | lab colonies kept at 23-25 C and 72-75% RH [S11] (husbandry setting, not a measured tolerance) | health loss below 60% RH is UNSUPPORTED (EST) | [S11] EST |
| Fungus protein tolerance | growth falls above about 20% protein; best about 60% carbohydrate | plant quality index | [S11] |
| Escovopsis prevalence | 6.6% at founding, about 60% at 1-2 y | outbreak chance per gd rises with colony age | [S12] |
| Nuptial flight window | April-June [S1, S2]; "more than a quarter inch" (6.35 mm) rain [S2] (TAMU gives no numeric threshold: wetter areas any time in spring, arid areas after heavy rain), clear, moonless night [S1] | gd 3-10 (April 1 = 2.4 gd elapsed, June 30 = 9.4 gd elapsed; corrected from 3-9), trigger when rain over 6.35 mm; the "previous 3 gd air temp over 15 C" condition is EST | [S1, S2], EST |
| Alates per year | thousands | 20-60 sim alates per flight (each = about 100 real) | EST |
| Queen count | 1, sometimes 2-5 | 1 default; 12% chance a second queen is adopted | [S1-S3], EST |

### 12.3 Economy rates (mature sim colony, 1,500 agents)

EST design rates (calibrate in headless balance runs): foragers 20-25% of agents (about 330); trips 2.5 per night; 1 LU per trip, about 800 LU per good night. Each full garden chamber uses 30-40 LU per gd; 24 chambers use about 840 LU/gd. Garden growth is limited by min(substrate, tender coverage). Tender coverage: 1 minim/small-media agent per 1 GU of the chamber (EST, no data). Nutrient flow: leaf quality index Q modifies garden growth; staphylae output feeds brood: 1 LU of good leaf gives 1 brood-day for 4 larvae (EST). Sap: foragers take 1 sap meal per trip (50% of energy), refilled at the plant. Fresh leaf gives energy to the forager; the garden takes the rest.

## 13. SIGNATURE MECHANICS

1. **The living garden (crop simulation).** State per garden chamber: biomass, health, contamination, substrate age gradient, temperature, RH, CO2. Inputs: processed leaf pulp, faecal enzyme, tending coverage, climate. Outputs: staphylae (larval and queen food), hyphae (tender feed), CO2. Failure: starvation of substrate, protein/toxin overload, heat above 30 C, CO2 above 5%, Escovopsis. The player visits gardens, tastes (diagnostics) and re-seeds with fragments from a healthy garden.
2. **Leaf-processing assembly line.** Fragment in, then licked clean (small media), cut to 1-2 mm, chewed to pulp, faecal-treated, inoculated, planted, tended, spent substrate removed. Bottlenecks: if cutters out-pace processors, a "leaf pile" accumulates at the entrance and decays, wasting loads. The player can possess any step; the diagnostic view shows the narrowest stage.
3. **Leaf selection and plant defence.** Each plant has quality (carbohydrate/protein) and defences (toxins, latex, tannin, trichomes). Foragers rate returns via the fungus with a lag of 1-3 gd; plants that hurt the garden are dropped (learned rejection) and trails abandoned. Failure: poisoned garden. Player: samples, scouts, rejects, lays trail marker "avoid".
4. **Cutting, carrying, vibration.** Cutting is a timed action (8-15 s) with a fragment-size choice; stridulation (visible vibration rings) recruits nearby foragers; heavier loads slow the carrier and attract more phorids. The player can cut as a media; the load choice trades trips for risk.
5. **Roads and the foraging front.** Trails are physical objects: cleared, widened by traffic, decaying after abandonment. Heavily harvested plants are defoliated and regrow over seasons, pushing the front outward; mounds appear along the road (crater-shaped mounds per TAMU; "crescent" was unsupported). Failure: road blocked by debris, rain washout, rival colony. Player: sets forage markers; majors clear debris.
6. **Phorid pressure and hitchhiker minims.** Flies arrive at fragments, success scales with exposure time and falls per hitchhiker; hit foragers die in a few game minutes (sim) and are lost; high pressure makes foragers abort cutting and flee. Defence: hitchhike minims, majors guard, travel at night. The player can ride as a minim.
7. **Hygiene, weeding and the refuse system.** Escovopsis spreads between chambers; weeders remove infected patches to detritus chambers, grooming lowers spore load, metapleural secretion/ bacteria adds protection. Refuse workers live in the heap, are shunned and short-lived. Failure: outbreak, unclean waste back-flowing. Player: quarantine a chamber (block tunnels), burn/relocate fungus, set waste chamber.
8. **Climate and ventilation.** Garden relocates between chambers by depth/temperature (21-25 C), nest turrets and shafts produce ventilated flow; rain closes openings and CO2 climbs; the nest architect digs ventilation shafts and turrets. The player digs vents, closes or opens turrets, moves the garden.
9. **Pellet founding and queen budget.** The player starts as a dealate queen with one pellet and a body-mass budget; trophic eggs trade brood for survival. Co-founding option (pleometrosis is documented in *A. texana* [S12]): two queens give a faster-growing garden and larger first worker force (evidence from the *A. laevigata* analog [S6], n = 1; Mintzer 1987 *A. texana* data unverified). Corrected: *A. texana* workers do NOT eliminate co-foundresses [S6]; the "workers kill all but one" dilemma belongs to *A. laevigata* and must not be the default *A. texana* rule. Suggested design: co-founders are tolerated (colony may keep 1-2 queens, ADW/Wikipedia "often 2"), with the trade-off being shared egg-laying and a higher Escovopsis/food burden, all EST.
10. **Mounds, deep nest and the nuptial flight.** Nest growth is a deep funnel with many chambers; alates are reared in the central cavity and fly on the right rainy night; a daughter-queen lineage option starts a new colony. Failure: no rain, cold night, rivals.
11. **Human control events.** Bait/insecticide: activity declines over 4-6 real weeks (28-42 d = 2.1-3.2 gd) and recurs about half the time within 4-6 real months (122-183 d = 9.3-14.0 gd; corrected from 9.2-13.8) [S1] (verified: "about half the time activity will return in 4 to 6 months"). In the sim: a bait placement poisons carried loads, the garden is contaminated with a lag, and the player can have workers reject baited leaves (learned rejection, as in mechanic 3) or abandon the trail.

## 14. Third-person actions per caste

| Caste | Actions the player can perform |
|---|---|
| Minim | crawl through narrow tunnels, tend garden (groom, weed, plant pulp), feed larvae with staphylae, hitchhike on a leaf fragment and fend off a fly, apply gland secretion |
| Small media | clean, cut, chew and inoculate leaf fragments; carry brood/fungus; dig; haul waste; short foraging |
| Media | cut leaves with a timed bite, stridulate, drink sap, carry a fragment, lay trail pheromone, follow or abandon a trail |
| Major | bite, block a tunnel, guard the trail, clear debris, dig large shafts, intimidate rivals |
| Queen | dig founding tunnel, plant pellet, lay eggs, eat trophic eggs, issue priorities and markers |
| Alate | fly on the nuptial flight, choose a site, shed wings and found |

## 15. Species choice check

| Candidate | Pros | Cons |
|---|---|---|
| *Atta texana* (primary) | Only US Atta; fits temperate forest/lawn/yard world with sandy/loamy soil; extensive nest excavation (Moser) and founding work; trail pheromone first identified here; huge colony and strong polymorphism; crater-shaped mounds are visually distinctive; pest events fit the human-activity model | Many parameters are analog or EST; mature spread (15-24 m) and range (180 m) must be compressed; 2 million workers need heavy scale-down |
| *Atta cephalotes* | Best-documented physiology and caste work; monogyne, 5 million | Tropical rainforest species; poor fit for pavement/house habitats; same scale problem |
| *Acromyrmex octospinosus* | Smaller colonies (few thousand to 200,000), less scale-down; visible Pseudonocardia; semi-claustral | Central American/Caribbean; less polymorphic; less spectacle |
| *Acromyrmex versicolor* | Sonoran desert in the SW US; polygynous; small workers (2-6 mm); dry grass; summer monsoon flights | Poorly documented; desert; low-impact visuals |

Recommendation: **keep *Atta texana***. It gives the most distinct playstyle for the roster, the best fit to the game's locality, and the richest documentation of nest architecture. Use A. cephalotes/sexdens/colombica literature to fill gaps. Consider *Acromyrmex* as a later "small colony, fully visible symbiont" variant, not a replacement.

## Verification log

Adversarial fact-check of 36 claims. Verdicts: CONFIRMED, CORRECTED (value fixed in the text above), UNSUPPORTED (not found in the cited source; relabelled EST or removed), UNVERIFIED (source could not be opened; kept but flagged). The web-search budget ran out during the check, so Mintzer 1987, Feener & Moss 1990, Nature 1971 and Waller could not be opened (publisher paywalls or blocked hosts); the existence of the first three was confirmed through Crossref metadata.

| # | Claim | Verdict | Source checked |
|---|---|---|---|
| 1 | Colony up to 2 million ants | CONFIRMED | https://citybugs.tamu.edu/?p=331 |
| 2 | Nest 50-80 ft across, chambers 15-20 ft deep, lateral tunnels 500 ft, foragers travel 600 ft+ | CONFIRMED | https://citybugs.tamu.edu/?p=331 |
| 3 | Mounds 5-14 in high, 1-1.5 ft wide | CONFIRMED (TAMU says "crater-shaped", one entrance per mound) | https://citybugs.tamu.edu/?p=331 |
| 4 | Mounds "crescent-shaped" | UNSUPPORTED, replaced by "crater-shaped" | https://citybugs.tamu.edu/?p=331 |
| 5 | Foraging at 45-80 F, summer almost exclusively at night | CONFIRMED | https://citybugs.tamu.edu/?p=331 |
| 6 | Flights April-June, clear moonless nights, >1/4 in rain | CONFIRMED for ADW; TAMU gives no numeric rain threshold | https://animaldiversity.org/accounts/Atta_texana ; https://citybugs.tamu.edu/?p=331 |
| 7 | About 90% of first brood eaten by the queen | CONFIRMED (wording "first brood", not "trophic eggs") | https://citybugs.tamu.edu/?p=331 |
| 8 | Bait: decline over 4-6 weeks, activity returns about half the time in 4-6 months | CONFIRMED; month conversion corrected to 9.3-14.0 gd | https://citybugs.tamu.edu/?p=331 |
| 9 | Queen life 13 y (A. cephalotes), 15.3 y (A. sexdens); workers 1-2 y | CONFIRMED (Wikipedia A. cephalotes says queens >20 y; Atta genus page says workers about 7 y) | https://animaldiversity.org/accounts/Atta_texana ; https://en.wikipedia.org/wiki/Atta_cephalotes ; https://en.wikipedia.org/wiki/Atta_(genus) |
| 10 | Worker size 3-18 mm (ADW/Wikipedia) | CORRECTED: ADW workers 3-12 mm (3-18 mm overall incl. queen); Wikipedia 3-18 mm | https://animaldiversity.org/accounts/Atta_texana ; https://en.wikipedia.org/wiki/Atta_texana |
| 11 | Founding tunnel 15-25 cm in A. texana | UNSUPPORTED; corrected to 20-30 cm generic Atta (10-30 cm range), game depth 30 -> 35 BU | https://en.wikipedia.org/wiki/Fungus-growing_ants ; https://pmc.ncbi.nlm.nih.gov/articles/PMC4022738 ; https://groups.csail.mit.edu/mac/projects/psyche/98/98-001.html ; https://pmc.ncbi.nlm.nih.gov/articles/PMC8523712 |
| 12 | Founding chamber 6 cm; entrance crater 5-8 cm | CONFIRMED (generic Atta; A. laevigata) | https://en.wikipedia.org/wiki/Fungus-growing_ants ; https://groups.csail.mit.edu/mac/projects/psyche/98/98-001.html |
| 13 | Digynous A. laevigata +3 month: 250 workers/200 mL vs "<100 workers/10-50 mL single-queen nests" | CORRECTED: the 10-50 mL/<100 workers are month-0 field values, not a +3-month comparison | https://groups.csail.mit.edu/mac/projects/psyche/98/98-001.html |
| 14 | Workers eventually kill co-foundresses (used for the playable species) | CORRECTED: observed once in A. laevigata; Mintzer says A. texana workers do not eliminate co-foundresses; mechanic 9 rewritten | https://groups.csail.mit.edu/mac/projects/psyche/98/98-001.html |
| 15 | Garden doubling about 19 d (rate 0.47/gd) | CORRECTED: [S6] implies about 45-65 d; sustained rate 0.17/gd, 0.47/gd kept only as a burst cap | https://groups.csail.mit.edu/mac/projects/psyche/98/98-001.html |
| 16 | 1.3 L garden in a week | CONFIRMED as a lab burst (ad libitum feeding, A. lundi study) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4022738 |
| 17 | Queen loses about 30% mass, then 25-35% more over 5 months (Mintzer 1987) | UNSUPPORTED/UNVERIFIED: abstract inaccessible; relabelled EST (paper itself exists, Crossref) | https://doi.org/10.1007/BF02223829 |
| 18 | First workers at 8-12 weeks; surface opening at 3-4 months; 4-month A. sexdens nests about 120 workers, 144 eggs, 207 mg queen, CO2 median 1.4% | CONFIRMED (value-to-variable mapping inferred); added gd 7-9 first-foraging note | https://pmc.ncbi.nlm.nih.gov/articles/PMC4022738 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC8523712 |
| 19 | About 2.5% of queens found colonies; 2.53%/10%/0.09% three-month survival | CONFIRMED | https://en.wikipedia.org/wiki/Leafcutter_ant ; https://en.wikipedia.org/wiki/Fungus-growing_ants |
| 20 | ">99.95% of Atta queens die in the first year" | UNSUPPORTED (not in either article), removed | https://en.wikipedia.org/wiki/Leafcutter_ant |
| 21 | Escovopsis 6.6% at founding, about 60% at 1-2 y | CONFIRMED | https://en.wikipedia.org/wiki/Leafcutter_ant |
| 22 | Bite force 800 mN = 2,600x body weight; A. laevigata soldier 16 mm, head 7 mm | CONFIRMED | https://en.wikipedia.org/wiki/Leafcutter_ant |
| 23 | A. heyeri cutting 25 s/mm (25 C), 77 s/mm (15 C); laden speed 20 mm/s (17 C), 32 mm/s (27.5 C); Q10 4.1/2.3/1.5/1.4 | CONFIRMED (grass analog; burden only 1.2-1.5) | https://pmc.ncbi.nlm.nih.gov/articles/PMC3052370 |
| 24 | Burden up to 7.5 | CONFIRMED, definition clarified: burden = (ant+load)/ant, so load up to 6.5x ant mass | https://pmc.ncbi.nlm.nih.gov/articles/PMC4022738 |
| 25 | Moser 2006: 97 gardens, 27 dormancy, 45 detritus cavities; shafts possibly 32 m; central winter cavity rears alates | CONFIRMED (abstract; total 169 is a sum, not reported) | https://research.fs.usda.gov/treesearch/24692 |
| 26 | Fungus chamber about 30 cm Atta / 50 cm Acromyrmex; ideal 20-30 C in vitro, ants choose 21-25 C | CONFIRMED | https://pmc.ncbi.nlm.nih.gov/articles/PMC4022738 |
| 27 | Fungus nutrition: 60% carbohydrate, staphylae 40% C / 30% protein, >20% protein harmful, Cu/Mn/Zn toxic at 60 mg/L | CONFIRMED (in vitro); humidity "health loss below 60% RH" UNSUPPORTED (paper only reports lab husbandry at 72-75% RH, 23-25 C) | https://pmc.ncbi.nlm.nih.gov/articles/PMC9292433 |
| 28 | Pseudonocardia vs Escovopsis: 54%, 12%, 45%, 11,500 spores, 80 mg | CONFIRMED with corrections (54.2%, 11.8%; 45.3% = 29/64 cross-species pairings; 11,500 per subcolony) | https://pmc.ncbi.nlm.nih.gov/articles/PMC3418327 |
| 29 | A. vollenweideri HW classes, 200-fold mass range, about 4-fold brain volume | CONFIRMED (mini 0.59-0.71, media 1.01-1.48, large 2.50-3.35 mm) | https://pmc.ncbi.nlm.nih.gov/articles/PMC4024300 |
| 30 | MMPC trail pheromone first identified from A. texana (Tumlinson 1971, Nature 234:348) | CONFIRMED citation (Crossref DOI 10.1038/234348b0, pp. 348-349); potency ~1 mg per 120,000 km trail added from [S13]; paper text not opened | https://api.crossref.org/works/10.1038/234348b0 ; https://en.wikipedia.org/wiki/Fungus-growing_ants |
| 31 | Foragers: A. vollenweideri carries leaves up to 150 m [S13] | UNSUPPORTED (not in S13), removed; TAMU 500 ft tunnels (about 152 m) confirmed | https://en.wikipedia.org/wiki/Fungus-growing_ants |
| 32 | Fungus gives hyphae at most 9% / staphylae 4-5% of worker energy | PARTLY CONFIRMED: staphylae 5% (lab); 9% hyphae UNSUPPORTED | https://en.wikipedia.org/wiki/Fungus-growing_ants |
| 33 | Hitchhikers: about 50% of returning minims; energy savings <10% (Feener & Moss 1990) | UNVERIFIED (paper not opened); qualitative behaviour confirmed | https://en.wikipedia.org/wiki/Leafcutter_ant ; https://doi.org/10.1007/bf00174021 |
| 34 | Refuse workers live half as long as peers | CONFIRMED | https://en.wikipedia.org/wiki/Atta_cephalotes |
| 35 | Attine nests accumulate CO2 up to 5%; early A. sexdens nests 1.4% | CONFIRMED (Tschinkel 2004 quoting Kleineidam & Roces 2000; "under 2.8% to 2 m" in A. vollenweideri not re-opened) | https://pmc.ncbi.nlm.nih.gov/articles/PMC528881 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC8523712 |
| 36 | Pleometrosis confirmed only in A. texana; A. cephalotes colonies up to 5 million; A. colombica 3.55 million | CONFIRMED | https://en.wikipedia.org/wiki/Leafcutter_ant ; https://en.wikipedia.org/wiki/Atta_cephalotes |

### Calendar and arithmetic consistency check (docs/01-design-seed.md: 1 gd = 10 real min; 28-gd year; 4 seasons x 7 gd; BU = 7 mm; world 4,000 BU)

- 365 d / 28 gd = 13.04 d per gd; factor 0.0767 gd per day: correct.
- Development 45/55/65 d = 3.45/4.22/4.98 gd: correct. Queen 10-15 y = 280-420 gd: correct. Worker 1-2 y = 28-56 gd: correct.
- Forager 3-6 months = 7-14 gd: FIXED (was 6-12).
- Claustral 56-84 d = 4.3-6.4 gd and 5 months = 11.7 gd: correct. Surface opening 3-4 months = 7.0-9.4 gd: added.
- Garden turnover 6 weeks = 3.2 gd: correct. Bait 4-6 weeks = 2.1-3.2 gd: correct; 4-6 months = 9.3-14.0 gd: FIXED (was 9.2-13.8).
- Flight window April-June with gd 1 = 1 March: gd 3-10: FIXED (was 3-9); spring = gd 1-7, so June flights are in early summer.
- Garden exp rate: ln 2 / (19 d = 1.46 gd) = 0.47 was arithmetically right but the 19 d input was wrong: FIXED to 0.17/gd sustained.
- BU conversions (7 mm): nest spread 15-24 m = 2,143-3,429 BU; depth 4.6-7.6 m = 657-1,086 BU; tunnel 150 m = 21,430 BU; mound 13-36 cm = 19-51 BU; all correct. Worker range 1.6-12.7 mm = 0.23-1.8 BU: FIXED (table had 0.2-2.6, which mixed in the queen).
- 4,000 BU x 7 mm = 28 m: correct. Footprint compression 2,143-3,429 / 600-900 BU = 3.6-3.8:1: FIXED in section 5 (was 4-5:1) and 12.1 (about 3.5-4:1). Foraging 180 m / 10.5 m = 17:1: correct.
- Worker agent weights: 2,000,000/1,500 = 1,333: correct; other rows are central bands of the ranges: noted.
- BU per cm for incipient depth: 25 cm = 36 BU; set to 35 BU.

### Residual uncertainty

- Mintzer 1987 (queen mass loss, grouped vs solitary success), Feener & Moss 1990, Waller (phorids), and the Nature 1971 text could not be opened. Their numbers are flagged as EST/UNVERIFIED.
- The A. texana founding depth, caste head widths, load sizes, and all year-1/2 colony growth counts remain analog-based EST.
- Several secondary-source statements (older centres 60-90 cm high; ADW armadillo predator; Moser 1967 area; development-time estimates) were not re-opened.

## Open gaps

- *A. texana*-specific head widths, load sizes, speeds and cutting times (NF).
- Atta worker development times by temperature (NF; EST).
- Plant defence compounds (general knowledge, not sourced).
- Sources not fully read: several Springer/PMC pages were blocked; numbers cited "via search" came from search summaries and should be verified.

## Sources

[S1] Texas A&M AgriLife Insects in the City, Texas leaf cutting ant: https://citybugs.tamu.edu/?p=331
[S2] Animal Diversity Web, *Atta texana*: https://animaldiversity.org/accounts/Atta_texana
[S3] Wikipedia, *Atta texana*: https://en.wikipedia.org/wiki/Atta_texana
[S4] Moser 2006, Complete excavation and mapping of a Texas leafcutting ant nest (Ann. Entomol. Soc. Am. 99:891-897): https://research.fs.usda.gov/treesearch/24692
[S5] Romer & Roces 2014, nest enlargement in leaf-cutting ants (PLoS ONE): https://pmc.ncbi.nlm.nih.gov/articles/PMC4022738
[S6] Mintzer 1991, Colony foundation in leafcutting ants: the perils of polygyny in *Atta laevigata* (Psyche 98:1-6): https://groups.csail.mit.edu/mac/projects/psyche/98/98-001.html
[S7] Sousa et al. 2021, CO2 in early *Atta sexdens* nests (Sci. Rep.): https://pmc.ncbi.nlm.nih.gov/articles/PMC8523712
[S8] Groh et al. 2014, brain size in polymorphic *Atta vollenweideri* workers: https://pmc.ncbi.nlm.nih.gov/articles/PMC4024300
[S9] Bollazzi & Roces 2011, *Acromyrmex heyeri* load size and speed (PLoS ONE): https://pmc.ncbi.nlm.nih.gov/articles/PMC3052370
[S10] Poulsen et al. 2009, Pseudonocardia vs Escovopsis: https://pmc.ncbi.nlm.nih.gov/articles/PMC3418327; Tschinkel 2004 nest architecture (CO2 aside): https://pmc.ncbi.nlm.nih.gov/articles/PMC528881
[S11] Crumiere et al. 2021, fungus nutrition and leaf choice (Ecol. Lett.): https://pmc.ncbi.nlm.nih.gov/articles/PMC9292433
[S12] Wikipedia, Leafcutter ant: https://en.wikipedia.org/wiki/Leafcutter_ant
[S13] Wikipedia, Fungus-growing ants: https://en.wikipedia.org/wiki/Fungus-growing_ants
[S14] Wikipedia, Acromyrmex: https://en.wikipedia.org/wiki/Acromyrmex
[S15] Wikipedia, *A. octospinosus*: https://en.wikipedia.org/wiki/Acromyrmex_octospinosus
[S16] Wikipedia, *A. versicolor*: https://en.wikipedia.org/wiki/Acromyrmex_versicolor
[S17] Wikipedia, *Atta cephalotes*: https://en.wikipedia.org/wiki/Atta_cephalotes
[S18] Wikipedia, Escovopsis: https://en.wikipedia.org/wiki/Escovopsis
[S19] Wikipedia, Atta (genus): https://en.wikipedia.org/wiki/Atta_(genus)

Via search summary only (not opened): Mintzer 1987 *A. texana* foundresses https://link.springer.com/article/10.1007/BF02223829; Quinlan & Cherrett 1979 https://data.zhenzhi.com/details/1/998603940; Littledyke & Cherrett 1976 https://cambridge.org/core/journals/bulletin-of-entomological-research/article/direct-ingestion-of-plant-sap-from-cut-leaves-by-the-leafcutting-ants-atta-cephalotes-l-and-acromyrmex-octospinosus-reich-formicidae-attini/AF32CE2FBBD06C93D5FC3DE8287B1777; Bass & Cherrett 1995 https://research.bangor.ac.uk/portal/files/20576500/null; Feener & Moss 1990 https://doi.org/10.1007/bf00174021; Roces & Hölldobler 1996 https://oadoi.org/10.1007/s002650050292; Kleineidam & Roces ventilation https://link.springer.com/article/10.1007/PL00001710; Halboth & Roces 2017 https://doi.org/10.1371/journal.pone.0188162; Hart & Ratnieks 2002 https://econpapers.repec.org/RePEc:oup:beheco:v:13:y:2002:i:2:p:224-231; Waller (USDA SRS) phorids of *A. texana* https://www.srs.fs.usda.gov/pubs/ja/ja_waller001.pdf; Mehdiabadi & Schultz 2009 https://antwiki.org/wiki/images/e/eb/Mehdiabadi_&_Schultz_2009.pdf; Dijkstra et al. 2023 size classes https://link.springer.com/article/10.1007/s00265-023-03344-4.
