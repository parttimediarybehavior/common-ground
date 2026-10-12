# Casebook module contract

`cases.js` exports `createCaseBook()` returning an array of five case objects, and `judgeCase(caseObject, attempt)` returning `{correct:boolean, feedback:string}`. `attempt` is `{hypothesis:string, prediction:string, evidence:string[], tested:boolean, testId:string, testedIds:string[]}`. Validation accepts a correct cause, an accurate current interpretation of the selected experiment, an appropriate pair of evidence IDs, and inspected causal reconstruction. Initial forecasts may be uncertain or wrong; revision retains both their record and observed results. No timers or penalties.

Case shape:

```
{
 id, title, subtitle, question, brief, rules:string[],
 clues:[{id,title,day,body,rows?:[{label,value}],location?:{x,y}}],
 hypotheses:[{id,label}], predictions:[{id,label}],
 map:{width:24,height:16,cells:[{x,y,terrain,resource}],markers:[{x,y,label}],bridge:{x,y,open,repair,required}},
 reconstruction:{prompt,options:[{id,label,prompt,unchanged:string[],result:{heading,body,facts:[{label,value}],visual:{subject,recorded:Frame[],replay:Frame[]}},correctPrediction}]},
 solution:{hypothesis,prediction,requiredTests:string[],evidencePairs:string[][],explanation,timeline:string[]},
 getComparison:(testId?)=>({format:'common-ground-comparison',version:1,scenario:'none',baseline,experiment})
}
```

`Frame` is `{day,x,y,food,wood,bridgeOpen,bridgeRepair}` for the tracked subject (Orin, Kit, Ada, Moss or Hana). Both arrays include the common starting day and every subsequent replay day. Frames are sampled directly from independently cloned engine worlds; no interpolation invents actions or supplies. They are evidence exposed only after the selected test is inspected. A day slider may compare both branches at the same recorded day, with trails stopping there. Physical states can match in position while differing in food/wood or crossing progress.

Bodies/values are plain text. Clues and maps are player-visible. The source objects may contain solutions for client-side grading, but the normal DOM MUST NOT expose `solution`, `correctPrediction`, `requiredTests`, raw world actions/events, omitted-work/report logs or unapplied intervention settings before resolution. Chosen experiment prompts describe the player's deliberate intervention; they are not evidence of its outcome. A reconstruction's result is available after the player records a forecast (including uncertain). Memory causality cannot be inferred just from two gifts or a retained-state replay. Every option runs the actual engine from the same physical checkpoint with conservation checked. Downloads after resolution use the selected test ID; omitted ID returns the canonical causal comparison for tools/tests.

Selectable tests: detour `withhold-report`, `retain-report`; crossing `omit-kit`, `omit-ada`, `omit-dara`, `rain-only`; meal `forget-ivo`, `forget-ada`, `retain-memory`; harvest `omit-gift-workday`, `forget-ivo-ada`, `forget-ada-ivo`, `retain-history`; window `through-40`, `through-39`. Current final predictions refer to observable outcomes, independent of the selected intervention. A retained-state control does not replace inspection of the selective causal intervention. The historical initial prediction remains visible when the current conclusion changes.

Case IDs: `detour`, `crossing`, `meal`, `harvest`, `window`. Titles: The Detour, The Crossing, The Extra Meal, The Untaken Harvest, The Day-39 Ledger. Presentation leads with harvest, then meal, detour, crossing and window; IDs and engine checkpoints stay stable. Renderer should not invent fact text. Maps show terrain/resources and case-specific dated markers, no omniscient raw event overlays. A resolved case may download its validated full comparison for the existing sandbox. Independent solver gets only player-visible fields and permitted test results.

The renderer is in casebook.html, casebook.css and casebook.js. It imports `{createCaseBook,judgeCase}` from './cases.js' and `{serializeComparison}` from './save.js'. `npm run build` produces both offline bundles and the index.html entry page.

## Comparative necessity case

`harvest` offers `omit-gift-workday`, `forget-ivo-ada`, `forget-ada-ivo`, `retain-history`. It asks whether two interruptions have the same later consequence, so both main interruptions must be inspected before a comparative conclusion. Wrong-theory feedback depends on observed test history: do not reveal the omission result before it has been inspected. `solution.requiredFeedback` and optional `solution.contradiction(attempt)` implement that explanation; they are private grading fields, never renderer inputs.

A result may additionally supply `ordered:[{title,steps:[{heading,rows:[{label,value}]}],receipts:string[]}]`. These are selected facts from real before-choice snapshots and recorded physical transfers/harvests; show them only after the selected experiment is inspected. All bodies and row values are plain text. A small accessible expandable ledger can show the recorded and chosen workdays independently. Its actor order matters: earlier residents have already eaten. Do not replace ordered stocks with inferred end-of-day values.

The case module `harder-case.js` has unique helper names and is bundled after engine/save and before cases.js. Earlier cases do not supply ordered ledgers and should retain their ordinary rendering.

## Dated comparison case

`window` (The Day-39 Ledger) uses the newly selected seed73 report history. Both options replay the same controlled pair: only June→Hana day37 is withheld in the experiment. `through-39` and `through-40` change measurement date, not the underlying physical intervention. Result `orderedNote` explicitly describes end-of-day stocks; the renderer must use this optional note instead of its before-choice default. Facts, daily frames and receipts stop at the selected date. Initial uncertainty and ties are legitimate forecasts; final grading checks the observed selected-date result and requires inspecting40 to settle the question about40. It does not require repeating the already supplied39 tally.

The selected export retains the initialday36 comparison and a `measurementDay` hint (39/40). That experimental top-level metadata is permitted by the comparison format; it does not change physics or automatically advance the sandbox. The download notice tells the player to advance to the selected date. Each file's hint and world hash are checked in the real browser review. No permanent information benefit/harm or policy optimality is implied by a dated inventory comparison.


## Gift timing and public presentation

Meal measures day55. Removing Ivo’s starting Ada-help association prevents that day’s gift, but an extended replay gives Ada2.8 on day56 with rememberedHelp0. The resolution states that timing limit; the selected replay remains day55. Harvest shares the day54 checkpoint and explains the later gift in its two-workday resolution. Clearing starting memories does not ban later gifts or new help records.

Incomplete-test feedback requests the missing observation without revealing its activity or outcome. Harvest ordered ledgers open by default after inspection and preserve subsequent open/closed choices. Resource patches use shapes as well as color; dated frame inventories and textual marker locations remain the primary evidence. Casebook progress is session-only, stated on the landing page.
