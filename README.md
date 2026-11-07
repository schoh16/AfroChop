# AfroChop

AfroChop connects customers with African chefs and cooks for cooked food and cooking services. Customers can discover local cooks, explore menus, message cooks, and request bookings. Grocery sales and cook grocery-shopping services are no longer offered. The project includes a React Native Expo mobile app, a NestJS API, PostgreSQL/PostGIS, Redis, and local Docker infrastructure.

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

Configure `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, and `CORS_ORIGINS` as
described in [Cognito authentication](#cognito-authentication). Sign-in fails
explicitly until the pool and client are configured; legacy JWTs are no longer
accepted. No AWS IAM users or access keys are issued to app users.

Phone numbers added through verification are encrypted before storage. Generate
and keep a separate 32-byte encryption key in the root `.env`:

```powershell
$VerificationKey = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
if ($LASTEXITCODE -ne 0 -or -not $VerificationKey) { throw "Could not generate VERIFICATION_ENCRYPTION_KEY." }
(Get-Content .env) -replace '^VERIFICATION_ENCRYPTION_KEY=.*$', "VERIFICATION_ENCRYPTION_KEY=$VerificationKey" |
  Set-Content .env -Encoding ascii
```

Keep this key stable and backed up securely; losing or rotating it makes previously
saved phone numbers unreadable. Cognito registration itself does not require phone
storage or phone verification.

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

## Cognito authentication

Authentication is managed by Amazon Cognito User Pools, not AWS IAM or the local
password hashes. The API proxies Cognito authentication over HTTPS, verifies access
tokens against the pool's signing keys, issuer, app-client ID and access-token use,
and calls `GetUser` to reject revoked sessions. Marketplace permissions always come
from the current database role and active-account state, not client-supplied claims.
An outage of Cognito fails closed with an explicit error. Cognito email ownership
does not automatically complete the separate marketplace verification checklist.

### AWS setup (required before rollout)

Use the CloudFormation console to deploy [infra/cognito.yaml](infra/cognito.yaml)
in your chosen AWS region, with a different stack per environment. This template
creates resources and may incur AWS charges; it is not deployed automatically.
Copy its `UserPoolId` and `ClientId` outputs into the API environment:

```text
COGNITO_USER_POOL_ID=us-east-2_yourPoolId
COGNITO_CLIENT_ID=yourAppClientId
CORS_ORIGINS=https://app.your-domain.example
```

The client has **no secret**, enables `ALLOW_USER_PASSWORD_AUTH`, revocation and
refresh-token rotation (60-second retry grace), uses 15-minute access tokens and
30-day refresh sessions, and does not remember devices. Do not enable MFA, passkeys,
federated login or device remembering on this app client until corresponding UI
challenge handling is added. The initial integration supports email/password,
email confirmation and email-code password recovery only. IAM signing credentials
are not needed by these Cognito runtime operations. Do not change the pool for an
existing environment: stored subjects are scoped to that configured pool.

The template's default Cognito email delivery has restrictive daily quotas.
Configure production SES email delivery, a verified sender/domain and production
sending access in Cognito before launch. Test confirmation and recovery delivery.
Review Cognito quotas, pricing, abuse protection and alarm configuration before
public launch. The pool is retained and deletion-protected.

### Persistent sessions and browser deployment

- iOS/Android: only the refresh token is persisted in Expo SecureStore. Access
  tokens and profile data stay in memory and are restored by refreshing on startup.
- Web: the refresh token is an HttpOnly, SameSite=Lax cookie scoped to `/api/auth`.
  Production sets Secure. Access tokens stay in memory: **no passwords or bearer
  tokens in localStorage**. Browser fetches include credentials, and session
  endpoints validate an exact `CORS_ORIGINS` origin and client header.
- Serve production web and API over HTTPS on the **same site**, for example
  `app.example.com` and `api.example.com`, or reverse-proxy `/api` on the app host.
  An unrelated web host and `onrender.com` API are cross-site and will not persist
  this cookie. Configure custom domains/proxy before enabling browser sign-in.
  Locally, use `localhost` for both browser app and API, not localhost plus a LAN
  IP. Set the mobile app's `EXPO_PUBLIC_API_URL` accordingly.
- Requests across bookings, payments, messaging, verification, reviews and seller
  uploads obtain renewed access tokens automatically. Concurrent refreshes within
  an app instance are coalesced. The session expires 30 days after the original
  login; rotation does not extend that lifetime.
- Sign-out revokes Cognito sessions (all devices when a valid access token is
  available), clears the cookie/device refresh token, and clears in-memory access.
  Passwords are never stored on the device. Network failures are surfaced so
  users can retry rather than being told remote revocation succeeded.

### Existing account migration

Back up the database, deploy the API migration and the new app together, and
configure Cognito before distributing the release. Old app clients and old JWT
sessions are intentionally incompatible with this cutover; users sign in again.

1. Select **Create / Migrate Account** with the **same email** as the old account
   and choose a new password. The old password is not imported.
2. Enter the email confirmation code, then sign in with the new password.
3. Only after Cognito verifies email ownership does the API atomically bind the
   immutable Cognito subject to the existing local user. IDs, seller profiles,
   roles, bookings, payouts and media stay unchanged. The old bcrypt hash is
   cleared on linking; new users never have a local password hash.
4. If an account is already registered but unconfirmed, use **Verify Email /
   Resend Confirmation Code**. If the password was forgotten or someone started
   registration for that email, confirm email ownership and use **Forgot
   Password?** to choose your own password. Unmigrated accounts must register and
   confirm before Cognito recovery can send a reset code.

Inactive accounts and conflicting existing identity links are rejected.
**Administrator accounts are never automatically linked by email.** An operator
must independently verify ownership, create/confirm the Cognito identity, and
explicitly assign its subject to the existing admin record through an audited
database operation. Do not promote public sign-ups to admin. Seeded demo users
are local data only; their sample passwords no longer authenticate. Use a
deliverable email and this migration process for test accounts.

Authentication API:
`POST /api/auth/register`, `/confirm`, `/resend-confirmation`, `/login`,
`/forgot-password`, `/reset-password`, `/refresh`, `/logout`.
Login/refresh/logout require `X-AfroChop-Client: web` with an allowed browser Origin
or `X-AfroChop-Client: native` with no Origin. Native refresh/logout send
`{ "refreshToken": "..." }`; browser refresh/logout send `{}` and use the cookie.
Confirmation and reset accept `{ email, code }` and `{ email, code, password }`.
No confirmation or reset operation signs the user in automatically.

## TestFlight deployment

Run EAS commands from `apps/mobile`, not the repository root; the mobile
configuration uses the existing `com.afrochop.app` App Store application.
The `testflight` profile creates a store-signed build connected to
`https://afrochop-api.onrender.com/api`, with a separate `testflight` update
channel. App version `1.0.4` separates the dashboard's native navigation runtime
from earlier builds, including the `1.0.3` TestFlight release.
Mobile build profiles set `SHARP_IGNORE_GLOBAL_LIBVIPS=1` so the API's
workspace dependency uses prebuilt Sharp binaries rather than detecting the
Mac builder's global libvips and attempting an unnecessary source build.

