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

## TestFlight deployment

Run EAS commands from `apps/mobile`, not the repository root; the mobile
configuration uses the existing `com.afrochop.app` App Store application.
The `testflight` profile creates a store-signed build connected to
`https://afrochop-api.onrender.com/api`, with a separate `testflight` update
channel. App version `1.0.1` also separates its native runtime from earlier
`1.0.0` builds.
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

The mobile app starts with a welcome screen and customer/chef account entry, followed by a skippable first-use guide. Customers can register or sign in, set optional text-update consent, browse public cooks, choose a location country in the United States, Canada, or Europe, then use state/region and city suggestions (with manual entry), inspect menus, galleries, social links and reviews, and submit an authenticated quote request. Location country options are separate from the African cuisine-country catalog. State/region and city suggestions reflect public cooks' service areas; customers can type a location before a cook is listed in it. The customer onboarding flow is optional and does not require location permission to browse. Cooks can register or sign in, manage dishes and reusable menu templates, add externally hosted food photos or videos, and save social profile links. Submitted cook profiles are public immediately, including while verification is pending; visibility does not complete verification or Stripe setup, or authorize paid orders. Private profiles, inactive accounts, and rejected or suspended cooks are excluded. SMS delivery requires Twilio configuration and customer consent. No end-to-end physical-device test can be claimed without connected iPhone/Android hardware.

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

Chef search supports query text, African cuisine country, dish, service type, city/state/country code, price range, day of week, and pagination. Cuisine-country matching uses linked menu dishes and the chef's declared cuisine specialties. Location filtering currently matches configured service-area city/region exactly; GPS discovery and distance/radius ranking are not yet implemented. Search, direct profile links, public reviews, location suggestions and highlights share the same visibility rules: public profiles belonging to active users with pending or approved verification. Booking and paid-order approval checks remain separate and unchanged. Existing public pending profiles become discoverable when this API change is deployed; no migration or automatic verification approval is needed. Chef profile, menu, photo URL, availability, and service-area management require a chef bearer token.

Legacy food-gallery endpoints save validated HTTPS image or video URLs. Public binary photo uploads are described above; private verification-document storage, signed document uploads, malware scanning and retention deletion are still not wired. Permits remain quarantined until a trusted scanner reports a clean object. Videos must be directly playable by Expo Video, and short duration is not enforced. Optional Twilio order texts require backend credentials and a saved, opted-in customer phone number; configure Messaging Service STOP handling before enabling them. Delivery failures are logged without rolling back order updates. Quote requests persist the selected service date/time, duration, dietary details and versioned allergy acknowledgment. Accepting a quote reserves the chef's overlapping slot for 24 hours. Customers can review quotes, pay through hosted Checkout, request refund review, confirm receipt after the cook signals completion, and submit eligible reviews. In-home requests can select an owned, verified, unexpired service address; submitting an address does not approve it. See payment operations and verification below for configuration and remaining launch requirements.

## Public seller photos (chefs, cooks, gardeners and farmers)

Seller marketing is separate from paid-order approval: public seller profiles and
showcase photos do not require Stripe onboarding. Both seller dashboards now have
an **Add/Change Profile Picture** control and a **Showcase Your Work** gallery with
captions and removal controls. Farmer public profiles include the gallery; chef
public profiles continue using their existing food-photo gallery. Existing
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

Chefs and farmers can choose a local MP4 or MOV from the profile showcase,
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
`POST /api/auth/me/role` accepts `{ "role": "customer" | "chef" | "farmer" }`
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

Payment configuration is in basis points; the API fallback is 10% chef commission and 0% customer fee, while an existing/seeded configuration takes precedence. Both app roles read configured rates instead of hardcoding estimates. Administrators use `GET/PATCH /api/payments/admin/configuration` to auditably change them. The accepted quote, customer fee, commission, chef share, currency and destination are snapshotted before Checkout creation in integer cents. The full quote plus separately disclosed customer fee is charged; clients cannot override amounts. Current settlement is USD-only, without currency conversion or automatic tax calculation.

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
