# WhatsApp Update Notifier — Backend

Sends an automatic WhatsApp message **from the firm's own number** to a client
whenever their record is edited (and confirmed) in the Court Sessions dashboard.

```
dashboard.html ──POST──▶ Cloudflare Worker (this folder) ──▶ Meta WhatsApp Cloud API ──▶ client's WhatsApp
```

- `worker.js` — the whole backend (no dependencies).
- `wrangler.toml` — deployment config for Cloudflare Workers (free tier).
- The dashboard side is already wired in `dashboard.html` (`notifyClientUpdate`),
  and stays **inactive** until `kh_wa_url` is configured.

## One-time setup (with Claude's guidance)

### Part 1 — Meta / WhatsApp (done by the firm, ~30–60 min + verification wait)

1. Create a Meta Business portfolio at https://business.facebook.com (firm name: شركة خالد الحبسي للمحاماة).
2. Create an app at https://developers.facebook.com → type **Business** → add the **WhatsApp** product.
3. Connect the firm's number using the **coexistence** flow (QR scan from the
   WhatsApp Business app — the app keeps working normally).
4. Business verification: Business Settings → Security Center → upload the CR/license.
   (Until verified: ~250 business-initiated messages/day — fine to start.)
5. Create the message template (WhatsApp Manager → Message templates → Create):
   - **Name:** `client_case_update` · **Category:** Utility · **Language:** Arabic
   - **Body:**
     ```
     مرحباً {{1}}،
     نفيدكم بأنه تم تحديث بيانات قضيتكم لدى شركة خالد الحبسي للمحاماة:
     • رقم القضية: {{2}}
     • الجلسة القادمة: {{3}}
     • القرار النهائي: {{4}}

     مع تحيات شركة خالد الحبسي للمحاماة
     ```
   - Sample values for review: محمد البادي · 2024/289 · 2/6/2025 · لا يوجد
6. Collect two values from the app's **WhatsApp → API Setup** page:
   - **Phone number ID**
   - A **permanent access token** (Business Settings → System users → create system
     user → assign the app + WhatsApp permissions → generate token).

### Part 2 — Deploy the worker (10 min, free)

```bash
cd backend
npx wrangler login          # opens browser -> log into the (free) Cloudflare account
npx wrangler secret put META_TOKEN        # paste the permanent token
npx wrangler secret put PHONE_NUMBER_ID   # paste the phone number ID
npx wrangler secret put SHARED_SECRET     # any long random string
npx wrangler deploy                       # prints the worker URL
```

### Part 3 — Point the dashboard at the worker

In the browser console on the dashboard (one time per device), or baked into the
code once stable:

```js
localStorage.setItem('kh_wa_url','https://kh-law-whatsapp.<account>.workers.dev/');
localStorage.setItem('kh_wa_secret','<the same SHARED_SECRET>');
```

Then edit any client with a phone number → confirm → the client receives the update.

## Costs

- Cloudflare Workers: free (100k requests/day).
- Meta: receiving + replies within a 24h customer window are free; each
  business-initiated template message ≈ **US $0.01–0.04** (~4–15 بيسة).
  ~100 updates/month ≈ **$1–4/month**. Check https://developers.facebook.com/docs/whatsapp/pricing

## Security notes (current stage)

- The shared secret stops random abuse but is visible to anyone who reads the
  public site source — acceptable for the demo, **must** be replaced by real
  authentication in the database/users phase.
- The Meta token lives only in Cloudflare secrets — never in this repo.
- The worker only accepts requests from the GitHub Pages origin / localhost.

## Tests

- Worker unit tests (mocked Meta API) and an end-to-end browser test with a mock
  worker were run at build time: phone normalization (+968, Arabic digits),
  auth rejection, template payload, CORS, no-send on add/cancel/no-phone.
