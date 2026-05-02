# Storyline — Privacy Policy

**Last updated:** 2 May 2026

This policy explains what personal data Storyline collects, why, who we share
it with, and your rights under UK GDPR and the EU GDPR. It applies to your use
of the Storyline VS Code extension, the Storyline desktop installer, and the
services at `storyline.my` and `api.storyline.my`.

## 1. Who we are

The data controller is:

  Darren Coxon
  darren@coxon.ai

If you have questions about this policy or want to exercise any of your rights
below, contact us at the address above.

## 2. What we collect, and why

We deliberately collect as little as possible. The categories below are
exhaustive — if a category isn't listed, we don't collect it.

### 2.1. Account and billing data

- **Email address** — provided when you buy credits. Used to deliver your
  licence key, send receipts, and contact you about service issues.
- **Stripe customer ID and payment metadata** — Stripe processes the payment;
  we receive only the customer ID, the amount paid, and a webhook confirming
  success. We never see card numbers.
- **Licence key and credit balance** — stored in our Cloudflare KV store,
  keyed to your licence key. Used to authorise managed AI calls and track
  remaining credits.

Lawful basis: performance of a contract (Article 6(1)(b) UK GDPR).

### 2.2. AI prompt data (only when using managed services)

- **The prompts you send to the planning chat** and **any system prompts we
  attach** are forwarded to OpenRouter (for chat) and OpenAI (for transcription
  and image generation) so they can produce a response.
- We do **not** send the contents of your manuscript files. The planning chat
  operates on outline-level metadata only.
- We retain a short-term operational log (request count, model used, token
  count, cost) for billing and abuse detection. We do not retain the prompt
  bodies after the response has been streamed to you.

Lawful basis: performance of a contract (Article 6(1)(b)).

If you use Bring-Your-Own-Key (BYOK) mode or local Ollama, your prompts go
directly to the provider you configured and we never see them.

### 2.3. Error logs

If an AI call fails, we may receive a redacted error report containing the
request endpoint, status code, and a stack trace. We do not include prompt
bodies, licence keys, or personal information in error reports.

Lawful basis: legitimate interest (Article 6(1)(f)) — keeping the service
working.

### 2.4. Usage analytics

We do not run third-party analytics, behavioural tracking, advertising
trackers, or session replay tools. We do log the IP address attached to each
request for rate-limiting purposes; these logs are kept only as long as needed
to enforce limits (typically 24-48 hours).

Lawful basis: legitimate interest (Article 6(1)(f)) — preventing abuse.

## 3. What we never collect

- Your manuscript prose.
- Your local files outside the `.storyline` planning folder.
- Your microphone audio, except for the brief moment you record a voice note
  for transcription, which is streamed to OpenAI and not retained by us.
- Information about other software or files on your computer.

## 4. Third-party processors

The Service relies on the following processors. Each operates under its own
privacy policy, which we encourage you to read.

| Processor    | Purpose                          | Location of processing |
|--------------|----------------------------------|------------------------|
| Cloudflare   | Hosting, KV storage, rate-limit  | Global edge            |
| Stripe       | Payment processing               | Ireland (EU); USA      |
| OpenRouter   | Chat AI routing                  | USA                    |
| OpenAI       | Transcription, image generation  | USA                    |
| Postmark     | Transactional email delivery     | USA                    |

International transfers to the USA are made under the EU-US Data Privacy
Framework and Standard Contractual Clauses where applicable.

## 5. How long we keep your data

- **Licence and billing records** — for as long as your account is active,
  plus 6 years to comply with HMRC accounting record requirements.
- **AI request logs** — request metadata kept up to 90 days; prompt bodies are
  not retained after the response is streamed.
- **Error logs** — up to 30 days.
- **Rate-limit IP records** — 24-48 hours.

## 6. Your rights

Under UK GDPR / EU GDPR you have the right to:

- **Access** — ask for a copy of your personal data.
- **Rectification** — ask us to correct inaccurate data.
- **Erasure** — ask us to delete your data, subject to our legal obligation to
  keep accounting records.
- **Restriction** — ask us to stop processing your data while a dispute is
  resolved.
- **Portability** — ask for your data in a machine-readable format.
- **Object** — object to processing based on legitimate interest.
- **Withdraw consent** — for any processing based on consent.

Email **darren@coxon.ai** to exercise any of these rights. We aim to respond
within 30 days.

You also have the right to lodge a complaint with the UK Information
Commissioner's Office (ICO) at `https://ico.org.uk` if you believe we have
mishandled your data.

## 7. Children

Storyline is not directed at children under 13. If you believe a child has
provided us personal data, contact us and we will delete it.

## 8. Changes to this policy

We may update this policy. Material changes take effect 30 days after we post
the updated version at `https://api.storyline.my/privacy`. We will email
existing paying customers about material changes where we hold an email
address.

## 9. Contact

Privacy questions, data requests, complaints:

  Darren Coxon
  darren@coxon.ai