Deploy the API and apply its migrations before distributing the mobile build.
The Render Docker startup runs `prisma migrate deploy`. Configure the server's
verification encryption key and seller storage credentials privately in Render;
local `.env` values are not automatically copied to the hosted service.

```powershell
Set-Location apps\mobile
npx.cmd eas-cli@latest build --platform ios --profile testflight --auto-submit --non-interactive
```

This uploads to App Store Connect/TestFlight, not a public App Store release.
Apple must process the build before testers can install it. Local demo accounts
are not copied to the hosted database.

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

The mobile app starts with a welcome screen and customer/chef account entry, followed by a skippable first-use guide. Customers can register or sign in, set optional text-update consent, browse public cooks, choose a location country in the United States, Canada, or Europe, then use state/region and city suggestions (with manual entry), inspect menus, galleries, social links and reviews, and submit an authenticated quote request. Location country options are separate from the African cuisine-country catalog. State/region and city suggestions reflect public cooks' service areas; customers can type a location before a cook is listed in it. The customer onboarding flow is optional and does not require location permission to browse. Cooks can register or sign in, submit an application with a private encrypted visit address, manage dishes and reusable menu templates, add photos or videos, and save social profile links. AfroChop staff schedule a home visit, record the interview, and complete profile setup; only then does the cook become visible to customers. Cooks can continue editing their profile and adding marketing photos and videos after launch. Private profiles, inactive accounts, and rejected or suspended cooks remain excluded. Verification and Stripe setup remain separate and are still required before paid orders. SMS delivery requires Twilio configuration and customer consent. No end-to-end physical-device test can be claimed without connected iPhone/Android hardware.

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
- Submit a cook application and check its visit/setup status: `POST/GET /api/chefs/me/application` (chef bearer token)
- Manage the staff application queue: `GET /api/admin/verification/chef-applications`; advance visit/interview/profile setup status with `PATCH /api/admin/verification/chef-applications/:id` (admin bearer token)
- Access an applicant's encrypted home-visit address: `GET /api/admin/verification/chef-applications/:id/address` (admin bearer token; access is audited)
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

Chef search supports query text, African cuisine country, dish, service type, city/state/country code, price range, day of week, and pagination. Cuisine-country matching uses linked menu dishes and the chef's declared cuisine specialties. Location filtering currently matches configured service-area city/region exactly; GPS discovery and distance/radius ranking are not yet implemented. Search, direct profile links, public reviews, location suggestions and highlights share the same visibility rules: the cook's profile must be explicitly published after the home visit and profile setup, belong to an active user, and have pending or approved verification. Booking and paid-order approval checks remain separate and unchanged. Existing cooks must submit an application and complete the staff workflow before discovery; the migration does not auto-publish existing profiles. Chef profile, menu, photo/video, availability, and service-area management require a chef bearer token.

Legacy food-gallery endpoints save validated HTTPS image or video URLs. Public binary photo uploads are described above; private verification-document storage, signed document uploads, malware scanning and retention deletion are still not wired. Permits remain quarantined until a trusted scanner reports a clean object. Videos must be directly playable by Expo Video, and short duration is not enforced. Optional Twilio order texts require backend credentials and a saved, opted-in customer phone number; configure Messaging Service STOP handling before enabling them. Delivery failures are logged without rolling back order updates. Quote requests persist the selected service date/time, duration, dietary details and versioned allergy acknowledgment. Accepting a quote reserves the chef's overlapping slot for 24 hours. Customers can review quotes, pay through hosted Checkout, request refund review, confirm receipt after the cook signals completion, and submit eligible reviews. In-home requests can select an owned, verified, unexpired service address; submitting an address does not approve it. See payment operations and verification below for configuration and remaining launch requirements.

## Administrator dashboard (mobile and web)

Name and email are required through account registration and are supplied to staff
from the authenticated applicant's account. Additional cook application fields
are optional, including the visit address. Cooks can submit without these additional
details and staff can follow up using their account email.
The form has no visit country-code field, and phone numbers do not require
an international prefix. When supplied, cooking experience must be whole years
(0–100); country of origin and call/meeting availability are optional.
These details are encrypted separately from the visit
address and revealed together in the audited, administrator-only application
view. They are not added to public profiles or staff notification emails.
Apply migration `20261106193000_cook_application_details` before deploying this
change. Older applications remain readable and display a notice that these
additional details were not collected.

Sign in with an existing, active Cognito-linked administrator account to open the
private cook-application dashboard. On web its route is `/admin`; mobile uses the
same screen and redirects administrators there after sign-in. Customers, cooks,
and farmers cannot access the administrative API. Administrator is not a public
signup/role-selection option. A trusted operator must provision administrator
access separately in the backend; this change does not create an administrator,
promote the first registrant, or automatically link legacy administrator accounts.

