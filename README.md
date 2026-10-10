# AfroChop

AfroChop is a modern African food and personal chef marketplace. The project includes a React Native Expo mobile app, a NestJS API, PostgreSQL/PostGIS, Redis, and local Docker infrastructure, with AfroChop branding and Phase 3 catalog/marketplace foundations for discovery, chef profiles, messaging, and quotes.

Brand tagline: **Find Your Cook. Taste Your Culture.** The mobile home screen uses AfroChop's forest green, golden spice, warm cream, terracotta, and rich brown palette.

## Monorepo structure

```bash
afrochop/
├── apps/
│   ├── api/
│   └── mobile/
├── packages/
│   ├── shared-types/
│   └── validation/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
├── README.md
└── tsconfig.json
```

## Prerequisites

- Windows 11 with VS Code
- Docker Desktop and WSL2 enabled
- Node.js 20+
- npm 10+

## Local setup

1. Install dependencies at the repo root:

```bash
npm install
```

2. Copy the environment template:

```bash
copy .env.example .env
```

Generate a unique JWT signing secret and set it in `.env` before starting the API. The API refuses to start without a secret of at least 32 bytes:

```powershell
$JwtSecret = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
if ($LASTEXITCODE -ne 0 -or -not $JwtSecret) { throw "Could not generate JWT_SECRET." }
(Get-Content .env) -replace '^JWT_SECRET=.*$', "JWT_SECRET=$JwtSecret" |
  Set-Content .env -Encoding ascii
```

Do not reuse or commit this secret. Changing it invalidates existing sign-in tokens.

Phone numbers are collected during registration and encrypted before storage. Generate and keep a separate 32-byte encryption key in the root `.env`:

```powershell
$VerificationKey = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
if ($LASTEXITCODE -ne 0 -or -not $VerificationKey) { throw "Could not generate VERIFICATION_ENCRYPTION_KEY." }
(Get-Content .env) -replace '^VERIFICATION_ENCRYPTION_KEY=.*$', "VERIFICATION_ENCRYPTION_KEY=$VerificationKey" |
  Set-Content .env -Encoding ascii
```

Keep this key stable and backed up securely; losing or rotating it makes previously saved phone numbers unreadable. Registration is rejected before creating an account if the key is missing or invalid.

3. Start the Docker services:

```bash
docker compose up -d --build
```

4. Run database migration and seed data:

```bash
npm --workspace @afrochef/api run prisma:generate
npm --workspace @afrochef/api run prisma:migrate
$env:DATABASE_URL="postgresql://afrochef:afrochef@localhost:5432/afrochef?schema=public"
node --experimental-strip-types prisma/seed.ts
```

5. Start the API locally:

```bash
npm --workspace @afrochef/api run start:dev
```

6. Start the Expo app in a second terminal:

```bash
npm --workspace @afrochef/mobile run start
```

For Android emulators, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api` in the app environment. iOS simulators can use `http://localhost:3000/api`; physical devices need the development computer's LAN IP address. See [Physical-device testing](#physical-device-testing-on-windows) for the Windows setup.

## Physical-device testing on Windows

The current mobile app uses Expo Go-compatible packages only; it does not include a custom native module that requires a development build. Install Expo Go from the Apple App Store or Google Play Store. Expo Go on a physical iPhone may require Expo CLI and Expo Go to be signed in to the same Expo account. Keep the phone and laptop on the same trusted Wi-Fi network. See Expo's [device setup](https://docs.expo.dev/get-started/set-up-your-environment/) and [start developing](https://docs.expo.dev/get-started/start-developing/) guides.

Open PowerShell in the project root and start the database, Redis, and API containers:

```powershell
docker compose up -d --build postgres redis api
docker compose ps
Invoke-RestMethod http://localhost:3000/api/health
```

The API container is built with incremental compilation disabled so a stale TypeScript build cache cannot remove its JavaScript entrypoint. PostgreSQL is published only on `127.0.0.1:5432`; the phone only needs the API on port `3000`.

Set the mobile app's local API URL to the laptop's current Wi-Fi IPv4 address. This writes an ignored, machine-specific `apps/mobile/.env` file and does not change the root `.env`:

