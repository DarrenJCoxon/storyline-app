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
| AI call fails (auth/key) | Banner: "Your API key is invalid. Update it in settings." |
| Credits exhausted | Full-width banner above input, "Upgrade to continue" + plan cards |
| Network offline | Subtle banner: "You're offline — planning will resume when reconnected" |
| State save fails | Toast: "Save failed — your conversation is still here, try again" |
| Supabase session expired | Prompt to re-authenticate inline (no full page redirect) |
| Stripe payment failed | Email notification via Stripe + banner in app on next open |

### Empty states

| Context | Empty state |
|---------|-------------|
| No workspace open | "Open a project folder to begin. File → Open Folder." |
| New project, Stage 1 | AI sends opening message automatically — never a blank pane |
| No manuscript files | "Your manuscript is empty. Create your first chapter to start writing." |
| No chapter cards yet | "Chapter cards will appear here as you complete planning stages." |

### Model routing tuning

After real usage data from beta writers:
- Review actual token counts per stage vs. projections
- Adjust tier assignments if costs are higher or quality is lower than expected
- Consider adding a "quality mode" toggle for BYOK users (always use strong model)

### Analytics (Posthog)

Privacy-first — no PII, no message content, no manuscript text ever sent.

Events tracked:
- `session_start` — extension activated
- `stage_opened` — writer enters a new stage
- `stage_saved` — writer saves a stage (+ stage_id, model_used, tokens_used)
- `stage_completed_all` — all 14 stages done
- `compile_triggered` — EPUB or PDF compile started (+ format)
- `compile_completed` — compile finished (+ duration_seconds)
- `onboarding_completed` — plan selected / BYOK configured
- `subscription_upgraded` — Free → paid conversion
- `credits_exhausted` — balance hit 0

Dashboards: weekly active users, stage completion funnel, compile usage,
cost per active user, credit exhaustion rate.

### In-app feedback

- "Send feedback" link in the chat pane footer (small, unobtrusive)
- Opens a minimal form: rating (1–5 stars), free text, send
- Submissions go to a Supabase table, no email required
- Team reviews weekly during beta

### Beta invite flow

- Simple waitlist page (not a full marketing site — a single HTML page)
- Invite code system: Supabase generates single-use codes, codes bypass
  the Free 10-credit limit and grant 50 credits for the beta period
- "Share a friend" flow: beta writers can generate one invite code for a
  friend from the extension's account panel

### Documentation

User-facing, not technical:

- **Quick start guide** (in-app, dismissible): shown after onboarding, covers
  the three-column layout, how saves work, how credits work
- **Stage reference** (accessible from the chat pane rail): one-paragraph
  description of each stage, what it produces, why it matters
- **FAQ** (linked from the account panel): billing, BYOK, local models, data
  privacy

## Technical tasks

- [ ] Build error boundary components for all AI failure modes
- [ ] Build "Credits exhausted" banner and upgrade CTA
- [ ] Build empty states for all listed contexts
- [ ] Implement Posthog analytics — install SDK, add event calls at each touchpoint
- [ ] Build in-app feedback form and Supabase submissions table
- [ ] Implement beta invite code generation and validation in Supabase
- [ ] Implement "Share a friend" invite UI in account panel
- [ ] Write quick start guide (in-app component)
- [ ] Write stage reference content (per-stage one-paragraph descriptions)
- [ ] Write FAQ content
- [ ] Tune model routing based on beta token data
- [ ] Load test `credits-deduct` edge function (concurrent saves)
- [ ] Penetration check: verify RLS prevents cross-user data access
- [ ] Review Stripe webhook for idempotency (duplicate events must not double credit)

## Dependencies

M1–M5 complete.

## Success criteria

- 10 beta writers reach Stage 5 (Protagonist) without filing a data loss report
- No unhandled promise rejections in production Posthog error tracking
- Average session length > 15 minutes (writers are engaged, not bouncing)
- Cost per active Starter user ≤ £0.20/month in AI API costs
- Credit exhaustion rate < 20% (most writers finish a plan before running out)
- In-app feedback average rating ≥ 3.5/5
- Zero cross-user data leaks (verified by RLS audit)
