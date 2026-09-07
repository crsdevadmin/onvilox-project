# Nutrition, Cancer and Muscle Mass — evidence map

**Source:** *Oncology Nutrition in Focus — "Nutrition, Cancer, and Muscle Mass: The Impact of Nutritional Intervention During the Oncological Journey."* Carla Prado, PhD, RD (University of Alberta). Nestlé Health Science, August 2026. Marked *Communication for Healthcare Professionals Only*.

This is a summary of the argument and its cited evidence, plus a mapping onto what Gquence already captures. It is deliberately not a transcription — the booklet is a copyrighted Nestlé publication. Claims are paraphrased; the reference numbers below are the booklet's own, so anything here can be traced back and cited directly from the primary papers rather than from the booklet.

---

## 1. The argument, in five steps

**Step 1 — Low muscle mass is common and treatment accelerates it.**
Prevalence roughly 30–60% depending on cancer type and stage. Treatment can accelerate muscle loss to rates up to 24× those of natural ageing. *(ref 1 — Ryan & Sullivan, Proc Nutr Soc 2021;80:73-91)*

**Step 2 — Weight monitoring alone will not find it.**
Low muscle mass occurs at any body weight, including normal weight and obesity, and can hide behind an apparently stable weight. *(ref 2 — Brown et al, Am J Clin Nutr 2021;113:1482-1489)*

**Step 3 — Muscle is a metabolic organ, not just structural.**
Beyond movement, balance, posture and strength: amino acid reserve, glutamine production, myokine production — feeding immune function, glycaemic regulation, lipolysis, bone mineralisation, appetite/BDNF and endothelial function. *(ref 3 — Prado et al, Lancet Diabetes Endocrinol 2024;12:785-787)*

**Step 4 — Low muscle mass changes how chemotherapy behaves.**
Muscle is a major component of lean mass and influences drug distribution, metabolism and clearance. Associated with dose-limiting toxicity: treatment delay, dose reduction, discontinuation, hospitalisation, death. Mechanisms cited include altered liver metabolism, changed renal blood flow and reduced GFR. Patients with low muscle mass show a higher prevalence of severe toxicity. Trials are underway on dosing chemotherapy by body composition. *(refs 4-8 — Daly, Proc Nutr Soc 2018;77:135-151 · Surov, Clin Nutr 2021;40:5298-5310 · Prado, Ann Med 2018;50:675-693 · Prado, Curr Opin Clin Nutr Metab Care 2015;18:535-51 · Assenat, J Clin Oncol 2023;41:92 abstract)*

**Step 5 — Intervene early, because loss is fast and rebuilding is slow.**
The booklet's central image: muscle loss behaves like a forest fire — rapid destruction, slow reforestation. *(ref 9 — Prado et al, J Cachexia Sarcopenia Muscle 2021;12:3-8)*. Interventions reaching adequate energy and protein targets reduce mortality risk and improve function and quality of life. *(refs 10, 11 — Prado, Am J Clin Nutr 2013;98:1012-9 · Bargetzi, Ann Oncol 2021;32:1025-1033)*

---

## 2. The numbers worth quoting

From the systematic review and meta-analysis of protein supplementation (≥10 g protein per serving, versus control) — *ref 12, Orsso et al, Am J Clin Nutr 2024;120:1311-1324*:

| Outcome | Result |
|---|---|
| Muscle mass | reduced loss in **11 of 13** trials |
| Muscle strength | improved in **6 of 6** trials |
| Physical performance | improved in **3 of 3** trials |

Headline effects claimed for protein supplementation: mitigates weight loss, improves muscle strength, reduces hospitalisation rates during oncologic therapy.

**The dose-response figure is the most useful single number in the document:** in secondary analysis, each **1 g/kg/day increase in protein intake was associated with a 1.6% gain in muscle mass**.

Other nutrients cited: fish oil for preventing muscle mass loss *(ref 14 — Prado, J Cachexia Sarcopenia Muscle 2020;11:366-380)*; leucine and related amino acid derivatives as anabolic stimuli; vitamins and minerals for energy metabolism and muscle health. Exercise is described as synergistic in a multimodal approach.

