# RFC 0003: What counts as a high-quality essay

- Status: Implemented
- Date: 2026-09-18
- Revised: 2026-09-18
- Author: Stew Milne
- Scope: `src/critic.ts`, `src/cite.ts`, `src/brief.ts`, `src/agents/write.ts`, `src/agents/writer.ts`, `evals/`, `docs/rfcs/`

## Summary

RFC 0002 fixed how the pipeline handles evidence. This RFC says what a good
essay is, in three layers, and defines done.

The first cut stuffed Layer 2 architecture language (`operational bound`,
`committed policy`) into the plan and draft prompts for every brief. The
writer then produced essays that passed the critic by repeating those phrases.
That is the same Goodhart pattern the RFC was written to stop. This revision
keeps the critic's terms in the critic and the plan sidecar. The essay is
written for the brief's reader.

## The definition

A high-quality essay states one claim, supports it with evidence a reader can
check, answers the strongest objection to it, and leaves the reader able to say
in one sentence what it argued and why they should believe it. Everything below
serves that sentence.

## Prompt contract

The critic and the harness judge. The writer writes.

| Stage | Language |
| --- | --- |
| Plan (sidecar) | May name overflow, conflict, aging, or failure as what the system does. Must not use `operational bound` or `committed policy` in headings or purposes. Those purposes are pasted into the draft prompt. |
| Draft, expand, shorten, revise | The subject's diction. Architecture briefs state the failure rule as what happens, in the section, not as a labelled policy and not in a recap. |
| Critic | May use `operational bound` and `committed policy`. It is an editor, not a co-author. |
| Essay body | Must not contain critic jargon, process talk, or a heading named Introduction or Conclusion. |

Architecture guidance is appended only when the brief is architecture or
implementation. Frog, humour, and overview briefs must not receive it.

A constraint `No research required` (or equivalent) skips Tavily even on an
architecture brief. Architecture writing rules still apply. Do not invent
figures or quotes to fill the gap.

## Layer 1: invariants the harness enforces

Deterministic, countable, and all failures block the save unless `keepOnFail`.
These exist to keep the essay honest, not to make it good.

1. Every statistic, date-bearing fact, quotation, and attributed claim carries a note id.
2. Every note id cited exists, and its quote appears in the extracted article.
3. No unquoted run of 8+ words shared with a source.
4. Quoted words stay under 15% of the body.
5. Body length is within 85–115% of the target. The target is the requested
   count, including `1500-word` and `1500 words`. The form length select still
   overrides a count in the topic.
6. The Sources list contains exactly the notes cited in the body.
7. The body is the essay, not the pipeline: no source URL, markdown link, call
   to action, process sentence, critic jargon (`operational bound`, `committed
   policy`, `committed decision rule`), or heading named Introduction or
   Conclusion.

A year used as the essay's own timeframe is not a figure and needs no citation.
A figure needs one only when it carries a fact.

## Layer 2: the rubric the critic judges

Pass/fail, judged by a strong model that sees the brief, the notes, the plan,
and the cited draft. These cannot be counted, which is why they are judged
rather than coded. The critic judges as the brief's intended reader, not as a
checklist that prefers a pass.

1. **Claim.** The opening states one arguable claim. A reader can quote it.
2. **Advance.** Every section moves that claim forward. No section is a source
   summary. When the brief asks for architecture or implementation, a section
   that names a mechanism without saying what happens on overflow, conflict,
   aging, or failure has not moved the claim. That rule must be the failure
   mode of that mechanism, stated as what the system does. A timeout or
   fail-open policy does not satisfy overflow of what the mechanism returns.
   Naming alternative policies and leaving the choice open does not pass. If
   the plan named a rule for a section, answering a different failure mode
   does not pass. `planBoundProblems` still fails advance on that leftover
   even if the critic model passed.
3. **Objection.** The strongest counter to the claim is stated at full strength
   and answered with a mechanism, not named and dropped. Use the notes when
   they supply that counter. If there are no notes, use the objection a
   competent reader of this brief would raise.
4. **Fidelity.** No source is used against its own argument. Stance and date
   are respected.
