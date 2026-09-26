# Retrospective: two days to a quality essay pipeline

- Date: 2026-09-18
- Author: Stew Milne
- Status: For discussion
- Related: `docs/rfcs/0002-attributed-notes-one-draft-one-critic.md`, `docs/rfcs/0003-essay-quality-spec.md`

## Summary

The Flue writing agent took two days to move from essays that were unusable to essays that
are honest but still not what "high quality general essay writer" means. The pipeline code
improved substantially in that time. The process around it did not, and that is where the
frustration came from.

Three causes, in order of how much time they cost:

1. **An architectural defect destroyed source provenance before any writing began.** It was
   invisible from the output, so it survived roughly fifteen commits of symptom fixes.
2. **Nothing defined what a good essay is.** Every quality problem was therefore fixed as a
   new mechanical rule, and each rule deformed the prose somewhere else.
3. **The review loop had no fixed inputs and no acceptance criteria.** Each round reviewed a
   different essay from a different brief, so improvement could not be measured and the work
   felt circular even when it was not.

## What the artifacts show

| Run | Date | Outcome |
| --- | --- | --- |
| `elites-and-politics-in-australia-in.md` | 17 Sep | 2291 words. Sidebar headlines used as evidence, a source's argument inverted, uncredited copying, a 20-year-old statistic presented as current, a quip bolted onto nearly every paragraph. Checker reported "41 cited · 0 unsupported". |
| `pet-frogs-are-small-amphibians-write.md` | 18 Sep | 500 words, inline citations, real counter-argument. But 164 of 500 body words inside quotation marks, seven headings, one outlet name that did not match its domain. |
| `elites-and-politics-in-australia-in.md` | 18 Sep | 1744 words, 0.63% quoted, source stances intact, stale figures dated. But no claim stated, three sentences discussing its own research notes, six sources of mixed authority. |

The second and third runs are not regressions. They are the same missing specification
surfacing in new places.

## Cause 1: provenance was destroyed before drafting

`writerFacts()` in `src/agents/write.ts` stripped every `Source:` and `URL:` line from the
research notes, then dealt the remaining sentences out one per source in rotation. Every
writing stage received that output: drafts, synthesis, the weave loop, the style pass, and
the brief revision.

The writers therefore could not know who said a thing, what a source was arguing, how old a
fact was, or whether a sentence came from an article or its sidebar. Four of the worst
defects in the 17 September essay follow directly:

- The Lowy Institute argues political elites are necessary and that public opinion often
  tracks elite positions. The essay used its line about legitimacy to argue the opposite.
- Robert Maynard Hutchins' line on the death of democracy appeared as the essay's own prose.
- A 2006 party-membership figure was presented as evidence about 2026.
- The Nexus Group consultancy's "Latest News" sidebar became a paragraph of analysis.

Two compounding factors sat alongside it. Research requested snippets rather than article
text (`include_raw_content: false`, `chunks_per_source: 3`), so each source arrived as three
query-matched fragments of at most 500 characters — which is why headlines outranked
article body. And the essay was rewritten up to twelve times per run (three drafts, a merge,
up to six weaves, a style pass, a revision), with each pass further from the sources.

RFC 0002 fixed all of this: full-article extraction with snippet fallback, structured notes
carrying id, URL, author, outlet, date, stance and quotes, one draft instead of twelve
rewrites, and a harness rejecting uncited figures, missing note ids and unquoted copying.
The 18 September elites run confirms it: Lowy is cited as `[n4]` with its actual argument
used as a complication of the thesis, and no sidebar text appears.

## Cause 2: quality was never specified, so it was encoded as counters

With no definition of a good essay, each review produced defects and each defect became a
rule the code could count. Counters are proxies, and optimising a proxy deforms whatever
sits next to it:

| Rule | Consequence |
| --- | --- |
| Ban invented facts and unattributed copying | Frogs essay: a third of the body in quotation marks |
| Cap quoted words at 15% | Elites rerun: hedged paraphrase that asserts nothing |
| Require a citation on every figure | The year `2026` demanded a citation |
| Ground every claim in the notes | The essay began narrating its own note inventory |

