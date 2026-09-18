# RFC 0003: What counts as a high-quality essay

- Status: Implemented
- Date: 2026-09-18
- Author: Stew Milne
- Scope: `src/critic.ts`, `src/brief.ts`, `src/agents/write.ts`, `evals/`, `docs/rfcs/`

## Summary

RFC 0002 fixed how the pipeline handles evidence. It did not say what a good essay is.
Because nothing defined that, every quality problem was fixed as a new mechanical rule,
and each rule bent the prose somewhere else:

| Rule added | Failure it produced | Run |
| --- | --- | --- |
| Ban invented facts and unattributed copying | A third of the body in quotation marks | `pet-frogs-are-small-amphibians-write` |
| Cap quoted words at 15% | Hedged paraphrase that asserts nothing | `elites-and-politics-in-australia-in` (18 Sep) |
| Require a citation on every figure | The year `2026` demanded a citation | same |
| Ground every claim in the notes | The essay narrated its own note inventory | same |

The pattern is Goodhart's law. Countable proxies are not quality, so optimising them
deforms the prose. This RFC specifies quality once, in three layers, and defines done.

## The definition

A high-quality essay states one claim, supports it with evidence a reader can check,
answers the strongest objection to it, and leaves the reader able to say in one sentence
what it argued and why they should believe it. Everything below serves that sentence.

## Layer 1: invariants the harness enforces

Deterministic, countable, and all failures block the save. These exist to keep the essay
honest, not to make it good. Most are already built (RFC 0002).

1. Every statistic, date-bearing fact, quotation, and attributed claim carries a note id.
2. Every note id cited exists, and its quote appears in the extracted article.
3. No unquoted run of 8+ words shared with a source.
4. Quoted words stay under 15% of the body.
5. Body length is within 85–115% of the target.
6. The Sources list contains exactly the notes cited in the body.
7. No source URL, markdown link, or call to action in the body.

A year used as the essay's own timeframe is not a figure and needs no citation.
A figure needs one only when it carries a fact.

## Layer 2: the rubric the critic judges

Pass/fail, judged by a strong model that sees the brief, the notes, and the cited draft.
These cannot be counted, which is precisely why they are judged rather than coded.

1. **Claim.** The opening states one arguable claim. A reader can quote it.
2. **Advance.** Every section moves that claim forward. No section is a source summary.
3. **Objection.** The strongest counter-evidence in the notes is stated at its full
   strength and answered, not noted and dropped.
4. **Fidelity.** No source is used against its own argument. Stance and date are respected.
5. **Voice.** The essay explains in its own words. Quotation is used where the wording
   itself is the evidence.
6. **Audience.** Diction, assumed knowledge, and spelling match the brief's reader.
7. **Takeaway.** The close answers the claim. It does not summarise the sections or
   retreat into "the evidence does not resolve this".
8. **Silence about process.** No sentence discusses the notes, the sources as a set, the
   research, or the essay itself. Gaps belong in the sidecar.

## Layer 3: the brief contract

The brief is the rulebook; stage rules are defaults. Where they conflict, the brief wins.

- A brief without a claim gets one. The plan proposes a claim the notes can support and
  records it in the sidecar. An essay with no claim is a fail, not a neutral survey.
- A brief without a purpose defaults to persuading the stated audience of the claim.
- Only the brief can require humour, and nothing else may demand it.
- Research must reach a floor of substantive notes before planning: 6 for 500–1000 words,
  8 through 2000, 10 above that. Below the floor, re-query with the plan's gap list.
  Encyclopaedias and live blogs count toward the floor but cannot be the only support
  for a section.

## Banned failure modes

Each was observed in a saved run. A new rule is only warranted when an eval reproduces
one of these, and it belongs in Layer 2 unless it is genuinely countable.

- Sidebar, navigation, or related-links text used as evidence.
- A source's stance inverted.
- A quotation or figure presented without its attribution or its date.
- Quote mosaic: a body assembled from quotations joined by attribution verbs.
- Refusal to conclude when the notes support a conclusion.
- Any sentence about the research process.

## The eval set

Frozen briefs, committed. They change only by RFC.

1. **Contested, long.** "Elites and politics in Australia in 2026. Readers are people who
   do not understand the concept of elites. Purpose: an introductory overview of how these
   elites operate. Claim: politics in Australia is defined by elites rather than by
   democracy. 2000 words." Exercises stance fidelity, page clutter, an opinion blog.
2. **Simple, short.** "Pet frogs are small amphibians. Write 500 words for a general
   reader explaining whether they make good pets." Exercises the quote budget and the
   section cap at short length.
3. **No claim given.** "Australian housing affordability in 2026. 1200 words for a general
   reader." Exercises Layer 3: the plan must propose a claim.
4. **Tone required.** "A 900-word comic essay for office workers on why meetings
   multiply." Exercises humour on request, and that nothing else demands it.

## Done

The pipeline ships when every eval brief passes all Layer 1 invariants and all eight
Layer 2 rubric items, scored by the critic and spot-checked once by a human.

Until then, the loop is: run the set, fix only what fails, rerun. No prompt rule is added
without an eval that fails first, and no eval is retired because it is inconvenient.