5. **Voice.** The essay explains in its own words, for the brief's reader.
   Quotation is used where the wording itself is the evidence. Fail if the
   diction is the critic's (`operational bound`, `committed policy`) or if a
   section is the plan purpose copied into prose.
6. **Audience.** Diction, assumed knowledge, and spelling match the brief's
   reader. An empty audience defaults to a general reader, or a technical
   reader on an architecture brief.
7. **Takeaway.** The close answers the claim with new force. It does not
   summarise the sections, sit under a heading named Introduction or
   Conclusion, or retreat into "the evidence does not resolve this".
8. **Silence about process.** Fail only a sentence that discusses the notes,
   the sources as a set, the research, or the essay itself. A sentence about
   the subject passes. Gaps belong in the sidecar.

Do not judge word count as a miss. Layer 1 already owns length.

## Layer 3: the brief contract

The brief is the rulebook; stage rules are defaults. Where they conflict, the
brief wins.

- A brief without a claim gets one. The plan proposes a claim the notes can
  support and records it in the sidecar. An essay with no claim is a fail, not
  a neutral survey.
- A brief without a purpose defaults to persuading the stated audience of the
  claim.
- A brief without an audience defaults as in Voice above.
- Only the brief can require humour, and nothing else may demand it.
- Research must reach a floor of substantive notes before planning: 6 for
  500–1000 words, 8 through 2000, 10 above that. Below the floor, re-query with
  the plan's gap list. Encyclopaedias and live blogs count toward the floor but
  cannot be the only support for a section.
- `No research required` skips research. Still draft. Still do not invent
  statistics, studies, quotes, or sources.

## Banned failure modes

Each was observed in a saved run. A new rule is only warranted when an eval
reproduces one of these, and it belongs in Layer 2 unless it is genuinely
countable.

- Sidebar, navigation, or related-links text used as evidence.
- A source's stance inverted.
- A quotation or figure presented without its attribution or its date.
- Quote mosaic: a body assembled from quotations joined by attribution verbs.
- Refusal to conclude when the notes support a conclusion.
- Any sentence about the research process.
- Critic jargon in the essay body (`operational bound`, `committed policy`).
- A heading named Introduction or Conclusion.
- Architecture prose that lists three policies and leaves the choice open.
- Plan and draft prompts that carry architecture instructions on a brief that
  is not architecture.

## The eval set

Frozen briefs, committed. They change only by RFC.

1. **Contested, long.** "Elites and politics in Australia in 2026. Readers are
   people who do not understand the concept of elites. Purpose: an introductory
   overview of how these elites operate. Claim: politics in Australia is defined
   by elites rather than by democracy. 2000 words." Exercises stance fidelity,
   page clutter, an opinion blog.
2. **Simple, short.** "Pet frogs are small amphibians. Write 500 words for a
   general reader explaining whether they make good pets." Exercises the quote
   budget and the section cap at short length. Must not receive architecture
   prompt language.
3. **No claim given.** "Australian housing affordability in 2026. 1200 words
   for a general reader." Exercises Layer 3: the plan must propose a claim.
4. **Tone required.** "A 900-word comic essay for office workers on why
   meetings multiply." Exercises humour on request, and that nothing else
   demands it.
5. **Architecture, bounds.** "Write 1200 words for backend engineers on
   dual-database architecture for serverless web applications: a centralized
   relational database versus an edge database. Cover write-through caching,
   eventual consistency, and cost. Claim: the pattern outperforms either store
   alone only when writes have one authority, unread edge data expires, and a
   cost threshold can reject the pattern." Exercises research on an architecture
   brief, one failure rule per mechanism in the system's language, objection,
   and that critic jargon does not appear in the body.

## Done

The pipeline ships when every eval brief passes all Layer 1 invariants and all
eight Layer 2 rubric items, scored by the critic and spot-checked once by a
human.

Until then, the loop is: run the set, fix only what fails, rerun. No prompt
rule is added without an eval that fails first, and no eval is retired because
it is inconvenient. Do not add architecture language to a non-architecture
prompt to chase a one-off commission.