Customer setup uses a multi-select country-cuisine dropdown for favorite cuisines;
food discovery uses a single-select country-cuisine dropdown with an All cuisines
option. The setup's former "What are you craving?" dish choices have been removed.
The Food dropdown lists distinct food names from published cooks' menu entries
and dish listings (`GET /api/catalog/available-foods`), excluding private profiles.
Selecting a food searches for that exact food name (case-insensitive), combined
with country cuisine and location filters; All foods clears the food filter.
When a cuisine is selected, the matching food must belong to that cuisine.
Customer location and cuisine preferences are restored from device storage scoped
to both the signed-in user ID and API environment. The former unscoped preferences
key is not migrated because it cannot be safely attributed to an account. Customers
can refresh available foods without restarting the app; resetting discovery clears
the food filter too.

The dashboard provides status filters, name/email/reference search, manual refresh,
application details, audited on-demand access to the private visit address, staff
notes, visit scheduling/rescheduling, interview completion, rejection, and profile
publication. Dates are entered in the administrator device's displayed time zone
and sent as UTC timestamps. Home addresses are not cached in device storage and
are hidden on leaving the detail screen or backgrounding the app.

The Verification and refund reviews screen exposes pending user verification,
credential, permit, and service/jurisdiction decisions through the existing audited
API. It also shows the latest 100 booking payments, refund reasons and outcomes,
refund approval/rejection/retry, and payment reconciliation. Every submitted decision
requires confirmation and review notes (at least 10 characters for decisions);
backend evidence, identity-provider, compliance and payment checks remain enforced.
This is not a grocery-refund workflow or a raw document/incident review console.

Grocery product photo removal sends an explicit null image URL so it persists.
Product editing and cancellation are disabled while the image picker/upload is busy.

The **Approved / setup complete** tracker counts saved applications in the
Published (`profile_setup`) stage across the entire queue, independent of search
and status filters. It updates after publication and on refresh; tap it to view
approved cooks and their setup completion dates. Loading or failed requests show
Loading or Unavailable rather than a misleading zero.

Publication requires a cook-prepared profile photo and at least one food, plus
the ordered visit/interview workflow. The dashboard does not edit profiles, menus,
or media on the cook's behalf. Existing service/compliance checks still apply.
Every update has an explicit confirmation; rejected cooks can resubmit themselves.
Reviews also check the status originally loaded by the dashboard and reject
conflicting staff transitions rather than overwriting a newer review.

Expo Router is the app entry point, with routes in `apps/mobile/src/app/` and shared
UI outside the route directory. Existing marketplace workspaces remain available.
Root npm overrides keep Router's native font/animation peers on SDK 57-compatible
versions rather than allowing optional peers to resolve to the newest SDK.
The added native navigation dependencies require a new signed mobile build
before shipping this dashboard; do not OTA-update the old native runtime.
For browser session persistence, retain the HTTPS same-site web/API setup described
above. This dashboard contains private information and should not be publicly cached.

## Booking flow: discussion, quote, approval, payment

Customer setup includes an optional "What brings you to AfroChop?" multi-select:
bulk meal prep, party/event, postpartum meal support, everyday African meals,
in-home cooking, and Other / just exploring. Customers may skip, clear all
choices, or change them later in Menu > Preferences. Reasons are saved in the
existing device-local preferences scoped by account and API environment; older
saved preferences without reasons remain valid. No medical details are requested.
Reasons are not sent to cooks or marketing providers, do not limit discovery,
and do not create bookings or bypass discussion, quote approval, or payment.

1. The customer opens the cook's profile and starts an in-app conversation.
2. Both the customer and cook must send at least one message to each other.
   The conversation response exposes `discussionComplete`, based on the full
   conversation history rather than only the current page of messages.
3. The customer continues from that conversation to submit the discussed booking
   details and allergy acknowledgment. This is a quote request, not a payment.
4. The assigned cook reviews the request, resolves any allergy review, and sends
   a quote. New or revised quotes on historical requests also require a two-way conversation.
5. The customer approves the quote, reserving the existing 24-hour payment hold,
   then separately proceeds to Stripe payment. Approval alone never charges them.

The API rejects new quote requests and cook quotes without the two-way message
exchange, including when demo compliance bypass is enabled. Existing accepted
quotes and historical booking/payment management remain supported. Checkout
requires an accepted quote and an awaiting-payment booking; pending, declined,
or expired quotes cannot start checkout.

## Retired grocery infrastructure (historical reference only)

The customer store and administrator store screens have been removed. Old
`/grocery` links redirect to chef discovery. The public grocery API returns a
closed, empty catalog; quotes, checkout, store settings, product edits, and
uploads return HTTP 410. New cook grocery-shopping offerings, booking requests,
permit submissions, searches, and service approvals are rejected.

Historical database models, orders, payment webhooks, reconciliation, and
authorized history/fulfillment endpoints remain to avoid stranding prior payments.
Existing historical transactions must be handled through authorized backend
operations and support; there is no grocery dashboard in the app.
Keep any credentials required to settle existing payments. Do not enable new
grocery payments or follow the former launch instructions below.

The following describes the retired implementation, not current app features:

Grocery sales belong exclusively to AfroChop. Independent farmer registration and
role selection are disabled, the farmer API module is no longer mounted, and
public seller uploads are limited to cooks. Historical farmer data remains intact.
Approved cooks retain their cooking services and profile marketing.

Customers can open `/grocery` in the mobile/web app or enter the store directly
from the customer home screen. Grocery shopping and cooked-food requests use
separate carts and checkouts. The administrator dashboard
includes grocery settings, products, order reconciliation, private shipping
addresses, and fulfillment tracking. Grocery mutations require an active admin
whose UUID exactly matches `GROCERY_OWNER_USER_ID`; other admins cannot sell.
The owner can choose and upload an optional product photo from the product editor.
Uploads are resized, converted to JPEG, limited to 2 MB, and stored under the
grocery product media path using the configured photo-storage bucket/CDN.
When the active catalog is empty, the store displays clearly marked African
grocery product ideas as non-purchasable placeholders. They are not inventory,
and their ingredients, allergens, pricing, packaging, and shipping details must
be verified before actual products are listed.