**The qualitative finding, which is the commercial opening:** muscle loss causes intense feelings of weakness and dependency; patients value nutrition but report a lack of *practical, individualised* guidance. *(refs 15, 16 — Kiss et al, PLoS One 2024;19(7):e0304003 · Ford et al, Support Care Cancer 2024;32(7):418)*. A 12-week trial found individualised nutrition counselling substantially increased protein intake.

---

## 3. Where Gquence already lines up

This matters because the alignment is unusually close — the platform was not built from this booklet, yet it measures most of what the booklet says to measure.

| The booklet's claim | What Gquence already does |
|---|---|
| Weight monitoring alone misses low muscle mass | Captures **MUAC, hand grip, SMI and a MUST screen** alongside weight, at baseline and weekly. This is the single strongest point of alignment. |
| Protein supplementation at **≥10 g per serving** | The formula delivers **~13 g protein per serving**, three servings a day — above the meta-analysis threshold. |
| **1 g/kg/day → 1.6% muscle mass gain** | Protein is prescribed **per kg** (1.4–2.0 g/kg by risk tier, capped at 0.8 for renal per KDIGO), and delivered-vs-target is now tracked, so achieved g/kg/day is computable per patient. |
| Fish oil prevents muscle mass loss | Omega-3 powder in the formulation; **EPA 2.2 g/day** in the micronutrient orders. |
| Leucine and derivatives stimulate anabolism | **Leucine 5 g/day**, plus HMB and BCAA, in the micronutrient table. |
| Vitamins and minerals support muscle health | Full micronutrient support table with ICMR-NIN / FSSAI dose basis. |
| Patients lack **practical, individualised** guidance | This is the product's core thesis — per-patient targets recalculated weekly, with a patient sheet reachable by QR from the pack. |
| Early intervention beats rebuilding | Enrolment at diagnosis with weekly recalculation is exactly this workflow. |

---

## 4. The gaps — what the booklet measures that you don't

**Hospitalisation and treatment interruption — you capture this and were throwing it away.**
The weekly review has a *Treatment Interruptions* field with exactly the booklet's endpoint vocabulary: None, Dose Delay, Dose Reduction, RT Interruption, Treatment Held, **Hospitalisation**. It was recorded every week and never appeared in any export — the server never referenced the field. It is now a column on the Weekly sheet. This is the outcome the whole muscle-mass literature turns on, and you have been collecting it since the pilot began.

**Muscle mass itself is measured once.**
SMI is captured at baseline and never repeated, so the platform cannot show a change in muscle mass — the primary outcome in the meta-analysis. Grip and MUAC are repeated weekly and are reasonable proxies, but they are not the same measure.

**Physical performance is not captured at all.**
The meta-analysis reports 3 of 3 trials improving. There is no gait speed, timed up-and-go, or six-minute walk in the system. Grip is strength, not performance.

**Toxicity grading exists but is not analysed.**
CTCAE grades for mucositis, dysphagia, xerostomia, nausea and diarrhoea are captured per patient. Nothing correlates them with muscle or intake, which is the association the booklet spends two pages on.

---

## 5. What I would do with this

1. **Report treatment interruptions and hospitalisations by muscle status.** You now have both sides — grip/MUAC/MUST and the interruption field. Even in a 46-patient single-arm pilot, "patients whose grip fell had more dose delays" is the finding a tumour board will react to, and it is the exact claim this booklet is built on.
2. **Add achieved protein in g/kg/day to the dataset.** You have delivered protein and you have weight. That converts your intake figure into the same unit as the 1.6%-per-g/kg dose-response, which is the only way to compare your cohort against the published effect.
3. **Repeat SMI, or say plainly that you don't.** If muscle mass is the outcome, measuring it once is a real limitation. Either schedule a repeat CT-derived SMI at completion, or state in the deck that grip and MUAC are standing in for it.
4. **Use the references, not the booklet.** Every claim above traces to a primary paper. Citing Orsso 2024 or Prado 2021 directly is defensible in a hospital meeting; citing a manufacturer's brochure is not.
