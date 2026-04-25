# M6 — Polish + Beta

## Goal

10 external writers complete at least Stage 5 (Protagonist). Nothing
embarrassing ships. Every failure mode is handled gracefully. Usage data
informs what to fix before public launch.

## Deliverables

### Error states

Every failure mode has a specific, human-readable UI state — no raw error
messages, no blank screens.

| Failure | UI |
|---------|----|
| AI call fails (transient) | Inline retry button, "Something went wrong — try again" |
| AI call fails (bad key) | Banner: "Your API key was rejected. Update it in settings." |
| Credits exhausted | Banner: "You're out of credits — [Buy more] to continue" |
| Free plan complete | Banner: "Your free plan is complete — [Buy credits] to continue with the writing mentor" |
| Network offline | Subtle banner: "You're offline — planning resumes when reconnected" |
| State save fails | Toast: "Save failed — your conversation is still here, try again" |

### Empty states

| Context | Empty state |
|---------|-------------|
| No workspace open | "Open a project folder to begin. File → Open Folder." |
| New project, Stage 1 | AI sends opening message automatically — never a blank pane |
| No manuscript files | "Your manuscript is empty. Create your first chapter." |
| No chapter cards yet | "Chapter cards appear here as you complete planning stages." |

### Model routing tuning

After real usage data from beta writers:
- Review actual token counts per stage vs. projections
- Adjust tier assignments if costs are higher or quality lower than expected
- Verify OpenRouter spend caps are appropriate per plan

### Analytics (Posthog)

Privacy-first — no PII, no message content, no manuscript text ever sent.

Events tracked:
- `session_start` — extension activated, type (credits/byok/free)
- `stage_opened` — writer enters a new stage
- `stage_saved` — stage saved (+ stage_id)
- `all_stages_complete` — all 14 planning stages done
- `compile_triggered` — EPUB or PDF (+ format)
- `compile_completed` — (+ duration_seconds)
- `onboarding_completed` — type chosen (credits/byok/free)
- `free_plan_complete` — free credits exhausted after full plan
- `credits_exhausted` — paid credit balance hits zero
- `buy_credits_prompted` — top-up CTA shown
- `credits_purchased` — pack size (£10/£20)

Dashboards: weekly active writers, stage completion funnel, free-to-paid
conversion, credits purchased per cohort, compile usage.

### In-app feedback

- "Send feedback" link in the chat pane footer
- Opens a minimal form: rating (1–5 stars), free text, anonymous submit
- Submissions POST to a simple endpoint (Formspree or equivalent —
  zero additional infrastructure)

### Beta invite flow

- Simple waitlist page (single HTML page, no framework)
- Invite codes: a special code accepted alongside the licence key entry
  that grants Pro-level access for the beta period at no charge
- Codes written directly to KV store; no additional backend needed

### Documentation

- **Quick start guide** (in-app, dismissible): shown after onboarding
- **Stage reference** (from the chat pane rail): one paragraph per stage
- **FAQ**: billing, BYOK, local models, data ownership

  The FAQ must prominently answer: "Do you store my writing?" — No. All
  project files live on your machine. We never see your manuscript or
  planning state.

## Technical tasks

- [ ] Build error boundary components for all failure modes
- [ ] Build "credits exhausted" and "free plan complete" banners with top-up CTA
- [ ] Build empty states for all listed contexts
- [ ] Instrument Posthog events at each touchpoint
- [ ] Build in-app feedback form (Formspree or equivalent)
- [ ] Implement beta invite code support in `/validate` endpoint
- [ ] Write quick start guide (in-app component)
- [ ] Write stage reference content
- [ ] Write FAQ (prominently answer the data ownership question)
- [ ] Tune model routing based on beta token data (Flash for all stages confirmed)
- [ ] Load test `/validate` endpoint (concurrent activations)
- [ ] Verify credit deduction is atomic — no double-deduct on retry
- [ ] Review Stripe webhook for idempotency (duplicate events must not
      double-provision credit balances)

## Dependencies

M1–M5 complete.

## Success criteria

- 10 beta writers reach Stage 5 without filing a data loss report
- No unhandled errors in Posthog error tracking
- Average session length > 15 minutes
- Actual AI cost per free user ≤ $0.05 (one full plan)
- Free-to-paid conversion rate ≥ 20% (writers who complete the plan buy credits)
- In-app feedback average rating ≥ 3.5/5
- FAQ data ownership question answered clearly and accurately
- Credit deduction correct on 100% of completed streams in load test