```powershell
$LanIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" |
  Where-Object { $_.IPAddress -notlike "169.254*" } |
  Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $LanIp) { throw "No Wi-Fi IPv4 address was found. Check the active adapter with Get-NetIPAddress." }
"EXPO_PUBLIC_API_URL=http://${LanIp}:3000/api" |
  Set-Content -Path "apps/mobile/.env" -Encoding ascii
Invoke-RestMethod "http://${LanIp}:3000/api/health"
```

If that last request fails, confirm the phone and laptop share Wi-Fi, that Docker reports the API as healthy, and that the network allows device-to-device traffic. On a trusted **Private** Wi-Fi network only, an administrator can add a narrow inbound rule for the API:

```powershell
New-NetFirewallRule -DisplayName "AfroChop local API (TCP 3000)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
```

Remove the rule when no longer needed with:

```powershell
Remove-NetFirewallRule -DisplayName "AfroChop local API (TCP 3000)"
```

Seed local sample data (safe to re-run; the seed uses upserts and skips duplicate catalog entries):

```powershell
$env:DATABASE_URL="postgresql://afrochef:afrochef@localhost:5432/afrochef?schema=public"
node --experimental-strip-types prisma/seed.ts
```

Sample local-only accounts, all with password `Password123!`:

| Role | Email |
|---|---|
| Customer | `customer@afrochop.local` |
| Chef | `chef@afrochop.local` |
| Admin | `admin@afrochop.local` |

These are development fixtures, not production-ready identities. Do not reuse the passwords outside a disposable local environment. Verification and payment eligibility remain subject to the backend's fail-closed checks; no live Stripe payments are configured.

The seed also creates ten fictional Maryland chef cards in Baltimore, Silver Spring, Rockville, Gaithersburg, Bowie, College Park, Hyattsville, Annapolis, Frederick, and Laurel. They are explicitly labeled as fictional in their profiles and use local-only addresses `demo.chef01@afrochop.local` through `demo.chef10@afrochop.local`; the test password is `Password123!`. They are for discovery/filter UI testing only, not real cooks or order fulfillment.

In a second PowerShell terminal, start Expo from the mobile project with LAN transport and Expo Go mode:

```powershell
Set-Location apps\mobile
npx.cmd expo start --go --lan
```

Expo prints a QR code in that terminal. Scan it with the iPhone Camera app (open the banner in Expo Go) or the Android Expo Go app. The QR changes when the server restarts or the laptop's IP changes. If LAN traffic is blocked by the router, use `npx.cmd expo start --go --tunnel`; the API URL must still be reachable from the phone, so tunneling Metro alone does not solve API/firewall isolation.

### What can currently be tested

The mobile app starts with a welcome screen and customer/chef account entry, followed by a skippable first-use guide. Customers can register or sign in, set optional text-update consent, browse approved cooks, choose a location country in the United States, Canada, or Europe, then use state/region and city suggestions (with manual entry), inspect menus, galleries, social links and reviews, and submit an authenticated quote request. Location country options are separate from the African cuisine-country catalog. State/region and city suggestions reflect approved cooks' service areas; customers can type a location before a cook is listed in it. The customer onboarding flow is optional and does not require location permission to browse. Cooks can register or sign in, manage dishes and reusable menu templates, add externally hosted food photos or videos, and save social profile links. New cook profiles remain pending administrator review and are not immediately searchable; onboarding does not complete verification or Stripe setup. Quote acceptance and Stripe payment processing are not implemented. SMS delivery requires Twilio configuration and customer consent. No end-to-end physical-device test can be claimed without connected iPhone/Android hardware.

## API endpoints

