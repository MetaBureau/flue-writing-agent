# RFC 0001: Align writing stages with an AI-era publishing workflow

- Status: Draft
- Date: 2026-09-17
- Author: Stew Milne
- Scope: `src/workflow.ts`, `src/main.ts`, `src/agents/write.ts`, `src/skills/`, `src/contract.ts`, `islands/WriteForm.tsx`

## Summary

The pipeline does reporting well and keeps essays to facts in the notes. It is thin on editing, has no checks or approvals before publication, and runs two stages in the wrong order. This RFC maps each stage to a traditional publishing workflow and proposes an order that keeps the notes-only rule. It adds a separate editor and fact-checker, citations, and human approval points.

## Current pipeline

`research → outline → drafts (3 tones) → pickDraft → style → extend → save`

The form and the CLI run the same stages. One provider and model (chosen in the form or with `--model`) runs every stage.

## Gap analysis

| Stage in code | Publishing equivalent | How close |
|---|---|---|
| — | **Commission / brief** (angle, audience, purpose, length) | **Missing.** The topic string is the whole brief. Only the word count is read from it (`wordCountFromTopic`). |
| `research` (`src/notes.ts`) | **Reporting** | **Partial.** Notes-only is sound discipline. But it runs one search, keeps at most 5 excerpts of 180 words each, never judges source quality, and has no primary sources. |
| `outline` | **Pitch / structure** | **Partial.** Sections must come from the notes. But the structure follows whatever material turned up, not an argument. There is no main point or opening, and the prompt bans an introduction or conclusion unless the notes contain one. |
| `drafts` + `pickDraft` | **Drafting** | **Weak.** Three drafts are written, but `pickDraft` takes the one whose tone matches the style. The other two are never read, so two of three calls are wasted. |
| `style` (`applyEditorialStyle`) | **Line edit / house style** | **Good fit.** `keepIfNotShortened` protects against a bad rewrite. But it merges line and copy editing, and no structural edit comes before it. |
| `extend` (`extendDraft`) | **Fit to length** | **Out of order.** Paragraphs are added after the style pass, so that text is never styled. `groundedInNote` only checks that at least 3 content words overlap with a note, which is not a fact check. |
| — | **Fact-check** | **Missing.** No claim is checked against its source. |
| — | **Attribution / citations** | **Missing.** The notes carry source URLs, but the essay never cites them. |
| — | **Headline, standfirst (summary line under the headline), SEO** | **Missing.** The outline title is used as the headline, unedited. |
| — | **Legal / ethics / originality** | **Missing.** Drafts are close rewrites of search excerpts, so copying too closely from a source is a real risk. |
| — | **Proofread / final approval** | **Missing.** Nothing stops for a person. |
| — | **Publish, corrections, versions** | **Missing.** The output file is named after the topic, so a later run on the same topic overwrites it. `## Style: <name>` is written into the essay itself. |

### What already fits the AI era

- **Grounding.** The notes are the only facts, Tavily's synthesized answer is excluded, and the prompts repeat "do not invent".
- **Rejecting bad model output.** Rejected expansions, the keep-if-not-shortened rule, and a fallback outline for bad JSON.

### What misses the AI era

1. **The writer checks itself.** One model runs every stage, so no second model catches its errors.
2. **Checking is word overlap, not claims.** Nothing links a claim to a source excerpt and URL.
3. **No person approves anything.** There is no approval of the brief or outline, and no sign-off before publication.
4. **No record of where facts came from.** No list of which sources support which paragraph, and no AI disclosure.
5. **The Monocle style works against the notes-only rule.** Its transformation says "add constructive framing", which invites invented optimism.

## Proposal

Target order:

```
brief → research → outline (+ human approval) → one draft in the target voice
→ structural edit (different model) → fact-check against sources, add citations
→ line/house-style edit (length fitted here)
→ headline + standfirst → proofread → human approval → publish (version + source list)
```

### Principles

- The notes stay the only source of facts. New stages may cut or cite, never add unsupported claims.
- The writer and the editor/fact-checker are different models by default.
- Every published claim traces to a source URL in the notes.
- A person approves before anything is published.

## Phased plan

### Phase 1: cheap fixes, no new stages

1. Run `extend` before `style`, so all text is styled.
2. Write one draft in the voice from `VOICE_FOR_STYLE` instead of three.
3. Stop writing `## Style:` into the essay. Keep style in metadata or front matter.
4. Make output filenames unique (slug plus timestamp or run id).
5. Remove "add constructive framing" from the Monocle transformation.

### Phase 2: fact-check and citations

1. Add a `factcheck` stage to `WRITE_STAGES` in `src/contract.ts` and to the form's stage list.
2. Split the draft into claims. Match each claim to a note excerpt and its URL, using a model other than the writer's.
3. Cut or flag unsupported claims. Emit a source list and inline citations.
4. Let the form and CLI choose separate writer and editor models.

### Phase 3: brief, packaging, approval

1. A brief: angle, audience, purpose and length, with the word count taken from the brief rather than the topic text.
2. A headline and standfirst stage.
3. Human approval after the outline and before publishing, in the form.
4. Saved versions and an AI-assistance disclosure line.

## Alternatives considered

- **Keep three drafts and have a model pick the best.** This gives real comparison, but costs three draft calls plus a judge. Deferred until the fact-check exists to score drafts.
- **Fact-check with lexical overlap only.** Cheap, but it cannot tell a supported claim from a reworded contradiction.

## Open questions

- Should the fact-checker cut unsupported claims itself, or flag them for a person?
- What citation format suits the target publications: inline links, footnotes, or a source list?
- Where does human approval live for the CLI: an interactive prompt or a saved draft to approve later?
- Does length fitting belong in the line edit (cut to fit) or in the structural edit?