An authorized operator can provision an **existing verified, active Cognito-linked
account** using `node scripts/provision-owner.mjs <account-email>` from `apps/api`
with a private database connection. The default is a dry run; add `--apply` only
after checking the displayed UUID. Active bookings and held/disputed money block
promotion. Set that UUID in the backend's `GROCERY_OWNER_USER_ID`, then sign out/in.
This script is not a public API and never creates an account automatically.

Before opening the store:

- Apply migration `20261106020000_owner_grocery_store` using the existing migration
  deployment command. It is additive and preserves historical farmer records.
- Configure `VERIFICATION_ENCRYPTION_KEY`, the Stripe secret key, a separate
  `GROCERY_STRIPE_WEBHOOK_SECRET`,
  `SHIPPO_API_TOKEN`, and an HTTPS `GROCERY_CHECKOUT_RETURN_URL` pointing to `/grocery`
  on your published website. Keep credentials and addresses out of tracked files.
- Enter the **actual** full dispatch/pickup address privately in owner settings.
  La Plata, MD alone cannot produce a valid shipping quote.
- Add only shelf-stable groceries with prices in integer cents, ingredients,
  allergen/cross-contact notices, and the correct Stripe product tax codes.
- Configure Stripe Tax origin and applicable registrations; automatic tax shown
  in Checkout does not replace the merchant's registration obligations.
- Register `/api/grocery/webhooks/stripe` for `checkout.session.completed` and
  `checkout.session.expired`, with its signing secret in `GROCERY_STRIPE_WEBHOOK_SECRET`.
  Booking payments retain their existing endpoint and `STRIPE_WEBHOOK_SECRET`.
  Distinct Stripe endpoints have distinct signing secrets.
- Test purchase, expiration, reconciliation and fulfillment before deliberately
  setting `GROCERY_LIVE_PAYMENTS_ENABLED=true` in a production backend.

Pickup has no shipping fee. Shipping rates are calculated by Shippo for the 50 US
states and DC, including Alaska and Hawaii, subject to carrier service availability.
There is no invented universal flat fee and no unsupported international shipment.
Each unit is a separately packed parcel using the entered **packed** weight and
dimensions; carts are capped at 20 units. Multi-parcel support depends on connected
carriers. Missing configuration or unavailable rates produces an explicit error.
No labels are purchased automatically. Buy labels in Shippo and enter tracking
before marking a paid shipping order shipped; pickup orders can be marked collected.

Quotes expire after 10 minutes. Checkout locks prices/rates/address and reserves
inventory atomically. Stripe calculates tax before charging. Owner stock edits
reject stale versions instead of overwriting inventory reserved by another checkout.
Signed payment events update orders idempotently. A minute-interval reconciliation
loop checks known sessions after checkout expiry (35 minutes), recovering payments
or releasing unpaid expired reservations if webhooks were missed.
Ambiguous session-creation failures **retain reserved stock**, report an explicit
error, and require retrying the same order promptly or locating its checkout in
Stripe and entering its session ID in the owner dashboard. Never release stock
blindly or fulfill an unconfirmed payment. Refunds, disputed orders, labels and
customer shipping emails must currently be handled by the operator in Stripe/Shippo;
there is no automated refund/cancellation dashboard in this first version.

Shipping and origin addresses are encrypted at rest, never included in public
catalog/order lists, and private shipping-address reads are audited. The origin is
disclosed only to the owner, shipping provider and customers selecting pickup.
Customer-entered address and owner settings stay in component memory (not persistent
device storage); revealed order addresses clear when leaving or backgrounding.

## Staff cook-application alerts