- Health check: `http://localhost:3000/api/health`
- Swagger docs: `http://localhost:3000/docs`
- Auth register: `POST /api/auth/register`
- Auth login: `POST /api/auth/login`
- African country catalog: `GET /api/catalog/countries`
- Customer location countries for the United States, Canada, and Europe: `GET /api/catalog/market-countries`
- Service-area location suggestions: `GET /api/catalog/locations/states?countryCode=US`, `GET /api/catalog/locations/cities?countryCode=US&state=MD`
- Chef discovery: `GET /api/chefs?q=jollof&city=Brooklyn&serviceType=prepared_meals`
- Public chef profile: `GET /api/chefs/:id`
- Create/update chef profile: `POST /api/chefs/me/profile` (chef bearer token)
- Add a food-gallery image/video URL: `POST /api/chefs/me/food-photos` (chef bearer token)
- Read/update chef social links: `GET/PATCH /api/chefs/me/social-links` (chef bearer token)
- Update customer text-update consent: `PATCH /api/auth/me/notification-preferences` (customer bearer token)
- List/create/update/delete custom dishes and meals: `GET/POST /api/chefs/me/menu`, `PATCH/DELETE /api/chefs/me/menu/:entryId` (chef bearer token)
- List/create/delete reusable menu templates: `GET/POST /api/chefs/me/menu-templates`, `DELETE /api/chefs/me/menu-templates/:templateId` (chef bearer token)
- Add a food-gallery image URL: `POST /api/chefs/me/food-photos` (chef bearer token)
- Add/update menu item: `PUT /api/chefs/me/menu` (chef bearer token)
- Replace weekly availability: `PUT /api/chefs/me/availability` (chef bearer token)
- Replace service areas: `PUT /api/chefs/me/service-areas` (chef bearer token)
- Submit a booking request: `POST /api/quotes/request`
- View booking requests and quotes: `GET /api/quotes/requests` and `GET /api/quotes/requests/:id`
- Submit a chef quote: `POST /api/quotes/:id/chef-quote`
- Revise a pending quote: `PATCH /api/quotes/:id/price`
- Submit a grocery receipt: `POST /api/quotes/:id/receipt`
- Respond to a disclosed allergy: `PATCH /api/quotes/requests/:id/allergy-response` (assigned chef)
- Send a message: `POST /api/messages`
- Read a conversation: `GET /api/messages/with/:userId`
- Confirm a confirmed booking complete: `PATCH /api/quotes/requests/:id/complete` (customer and assigned chef must both confirm)
- List completed bookings eligible for review: `GET /api/reviews/eligible-bookings` (customer bearer token)
- Submit/edit one verified review per completed booking: `POST /api/reviews`, `PATCH /api/reviews/:id` (customer bearer token; 7-day edit window)
- Browse public chef reviews: `GET /api/chefs/:id/reviews?sort=newest|highest|lowest`
- Report a review: `POST /api/reviews/:id/reports` (authenticated customer/chef; five reports per hour)
- Respond to or appeal a review: `POST /api/reviews/:id/response`, `POST /api/reviews/:id/disputes` (assigned chef)
- Chef private feedback and rating summary: `GET /api/chefs/me/reviews/private` (chef bearer token)
- Admin review moderation: `GET /api/admin/reviews/reports`, `PATCH /api/admin/reviews/reports/:id`, `PATCH /api/admin/reviews/:id/moderation`
- Admin appeal queue and decision: `GET /api/admin/reviews/disputes`, `PATCH /api/admin/reviews/disputes/:id`
- Read own customer/chef verification checklist: `GET /api/verification/me` (customer or chef bearer token)
- Submit/update phone number for verification: `PUT /api/verification/me/phone` (E.164 format; resets its status to pending)
- Submit an encrypted customer service address: `POST /api/verification/me/service-addresses` (customer bearer token)
- Review service-address validation status: `PATCH /api/admin/verification/service-addresses/:id` (admin bearer token)
- Submit a credential for review: `POST /api/chefs/me/verification/credentials` (chef bearer token; no raw identity/background reports)
- Submit permit metadata with a private-storage object key: `POST /api/chefs/me/permits` (chef bearer token; public URLs rejected)
- Admin verification review queue: `GET /api/admin/verification/queue`
- Admin email/phone/identity decision: `PATCH /api/admin/verification/users/:userId/:type`
- Admin credential decision: `PATCH /api/admin/verification/credentials/:id`
- Admin service/jurisdiction approval: `PUT /api/admin/verification/chefs/:chefId/services`
- Report suspicious activity or safety issues: `POST /api/safety/incidents` (booking, chef, or target user required)
- Create/update jurisdiction service rules: `PUT /api/admin/safety/compliance-rules` (admin bearer token)
- Change provider verification status: `PATCH /api/admin/safety/chefs/:id/status` (admin bearer token)
- Review pending permits: `GET /api/admin/safety/permits/pending`, `PATCH /api/admin/safety/permits/:id/review`
- Report/list food safety incidents: `POST /api/safety/incidents`, `GET /api/safety/incidents/mine`
- Review/escalate incidents and suspend a chef: `GET /api/admin/safety/incidents`, `PATCH /api/admin/safety/incidents/:id`
- Read customer-disclosed marketplace fee: `GET /api/payments/configuration`
- Read chef Connect eligibility: `GET /api/payments/chef/connect/status` (chef bearer token)
- Create a secure Stripe-hosted onboarding link: `POST /api/payments/chef/connect/onboarding` (chef bearer token)
- Process Stripe Connect account updates: `POST /api/payments/webhooks/stripe` (verified Stripe signature)
- Read/update payment fee basis points: `GET/PATCH /api/payments/admin/configuration` (admin bearer token)

