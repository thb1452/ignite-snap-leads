# Five-buyer workflow pilot — prepared, not started

September 24, 2026. Status **BLOCKED BY RELEASE GATES**. Participants recruited: **0**. Sessions performed: **0**. The user authorized running the relaunch sequence, including a small buyer pilot. No recipient identities, invitations, market access or payment have been approved/executed by this runbook. No paid traffic or Lovable credit spend.

Goal: determine whether five independent target buyers can understand the supported source, save a useful opportunity, and return to complete follow-up. This is a usability and repeat-use screen, not evidence of CAC, scalable conversion, churn, or product-market fit.

## Entry gates

- Release commit, staging URL and test identities recorded. New independent customer workspaces pass read/write/cache/export negative tests. No founder shared organization.
- Billing sandbox passes checkout, duplicate/reordered invoice, allowance, delivery, cancel and retry tests. No real-card test or invoice generation for participants by default.
- One market/source release is explicitly accepted from original-backed evidence. [Candidate market validation remains held](../market-validation.md). Synthetic examples may support an internal rehearsal only; label them and do not call that a real market pilot.
- All five tasks below work on desktop and mobile using scoped seed data; refresh/source revocation preserves private notes and history. Provider enrichment, email/SMS enrollment, and paid automation remain off.
- One coherent public offer and visible source dates, sample labels and limitations. Support and error recovery have an identified operator.
- JD/operator identifies and approves the exact five recipients and invitation text before sending. Confirm eligibility, consent to participation and optional recording separately. No purchases or incentives assumed.

Stop immediately for any cross-account read/write, incorrect payment/access, lost private work, exposed sensitive narrative, or material factual source error. Do not average a safety failure into a successful completion rate.

## Qualification and recruiting

Candidate: active solo wholesaler or small acquisition operator who works in the accepted geography, has evaluated or followed up a property in the past 90 days, and personally handles research or lead follow-up. Ask for their workflow, not proof of wealth or sensitive deal documents. Include at least two participants who normally work on a phone. Exclude the founder, staff, test accounts, close collaborators who built the release, unsupported-market users, and anyone expecting automated calling or guaranteed motivated sellers.

Use existing permissioned contacts or opt-in partner referrals first. Preserve the prior partner education experiment; broader distribution and paid search remain separate decisions after the pilot. Do not scrape contact lists or activate a campaign to fill five seats.

Recruitment draft, only after gates pass and exact recipients are approved:

> Hi [first name] — I'm testing Snap Ignite's property research and follow-up workflow for [accepted market]. Would you be open to a 25-minute session using the product, then a short return visit a few days later? We'd like your honest reaction to the source evidence and CRM workflow. This test doesn't promise seller motivation or deals, and you won't need to purchase anything. If that fits, what times work for you?

Do not send placeholders. No recording unless the participant agrees. Participation is not promotional consent or authorization to contact property owners.

## Moderator script and five tasks

Opening: “We are testing the product, not you. Please say what you think is happening. I may wait before helping so I can see where the product is unclear. Nothing you do here will contact an owner.” Confirm the environment and payment/outreach state. Do not coach the tasks in advance.

| Task | Prompt | Pass evidence | Suggested timebox |
|---|---|---|---|
| 1. Establish source fit | “You want to research a property in [accepted market]. Show me what is covered and how current the information is.” | Correct geography, report date and source scope; no claim that import time means newly filed enforcement | 3 minutes |
| 2. Interpret evidence | “Find one case worth investigating and explain what it establishes and what you still need to check.” | Uses actual agency status/date; does not equate a case with a lien, occupancy or seller motivation; notices resolved/unknown status | 5 minutes |
| 3. Save private work | “Save this opportunity in your pipeline. Add this fictional contact and note so you can find it later.” | Correct property, persistent private lead/contact/note after reload; no automatic outreach/enrollment | 5 minutes |
| 4. Plan follow-up | “Set your next action for [specified date], move it to the appropriate stage, then find what you need to do next.” | Task, date and stage survive reload and appear correctly in due view; no false completed action | 5 minutes |
| 5. Return and recover | On day 3–7: “Find your saved opportunity, complete the follow-up, and retrieve your notes/history or permitted export.” | Independent return, correct saved history and task completion; export preserves meaning/permissions; source changes do not erase private work | 5 minutes |

Timeboxes are proposed observation limits, not product promises. Give help after recording the point of failure. `unaided` means no navigation/click or interpretation hint; reading the task aloud is allowed. Record the first confusing screen, exact action, time, and a short paraphrase. Never include owner PII or raw source narrative in the scorecard. Use synthetic contacts and notes.

After task 4 ask: “What would you use this for next week?”, “What would stop you trusting or returning to it?”, “What do you use now?”, and “At the displayed price, what would you expect this to replace or improve?” Record objections before suggesting features. A favorable answer is not a paid conversion. Day 3–7 return should be measured separately from reminder-assisted return.

## Scoreboard and decisions

Use [scorecard.json](scorecard.json). `null` means unobserved, never zero. Numerators and denominators must be actual participants with eligible evidence. Exclude founder/internal traffic and synthetic payment activity from customer metrics.

| Metric | Proposed pilot decision rule |
|---|---|
| Task success | At least 4 of 5 complete each core task unaided; report per-task counts |
| Source understanding | At least 4 of 5 correctly explain scope, dates and uncertainty; a material source error stops the affected release |
| Repeat useful action | At least 3 of 5 complete task 5 on day 3–7; report organic versus reminder-assisted separately |
| Persistence/privacy/payment | 5 of 5 observed journeys without data loss or incorrect account/payment behavior, plus release QA gates; any safety failure stops |
| Price evidence | Record actual objections and explicit willingness; no MRR or conversion claim without confirmed collected payment |
| Economics | Track human support minutes, source-review minutes, actual measured delivery/provider cost and refunds if any; do not infer margin from plan price |

If fewer than 4 of 5 complete a core task unaided, fix the first failing stage before recruiting more people. If tasks pass but return use is below 3 of 5, investigate relevance/cadence and the recurring job before adding features. If users return but refuse the offer, test value and price presentation before paid search. These thresholds are operational hypotheses for a tiny cohort, not statistically significant validation.

Completion packet: release SHA, market acceptance reference, five pseudonymous scorecards, failure reproductions, actual denominators, support minutes, stated price objections, and a decision to repair, repeat or request the next bounded distribution test. Keep identity/consent evidence in a private operator system separate from repository artifacts.