After a new cook application (or a rejected application's resubmission) commits,
the API attempts email alerts through Amazon SES and text alerts through Twilio.
Returning an already-submitted application does not send another alert. Neither
channel includes the cook's home address, applicant contact details, or private
interview notes: notifications contain the application reference and instructions
to check the staff-only application queue; email also includes the submission time.
There is no staff dashboard or public application-review link yet.

Configure these values **on the API only**, in the ignored root `.env` for local
development or your deployment's secret/environment settings:

| Variable | Purpose |
|---|---|
| `STAFF_APPLICATION_EMAILS` | Comma-separated staff inboxes, such as `operations@example.com,team@example.com` |
| `STAFF_APPLICATION_SMS_NUMBERS` | Comma-separated staff phone numbers in E.164 format, such as `+14155550123`; include only staff who agreed to receive alerts |
| `STAFF_ALERTS_FROM_EMAIL` | Plain sender email address verified in Amazon SES |
| `AWS_REGION` | SES region containing the verified sender identity |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Dedicated backend SES credentials where runtime IAM roles are unavailable; grant only the needed `ses:SendEmail` access to the verified identity |
| `AWS_SESSION_TOKEN` | Required only when using temporary AWS credentials |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | Existing Twilio Messaging credentials and service |

Prefer IAM runtime roles to static keys. Do not reuse the seller-photo upload
credentials. SES sandbox accounts can send only to verified recipients (or the
SES mailbox simulator); request production access before using unverified staff
inboxes. Configure the sender domain's SPF/DKIM records and ensure the SES identity
and credentials match the selected region. Twilio trial accounts also restrict
recipients; complete any required sender registration and geographic permissions.
Staff SMS messages include STOP instructions; respect opt-outs and do not
automatically re-enrol staff who unsubscribe.

Each recipient is sent a separate message. Email and SMS failures are isolated;
they never roll back a saved application. Missing/invalid configuration and
provider failures are explicitly logged without logging recipient addresses,
phone numbers, credentials or provider error messages. Success logs indicate
provider acceptance, **not confirmed inbox/handset delivery**. SES performs up to
three transport attempts for retryable failures; there is no durable background
retry queue or delivery-status callback handling. Monitor errors and reconcile
against `GET /api/admin/verification/chef-applications` so missed alerts do not
leave applications unreviewed.

After configuring recipients and provider access, rebuild/restart the API to load
the new service/configuration. No mobile release or database migration is needed
for these alerts. Real email/SMS delivery must be verified with opted-in test
recipients before launch.

## Public cook photos and historical seller media

Only cooks can upload seller media in the owner-operated store model. Farmer
HTTP routes and independent grocery sales are disabled; farmer storage/schema
details below describe preserved historical data rather than active selling APIs.

Seller marketing is separate from paid-order approval: public seller profiles and
showcase photos do not require Stripe onboarding. Both seller dashboards now have
an **Add/Change Profile Picture** control and a **Food & Farm Feed** with
captions and removal controls. Sellers can select up to 10 photos or 3 videos per
batch, preview each selection, and write an individual caption (up to 500 characters).
Each item is a separate public post, not a multi-item album. Uploads run sequentially;
on failure, successful posts stay published and only the remaining selections are
retained for retry while the screen stays open. Selections are not persisted across
app restarts. Additional batches are supported without a total gallery cap, subject
to the existing per-minute limits (10 photos / 3 videos). Farmer and chef public
profiles show newest-first feed cards with complete captions, optional upload dates,
and 12 posts initially; **Show More Posts** reveals older posts. Videos are opened
on demand, never autoplayed. This progressively renders the gallery but does not
paginate the existing gallery API responses. Existing
externally hosted image URLs remain supported.

The API accepts authenticated multipart uploads through
`POST /api/media/profile-photo` and `POST /api/media/gallery`, with the file in the
`file` field and an optional gallery `caption` (maximum 500 characters).
`GET /api/media/gallery` lists the signed-in seller's uploaded images;
`DELETE /api/media/gallery/:id` removes an owned uploaded gallery photo or video.
Customers and sellers without an active seller profile cannot upload.
No client-supplied seller ID or storage key is accepted.

Configure the following **server-only** environment variables on the API:

For AWS development storage, see [Terraform photo storage](infra/photos/README.md)
for a private S3 bucket with public CloudFront delivery, local state outside
OneDrive, plan/apply instructions, and runtime identity setup. Sensitive
verification documents require separate private infrastructure.

- `SELLER_PHOTOS_BUCKET`
- `SELLER_PHOTOS_REGION` (defaults to `us-east-1`)
- `SELLER_PHOTOS_ENDPOINT` (optional, for S3-compatible providers)
- `SELLER_PHOTOS_ACCESS_KEY_ID`
- `SELLER_PHOTOS_SECRET_ACCESS_KEY`
- `SELLER_PHOTOS_PUBLIC_URL` (HTTPS bucket/CDN base URL, without query parameters)

### Current local Docker bucket

Local Compose defaults point to the manually created bucket `afrochop` in
`us-east-2`, with public delivery at
`https://d2jbz102fyu4za.cloudfront.net`. These resources are externally managed,
not the development resources in the Terraform configuration. Do not apply that
configuration to connect this bucket; importing it requires a separate reviewed
configuration/state migration.

An authorized IAM administrator should create a dedicated
`afrochop-photos-local` IAM user with no console password, groups, or other
policies, and add the inline policy in
[uploader-policy.json](infra/photos/uploader-policy.json). Create an access key
for this local application through IAM, then enter its ID and secret directly
into the ignored repository-root `.env` as `SELLER_PHOTOS_ACCESS_KEY_ID` and
`SELLER_PHOTOS_SECRET_ACCESS_KEY`. Do not paste keys in chat, commit them, or
reuse provisioning credentials. Recreate the API container with
`docker compose up -d --no-deps api` after changing the local settings.
Local Compose uses environment variables for these credentials; anyone with
Docker administrator access can inspect them. Prefer runtime roles or supported
federation for deployed environments, and rotate/delete local keys when no
longer needed.

All four S3 public-access blocks were verified enabled. The bucket policy grants
CloudFront distribution `EK2ACL7RCWQ5W` read access, currently over the whole
bucket. Keep only public photos in this bucket; tighten the CloudFront policy
to `arn:aws:s3:::afrochop/sellers/*` if no other public content depends on it.
CloudFront origin configuration and an authenticated upload/public-download
round trip still need verification. Missing credentials deliberately leave
uploads unavailable rather than borrowing a developer's AWS profile.

Use a dedicated photos bucket and least-privilege credentials with object put and
delete access only to `sellers/*`. Configure public read access/CDN delivery for
that prefix only; never use the private verification-document bucket. Uploads
pass through the API, so browser uploads do not need bucket CORS configuration.
These images are intentionally public and must not contain sensitive documents.
The app optimizes images before upload. The API limits uploads to 2 MB, decodes
JPEG/PNG input with a 20-megapixel ceiling, rejects animation, strips metadata,
and re-encodes JPEG output (640-square profile pictures; up to 1600px galleries).
Generated object names prevent overwriting another seller's images. Gallery
removal deletes the object at the origin, but CDN/browser caches may retain it.
Replacing a profile picture updates the public reference; old profile-image
objects currently require an operator retention/cleanup policy.

### Direct showcase video uploads

Cooks can choose a local MP4 or MOV from the profile showcase,
preview it, add a caption (maximum 500 characters), and publish it. The API
accepts authenticated multipart `POST /api/media/gallery/video` with `file` and
optional `caption`. The maximum file size is 50 MiB (52,428,800 bytes, shown as
50 MB in the app), and the maximum duration is 60 seconds. Input resolution is
limited to 4K (4096 on either side, at most 4096 x 2160 pixels). Unsupported,
unreadable, empty, oversized, and over-duration clips return explicit errors.
Existing image endpoints remain limited to 2 MB; external chef media links
remain supported and are not subject to the uploaded-file processing limits.

The API uses `ffprobe` to validate actual container/stream metadata, then FFmpeg
to strip metadata and chapters and generate H.264/AAC MP4 with a maximum
1280-pixel side, 30 fps, and fast-start playback. It validates the processed
output before publishing under `sellers/<user-id>/<random-id>.mp4` with
`Content-Type: video/mp4`. The existing bucket/CDN and upload IAM policy support
these keys; no public bucket or new AWS permission is required. No original
video is stored in S3. Temporary processing files are removed after the request;
failed database attachments trigger object cleanup.

The Docker API image installs FFmpeg (including ffprobe). Non-Docker API
environments need both executables on PATH. Missing tools explicitly disable
video processing. Each API instance admits only one video upload at a time
before reading the multipart body, and limits processing to two encoder threads
and a two-minute transcode timeout. Busy uploads return 503 and can be retried.
This synchronous first version has no resumable/background upload or automatic
retry; keep the app open while uploading. Configure any deployment proxy body
limit above 50 MiB plus multipart overhead and its timeout above processing time.
Monitor CPU, memory, temporary disk, abuse, and public-media storage costs before
increasing traffic. A queued transcoding service is the next scaling step.

`GET /api/media/gallery` returns the owner's photos and videos newest first;
public chef/farmer profiles also expose `mediaType` for playback. Videos load
only after tapping Watch Video, do not autoplay, and release the player when
closed. Apply migration `20261103180000_seller_video_uploads` before deploying:
it adds farmer gallery `mediaType`, defaults existing records to `image`, and
does not delete data. Rebuild/restart the Docker API after the change. The
image-picker permission wording includes videos; installed app permission text
changes require a new native build. No new Expo dependency is introduced.

Marketing videos and photos are public, not identity evidence. Only share media
you own or have permission to publish; never post IDs or verification selfies.
There is no automated content moderation in this first version. Production
reporting, takedown, copyright/consent review and retention processes are still
required. Deleting a video removes the current origin object and gallery entry,
but cannot purge existing browser/CDN caches or private retained S3 versions.

Deploy the additive `farmer_photos` Prisma migration with the API. No existing
seller records or photos are deleted. Missing storage configuration returns an
explicit error, not a simulated successful upload. Local Docker smoke checks
verified real chef/farmer video uploads, public gallery records, CloudFront MP4
range delivery, and removal using temporary test accounts and synthetic clips.
Real FFmpeg checks accepted 60-second clips and rejected 61-second/corrupt clips.
Physical iPhone/Android picking and playback still need device testing.
The new Expo photo modules require
a new iOS/Android build before use in the installed app, rather than only an OTA
JavaScript update.

## Customer and chef verification

### Shared account entry and one-time roles

All marketplace users use one sign-up/sign-in form. Registration collects a name,
email, and password, then returns the user to sign-in; there is no role-specific
login. After authentication, `requiresRoleSelection` determines whether to show
Customer, Chef / Cook, or Farmer. Registration ignores legacy clients' requested
roles and creates a pending account with a placeholder customer role. That
placeholder does not authorize customer actions before selection.

`GET /api/auth/me` reports the current account and selection requirement;
`POST /api/auth/me/role` accepts `{ "role": "customer" | "chef" }`
and returns a fresh session/token. Role selection is persisted once and cannot
be changed through this endpoint afterward. Retrying the same selection safely
returns a session; selecting another role returns a conflict. Administrators
are excluded from marketplace role selection and cannot promote users through it.
The JWT guard checks current database roles and blocks all protected actions
for pending non-admin accounts except these two onboarding endpoints.

Apply migration `20261103190000_shared_account_roles` before deploying the API.
It adds nullable `users.roleSelectedAt` without backfilling existing accounts:
all existing non-admin users must choose/confirm a role too. Confirming their
current role remains allowed with active work. Switching to a different role
is blocked by active bookings/quotes, open farm inquiries, pending payouts,
open refunds/disputes, or payment errors. Resolve those under the current role
or through support first. Role changes hide previous seller profiles but
preserve profiles, media, booking history, and payment records. New seller
profiles start private and become public when profile setup is saved.

The app validates restored sessions against `/auth/me` rather than trusting a
locally saved role. Role changes invalidate old-role JWTs; users on other
devices must sign in again. Account choice does not verify identity, approve
food safety, enable payouts, or replace the separate compliance gates.

Registration creates pending email and phone verification records. Customers can view status, update an E.164 phone number, and verify email/phone codes from the booking form or My Requests. Changing a phone resets its verification. Configure `TWILIO_VERIFY_SERVICE_SID`, Twilio credentials, SMS delivery and the Twilio Verify email integration before enabling codes. Authenticated `POST /api/verification/me/:type/send-code` and `check-code` endpoints support only `email` and `phone`; checks accept `{ "code": "..." }`. Codes are checked by Twilio, never returned to the app or stored as plaintext. Challenges expire after ten minutes, allow five attempts, and enforce a 60-second resend delay and five sends per hour. Challenges are single-use and bound to the saved contact, including across contact changes. Provider failures surface explicitly; absent credentials never mark a user verified. Booking requests still fail closed unless email and phone are verified and unexpired; configured rules can require additional customer identity verification.

Chefs have separate email, phone, identity, overall AfroChop approval, Stripe Connect, credential, permit, background-screening, and per-service/per-jurisdiction states. Stripe eligibility does not establish identity, food-safety, or screening approval. An administrator cannot approve a chef profile without verified email, phone, identity, and eligible Stripe Connect status. Service approval additionally requires an active jurisdiction rule and all rule-required credentials, permits, consented screening, and Stripe eligibility. Booking requests and chef quotes require the applicable service approval.

Verification administration is available through `/api/admin/verification/*`. The cook dashboard mounts the verification checklist, while customer verification and address submission/selection are mounted in authenticated customer screens. A dedicated administrator dashboard is not implemented. Identity and background screening remain disabled by default; approved vendor execution, consent, privacy, retention and legal review are still required. Contact OTPs do not establish identity or food-safety approval.

Phones and addresses are encrypted with AES-256-GCM and indexed with HMAC-SHA-256. Set a generated base64 32-byte `VERIFICATION_ENCRYPTION_KEY` in backend secrets; never commit or reuse it across environments. The owner's authenticated dashboard returns the phone's last four digits and readable address labels, not encrypted storage fields. In-home bookings require an owned, verified, unexpired address for the selected jurisdiction. Authorized administrators can inspect an address through `GET /api/admin/verification/service-addresses/:id`; the assigned cook can inspect it through `GET /api/verification/bookings/:id/service-address` only during a paid active booking. Reads are audited and marked no-store. Address approval remains disabled by default (`ADDRESS_VERIFICATION_ENABLED=false`) until an approved validation provider and review procedure exist; no geocoding or vendor execution is implemented.

### Marketing contact export

The authenticated `PATCH /api/auth/me/marketing-contact-preference` endpoint stores a user's marketing-contact preference and synchronizes enabled contacts to a Google Sheet. Canada and European countries require an explicit opt-in; other supported locations default to enabled with an opt-out control. The sheet contains account ID, role, name, email, phone, country, and last-sync time. Phone numbers are decrypted only server-side for an enabled export; turning sharing off clears that user's sheet row. The sheet is a promotional-contact destination only, not the account system of record.

To enable this integration, enable the Google Sheets API, create a dedicated Google service account, share the target spreadsheet with its email, and configure `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SHEET_NAME`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` in the API environment. Protect the service-account key as a backend secret. If credentials are absent, no contact data is sent to Google and the API reports that contact sync is not configured. Google Sheets availability is required for a configured preference change to synchronize; if a sync fails, the preference remains saved, an explicit error is returned, and retrying the preference endpoint reconciles the sheet. Obtain legal/privacy review and explain the Google Sheets transfer in the published privacy notice before enabling this destination in production.

Credential metadata stores provider references and expiration dates, not raw identity/background reports. The new verification-document table stores private object keys and malware scan state, but object storage/upload/scanning and authorized document review have not been integrated; do not submit real sensitive documents until those controls exist. The migration preserves any pre-existing permit document references and quarantines HTTP(S) URLs rather than deleting them. Do not launch these verification flows as production-certified checks.

## Stripe Connect onboarding and payment configuration

Stripe Accounts v2 recipient account creation happens when the chef explicitly starts payout onboarding after setting a supported two-letter country code; saving a discovery profile does not require Stripe credentials. Stripe's hosted onboarding link is generated on request, single-use, and opened in the system browser (Stripe-hosted onboarding is not supported inside an embedded WebView). The app never collects or stores bank account details. The connected-account identifier, capability state, Stripe requirements, and a short-lived hashed one-time refresh token are stored in PostgreSQL. Onboarding return and refresh destinations come only from backend environment configuration; clients cannot supply redirect URLs. The reusable payout status component is `apps/mobile/components/ChefPayoutSetup.tsx`; it needs to be mounted in a signed-in chef dashboard.

Set backend-only `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CHECKOUT_RETURN_URL`, `STRIPE_CONNECT_RETURN_URL`, and `STRIPE_CONNECT_REFRESH_URL` in `.env` or the production secrets manager. `CHECKOUT_RETURN_URL` must be an HTTPS URL in production; it is required there. Never put Stripe secret keys in Expo environment variables. Use HTTPS URLs in production. The Stripe Dashboard webhook must listen for Connect `account.updated` and Checkout `checkout.session.completed` and `checkout.session.expired` events, and point to `POST /api/payments/webhooks/stripe`; raw-body signature verification is enabled by Nest. The handler updates transfer capability, payout status, and outstanding requirements. A chef becomes transfer-eligible only when Stripe reports the transfer capability as active. Account eligibility is not a transfer, payout, or promise of immediate bank settlement.

Payment configuration is in basis points; the API fallback is 10% chef commission and 0% customer fee, while an existing/seeded configuration takes precedence. Both app roles read configured rates instead of hardcoding estimates. Administrators use `GET/PATCH /api/payments/admin/configuration` to auditably change them. The accepted quote, customer fee, commission, chef share, currency and destination are snapshotted before Checkout creation in integer cents. The full quote plus separately disclosed customer fee is charged; clients cannot override amounts. Checkout currency is derived from the cook market country (for example USD, CAD, GBP, EUR, CHF and other supported local currencies), with a USD fallback when no country is set.

The chef workspace's Commission policy page shows the configured rate and a 100-unit example in the profile country's currency: at 10%, the AfroChop fee is 10 and the chef share is 90. It explains platform-paid processing fees, separately disclosed customer fees, refund/dispute adjustments, completion-based release and Stripe bank-payout timing. The example is illustrative, not an account balance. Chefs can refresh the rate or navigate directly to Payment setup.

Stripe assigns the platform responsibility for processing fees and negative connected-account balances in this Connect configuration. Stripe Connect is not escrow. Charges are made on the platform; a separate cook transfer is released only after the cook marks delivery/service complete and the customer confirms receipt. Refund requests, pending/existing refunds, unresolved/lost disputes or reversed transfers block release. Stripe manages subsequent bank payouts; a transfer is not bank-settlement confirmation. Live charges/transfers require `STRIPE_LIVE_PAYMENTS_ENABLED=true`, `NODE_ENV=production`, and no compliance bypass. Keep the switch false until counsel, Stripe onboarding, jurisdiction approvals, test-mode checks and payments operations are signed off.

Checkout expiration matches the 24-hour hold. Checkout creation, transfers, refunds and reversals use stable idempotency keys. Payment-row locks serialize local money operations. Reconciliation checks current Stripe state, including remote transfers/refunds after interrupted requests, instead of trusting webhook order. Amount, currency, Checkout association, destination and transfer amount are verified. The append-only operational ledger records charges, processing fees, transfers, refunds, reversals and dispute balance movements; it is not a tax system or audited double-entry general ledger.

### Refund and payment operations

Customers may submit one full-refund request per booking for admin review. No automatic cancellation penalty or non-refundable deposit policy is invented. Approval is persisted before calling Stripe, leaving failed attempts visibly retryable. A previously released transfer is reversed before an approved refund. Successful full refunds cancel the booking. Insufficient recoverable balance, partial/external refunds, failed Stripe operations and incompatible settlement currencies require admin intervention; the app does not silently mark refunds successful.

Subscribe the signed webhook to Checkout completed/expired/async-payment-success events, charge refunds, refund updates, dispute updates and `transfer.reversed`, as well as connected-account updates. Post-transfer refunds/disputes trigger recovery; failures return an error for webhook retry and require operational follow-up. Reversed transfers are not automatically reissued after a dispute is won. Dispute evidence, deadlines and exceptional recovery remain managed in the Stripe Dashboard.

Authenticated operations (IDs are booking IDs):

| Endpoint | Role / purpose |
|---|---|
| `GET /api/payments/bookings/:id` | Participant/admin: payment and refund status |
| `POST /api/payments/bookings/:id/release` | Participant/admin: retry an eligible post-completion transfer |
| `POST /api/payments/bookings/:id/refund-request` | Customer: `{ "reason": "At least ten characters" }` |
| `GET /api/payments/admin/bookings` | Admin: latest 100 payments, errors, refunds and ledger |
| `POST /api/payments/admin/bookings/:id/reconcile` | Admin: reconcile current Stripe state |
| `POST /api/payments/admin/bookings/:id/refund-review` | Admin: `{ "approved": true, "notes": "Evidence-backed review notes" }`; repeat approval to retry |

The API worker polls every minute when Stripe is configured and the live safety gate permits it. It reconciles up to 25 payments per pass whose last reconciliation is older than 15 minutes, retries approved refunds, and releases eligible completed bookings. Multiple API instances share payment-row locking and Stripe idempotency. Failures remain recorded and logged; reversed-transfer recovery and dispute evidence still need administrator follow-up.

Apply `20261102020000_booking_money_operations` and regenerate Prisma before running this API. Older paid bookings remain support-only: fee/destination snapshots are not guessed or automatically backfilled. A dedicated admin UI, separate final payments, tax reporting, bank-payout reconciliation and approved identity/background/address providers remain launch work. Test complete bookings, duplicate webhooks, delivery confirmations, held payouts, refunds/reversals and disputes in Stripe test mode before live use.

## Food safety and legal review

Menu entries contain structured major-allergen values, known ingredients, and known cross-contact risks. Customer booking requests require the current allergy-notice acknowledgment and record its version and timestamp. Allergy disclosures stay attached to the booking and are only returned to the customer or assigned chef. A request with disclosed allergens remains pending until the assigned approved chef explicitly accepts or declines; quote creation is blocked while pending and blocked after decline. Admins can configure jurisdiction/service rules, review permit status and expiration, investigate incidents, and suspend a provider during an urgent investigation. Unconfigured jurisdiction/service combinations fail closed and cannot accept booking requests.

This implementation is an initial control foundation, not a legal or food-safety certification. Provider approval does not guarantee safety. The mobile app persists recipe disclosures and a versioned allergy acknowledgment with customer booking requests, but cannot promise allergen-free food. The cook must review and explicitly respond to disclosed allergies before quoting. Urgent incident reports are marked escalated and appear in the admin queue; out-of-band paging, email, and push notifications are not implemented. Do not launch paid services until counsel and food-safety professionals have reviewed the operating jurisdictions, configured compliance rules, approved data retention and incident contacts, and reviewed every document in [legal/drafts/README.md](./legal/drafts/README.md). All legal documents are explicitly drafts. Retention periods remain unapproved placeholders and no deletion job is implemented.

## Chef ratings and reviews

Reviews are accepted only for a booking owned by the authenticated customer after both the customer and assigned chef confirm completion. A database uniqueness constraint enforces one review per booking; the API limits edits to seven days, accepts up to five HTTPS photo URLs, and stores optional private feedback ratings for food quality, communication, punctuality, and professionalism. Private category feedback is returned only to that chef and is excluded from public review payloads. Public averages and counts include only published reviews. Review reports are rate-limited and audited moderation/appeal decisions recalculate the chef rating; reports alone do not hide a review, and unfavorable sentiment by itself is not a moderation reason.

The mobile chef profile displays average rating, verified-review count, customer comments/photos, chef responses, and newest/highest/lowest sorting. Customers can confirm completion in My Requests and submit an eligible booking review there; reusable rating, summary, review-card, chef-response, and authenticated create/edit form components are in `apps/mobile/components/Reviews.tsx`. The chef dashboard, report controls, and administrator moderation screen still need to be connected to signed-in workflows. Review photo support currently stores HTTPS URL references; private binary uploads are not implemented.

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
- [x] Persisted allergen/acknowledgment flow in a signed-in mobile booking request
- [ ] Private binary storage for permit and receipt documents
- [ ] Automated permit expiry reminders and retention/deletion jobs
- [x] Quote acceptance with transactional time-slot conflict prevention and a 24-hour payment hold
- [x] Customer quote review, hosted checkout, payment refresh, completion confirmation, and eligible review flow
- [x] Ordered cook delivery signal and customer receipt confirmation before transfer release
- [x] Payment snapshots, operational ledger, admin-reviewed refunds, dispute holds, recovery and reconciliation APIs
- [x] Customer contact-code verification and encrypted service-address submission/selection
- [ ] Stripe test-mode deposit and final-payment flows
- [ ] Binary image upload to private object storage
- [ ] Admin verification and chef approval interface
- [ ] PostGIS distance matching and map/list discovery