One rule was simply wrong. `BRIEF_CHECK_RULE` in `src/brief.ts` contained "A pass needs
actual wit" as a standalone sentence, so a checker applied it to an introductory explainer
with no tone specified. The revision then added a quip to the end of nearly every paragraph.

By the end, quality lived in roughly forty regexes, a long `src/AGENTS.md` contract, and
prompt rule lists — a specification written one symptom at a time, in the wrong place, by
whoever reviewed the most recent essay.

## Cause 3: the review loop had no fixed inputs and no finish line

- **The briefs changed between runs.** The 17 September elites brief carried a claim, an
  audience and a purpose. The 18 September rerun was "Elites and politics in Australia in
  2026. Write 2000 words for a general reader" — no claim, no purpose. Most of the hedging
  in the rerun follows from that. Changing the pipeline and the brief together means no
  comparison is valid.
- **No acceptance criteria existed.** Any essay can be criticised, so every review generated
  a new defect list, and the lists never converged.
- **The reviews stayed at the defect level.** Each turn asked for a review of an essay and
  got exactly that, when what was needed after the first round was a specification. This is
  the single largest contributor to the sense of going in circles, and it is my error rather
  than the pipeline's.
- **Research quality caps essay quality.** The 18 September run had six sources: Wikipedia,
  a live blog, an op-ed, a press release, Lowy, and a German constitutional law blog. No
  writer produces an authoritative 2000-word essay from that base. The pipeline is now
  honest about thin evidence, which is why the prose reads cautious.

## What is fixed and verified

Confirmed by running the tests and reading the saved artifacts on 18 September:

- 34 tests pass, `deno lint` clean across 30 files, typecheck clean.
- Elites rerun: 1744 words body (inside 85–115% of 2000), 11 quoted words (0.63%), five
  argument sections, six cited notes, $0.396.
- Source stances preserved; the Lowy finding is used as counter-evidence rather than
  inverted.
- Stale figures are dated in the body (2006 membership, 2022 republic polling).
- No unattributed copying, no sidebar text, no body links.

## What remains

1. **No claim.** A brief without a claim yields a survey that refuses to conclude. The plan
   stage must propose a claim the notes support.
2. **Sentences about the research.** Three in the last run ("the notes here do not detail…").
   The rule that cut these lived in `src/skills/editorial.ts`, deleted during the rebuild.
   It belongs in the critic.
3. **Thin source base.** Set a floor of substantive notes before planning — 6 for short,
   8 through 2000 words, 10 above — and re-query using the plan's gap list when short.
4. **The year-citation bug.** A year is a figure only when it carries a fact, not when it is
   the essay's timeframe.
5. **Sidecar verification.** The sidecar fix (`96719fe`, 08:22:48) landed after the last
   saved run (08:21:24), so it is committed but unverified by any artifact.

## What needs to happen now

**1. Specification before rules.** `docs/rfcs/0003-essay-quality-spec.md` now defines a
high-quality essay in three layers: seven countable invariants the harness blocks on, an
eight-item rubric a strong critic judges (claim, advance, objection, fidelity, voice,
audience, takeaway, silence about process), and a brief contract that supplies a claim when
the brief omits one. Quality that cannot be counted is judged, not coded.

**2. A frozen eval set.** Four briefs committed to the repo: contested and long, simple and
short, no claim given, tone required. They change only by RFC. This is what makes "better"
measurable rather than a matter of whose turn it is to read an essay.

**3. An eval runner.** One command runs the four briefs, applies the invariants and the
rubric, and prints a pass/fail table. Fix only what fails. Rerun.

**4. Two process rules.**
- No prompt rule is added without an eval that fails first. Every rule in the pipeline today
  exists because someone reviewed one essay.
- Inputs stay frozen while the pipeline changes. One variable at a time.

**5. Definition of done.** All four briefs pass all seven invariants and all eight rubric
items, with one human spot-check. Ship at that point rather than at the end of the next
review.

## The cost of the lesson

Two days and about twenty commits, of which roughly fifteen were symptom fixes that the
RFC 0002 rebuild then deleted. The rebuild itself took one session and produced a working
pipeline at $0.19–$0.40 per essay. The expensive part was not the code. It was fixing
outputs for a day and a half without a specification to fix them against.