Chef search supports query text, African cuisine country, dish, service type, city/state/country code, price range, day of week, and pagination. Cuisine-country matching uses linked menu dishes and the chef's declared cuisine specialties. Location filtering currently matches configured service-area city/region exactly; GPS discovery and distance/radius ranking are not yet implemented. Results only include public, approved profiles. Chef profile, menu, photo URL, availability, and service-area management require a chef bearer token.

Food-gallery endpoints save validated HTTPS image or video URLs; binary uploads and private object storage are not wired yet. Videos must be directly playable by Expo Video, and short duration is not enforced. Twilio quote/order texts require `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, and `VERIFICATION_ENCRYPTION_KEY` in the API environment, plus an opted-in customer with a saved phone number. Configure Twilio Messaging Service opt-out handling (including STOP) before enabling delivery; missing configuration or delivery errors are logged and do not roll back quote/order updates. Verification documents accept only a chef-scoped private object key, never a public URL. Signed uploads, malware scanning, private document viewing, and retention deletion are not wired; permits are quarantined and cannot be approved until a trusted scanner reports a clean object. Quote requests, revisions, and receipt records are persisted and role-checked, but quote acceptance, booking conflict locking, and Stripe payment processing are not implemented yet. No money is charged or captured by this scaffold.

## Customer and chef verification

Registration creates pending email and phone verification records. Customers can read their own status and submit an E.164 phone number; changing it resets phone verification to pending. Administrators can record verification outcomes only with a provider and evidence reference. Until an email/SMS delivery and challenge provider is integrated, those decisions are manual review records—not self-service OTP verification. Booking requests fail closed unless email and phone are verified and unexpired. Service rules can require additional customer identity verification for higher-risk categories.

Chefs have separate email, phone, identity, overall AfroChop approval, Stripe Connect, credential, permit, background-screening, and per-service/per-jurisdiction states. Stripe eligibility does not establish identity, food-safety, or screening approval. An administrator cannot approve a chef profile without verified email, phone, identity, and eligible Stripe Connect status. Service approval additionally requires an active jurisdiction rule and all rule-required credentials, permits, consented screening, and Stripe eligibility. Booking requests and chef quotes require the applicable service approval.

Verification administration is available through the `/api/admin/verification/*` endpoints; the reusable Expo checklist is `apps/mobile/components/ChefVerificationChecklist.tsx`. The existing mobile app has no signed-in customer/chef account settings or admin dashboard, so the component and queue APIs are not mounted in authenticated screens. Identity verification and background screening remain disabled by default (`IDENTITY_VERIFICATION_ENABLED=false`, `BACKGROUND_SCREENING_ENABLED=false`); no vendor calls or production screening run. Enable identity verification only after configuring an approved provider and completing applicable consent, privacy, retention, and legal review. Background-screening consent and vendor execution are not implemented.

Customer phone numbers and service addresses are encrypted with AES-256-GCM and keyed with HMAC-SHA-256; set a generated base64 32-byte `VERIFICATION_ENCRYPTION_KEY` in the backend secrets manager before accepting either. Generate a key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` and never commit or reuse it across environments. Only the phone's last four digits and the address's country/jurisdiction/status are returned to the customer dashboard. In-home bookings require an owned, verified, unexpired service-address record. Address verification is disabled by default (`ADDRESS_VERIFICATION_ENABLED=false`) until a validation provider is configured and reviewed; no geocoding or provider calls run in this stage.

### Marketing contact export

The authenticated `PATCH /api/auth/me/marketing-contact-preference` endpoint stores a user's marketing-contact preference and synchronizes enabled contacts to a Google Sheet. Canada and European countries require an explicit opt-in; other supported locations default to enabled with an opt-out control. The sheet contains account ID, role, name, email, phone, country, and last-sync time. Phone numbers are decrypted only server-side for an enabled export; turning sharing off clears that user's sheet row. The sheet is a promotional-contact destination only, not the account system of record.

To enable this integration, enable the Google Sheets API, create a dedicated Google service account, share the target spreadsheet with its email, and configure `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` in the API environment. Protect the service-account key as a backend secret. If credentials are absent, no contact data is sent to Google and the API reports that contact sync is not configured. Google Sheets availability is required for a configured preference change to synchronize; if a sync fails, the preference remains saved, an explicit error is returned, and retrying the preference endpoint reconciles the sheet. Obtain legal/privacy review and explain the Google Sheets transfer in the published privacy notice before enabling this destination in production.

Credential metadata stores provider references and expiration dates, not raw identity/background reports. The new verification-document table stores private object keys and malware scan state, but object storage/upload/scanning and authorized document review have not been integrated; do not submit real sensitive documents until those controls exist. The migration preserves any pre-existing permit document references and quarantines HTTP(S) URLs rather than deleting them. Do not launch these verification flows as production-certified checks.

## Stripe Connect onboarding and payment configuration

Stripe Accounts v2 recipient account creation happens when the chef explicitly starts payout onboarding after setting a supported two-letter country code; saving a discovery profile does not require Stripe credentials. Stripe's hosted onboarding link is generated on request, single-use, and opened in the system browser (Stripe-hosted onboarding is not supported inside an embedded WebView). The app never collects or stores bank account details. The connected-account identifier, capability state, Stripe requirements, and a short-lived hashed one-time refresh token are stored in PostgreSQL. Onboarding return and refresh destinations come only from backend environment configuration; clients cannot supply redirect URLs. The reusable payout status component is `apps/mobile/components/ChefPayoutSetup.tsx`; it needs to be mounted in a signed-in chef dashboard.

Set backend-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_RETURN_URL`, and `STRIPE_CONNECT_REFRESH_URL` in `.env` or the production secrets manager. Never put Stripe secret keys in Expo environment variables. Use HTTPS URLs in production. The Stripe Dashboard webhook must listen for Connect `account.updated` events and point to `POST /api/payments/webhooks/stripe`; raw-body signature verification is enabled by Nest. The handler deduplicates events by Stripe event ID and updates transfer capability, payout status, and outstanding requirements. A chef becomes transfer-eligible only when Stripe reports the transfer capability as active. Account eligibility is not a transfer, payout, or promise of immediate bank settlement.

Payment configuration is in basis points: chef commission starts at **15%** (1,500 bps), while the separately disclosed customer marketplace fee starts at **0%** until the operator configures it. `GET /api/payments/configuration` returns only the customer fee for customer-facing disclosure. Administrators can view and change both rates through `GET/PATCH /api/payments/admin/configuration`; changes are audit logged. No booking amounts or client-supplied rates are charged in this stage.

Stripe's marketplace guide assigns the platform responsibility for processing fees and negative connected-account balances in this Connect configuration. Review and explicitly accept these Stripe/platform responsibilities, supported countries, contracts, charge/refund/dispute handling, and applicable legal obligations before enabling live mode. Stripe Connect is not escrow; no funds are currently accepted, held, transferred, or paid out by AfroChop.

This is only the onboarding/configuration stage. React Native PaymentSheet, PaymentIntents, booking-payment records, transfers, payout/refund/dispute state machines, reconciliation, Redis/BullMQ jobs, financial ledger, settlement alerts, and checkout are not implemented yet. Consequently, the app does not yet take customer payments. Apply the new Prisma migration and configure Stripe test-mode webhook forwarding before validating Connect onboarding against Stripe.

## Food safety and legal review

Menu entries contain structured major-allergen values, known ingredients, and known cross-contact risks. Customer booking requests require the current allergy-notice acknowledgment and record its version and timestamp. Allergy disclosures stay attached to the booking and are only returned to the customer or assigned chef. A request with disclosed allergens remains pending until the assigned approved chef explicitly accepts or declines; quote creation is blocked while pending and blocked after decline. Admins can configure jurisdiction/service rules, review permit status and expiration, investigate incidents, and suspend a provider during an urgent investigation. Unconfigured jurisdiction/service combinations fail closed and cannot accept booking requests.

This implementation is an initial control foundation, not a legal or food-safety certification. Provider approval does not guarantee safety. The mobile app shows recipe disclosures and risk warnings but cannot promise allergen-free food. The customer request screen captures disclosures and acknowledgment visually; authenticated submission and checkout screens are not connected yet. Urgent incident reports are marked escalated and appear in the admin queue; out-of-band paging, email, and push notifications are not implemented. Do not launch paid services until counsel and food-safety professionals have reviewed the operating jurisdictions, configured compliance rules, approved data retention and incident contacts, and reviewed every document in [legal/drafts/README.md](./legal/drafts/README.md). All legal documents are explicitly drafts. Retention periods remain unapproved placeholders and no deletion job is implemented.

## Chef ratings and reviews

Reviews are accepted only for a booking owned by the authenticated customer after both the customer and assigned chef confirm completion. A database uniqueness constraint enforces one review per booking; the API limits edits to seven days, accepts up to five HTTPS photo URLs, and stores optional private feedback ratings for food quality, communication, punctuality, and professionalism. Private category feedback is returned only to that chef and is excluded from public review payloads. Public averages and counts include only published reviews. Review reports are rate-limited and audited moderation/appeal decisions recalculate the chef rating; reports alone do not hide a review, and unfavorable sentiment by itself is not a moderation reason.

The mobile chef profile displays average rating, verified-review count, customer comments/photos, chef responses, and newest/highest/lowest sorting. Reusable rating, summary, review-card, chef-response, and authenticated create/edit form components are in `apps/mobile/components/Reviews.tsx`. The form, chef dashboard, report controls, and administrator moderation screen still need to be connected to the signed-in bookings flow. Review photo support currently stores HTTPS URL references; private binary uploads are not implemented.

## Database and Docker notes

- PostgreSQL is exposed locally on port 5432.
- Redis is available internally to the Docker network on port 6379.
- Use `docker compose logs -f api` to troubleshoot container startup issues.
- Use `docker compose down -v` when resetting local state.

## Development checklist

- [x] Monorepo structure
- [x] Expo mobile app scaffold
- [x] NestJS backend scaffold
- [x] PostgreSQL/PostGIS Docker configuration
- [x] Redis configuration
- [x] Prisma schema and seed foundation
- [x] Initial auth and role models
- [x] AfroChop clean discovery home and API-backed chef search
- [x] Country/dish catalog and public chef profile/menu/gallery schema
- [x] Chef-only authenticated profile, menu, photo URL, availability, and service-area endpoints
- [x] Local documentation for current endpoint scope and known integration gaps
- [ ] Customer/chef registration screens and complete sign-in persistence
- [x] Secure booking request ownership, chef quote creation/revisions, and request views
- [x] Authenticated customer/chef messaging API
- [x] Structured menu ingredients, allergens, and cross-contact disclosures
- [x] Versioned customer allergy acknowledgment and provider accept/decline gate
- [x] Permit records, configurable jurisdiction rules, admin permit review
- [x] Safety incident reporting, urgent escalation state, and admin suspension action
- [x] Verified booking reviews, moderation/report/appeal API, and public chef review display
- [x] Stripe Connect Accounts v2 recipient onboarding, status webhooks, and configurable marketplace fees
- [x] Draft legal, privacy, food safety, and incident procedures for counsel review
- [ ] Persisted allergen/acknowledgment flow in a signed-in mobile booking and checkout
- [ ] Private binary storage for permit and receipt documents
- [ ] Automated permit expiry reminders and retention/deletion jobs
- [ ] Quote acceptance and booking conflict prevention
- [ ] Stripe test-mode deposit and final-payment flows
- [ ] Binary image upload to private object storage
- [ ] Admin verification and chef approval interface
- [ ] PostGIS distance matching and map/list discovery
