# Development photo storage

This configuration targets AWS account `379959319067` in `us-east-1`. The
bucket name is `afrochop-photos-dev-379959319067-us-east-1`. This is not a
production or verification-document bucket.

## Resources and access

- Private, ACL-disabled S3 bucket with all four public-access blocks.
- AES-256 server-side encryption, versioning, and HTTPS-only S3 access.
- CloudFront default HTTPS domain, signed S3 origin access (OAC), read-only
  viewer methods, and origin read permission only for `sellers/*`.
- `PriceClass_100` limits edge locations, not requests or total spend.
- An unattached IAM policy permits only object put/delete under `sellers/*`.
  No IAM user, access key, or permissions for the provisioning identity are
  created or changed.
- Incomplete multipart uploads expire after one day. Noncurrent object versions
  expire after 30 days; current photos have no automatic expiration.
- Bucket destruction is blocked by Terraform, and nonempty-bucket deletion is
  disabled. These safeguards are not a backup against account-level deletion.

Uploads pass through the API, so no browser-to-S3 CORS rule is required.
Sensitive documents must never be uploaded here. CloudFront can publish any
object in `sellers/*`; other prefixes and anonymous direct S3 reads are denied.
The bucket has no website endpoint.

## Initialize and review

Run from the repository root in PowerShell with a locally configured AWS profile.
Do not put credentials in Terraform variables, source files, or mobile settings.

```powershell
$stateDir = Join-Path $env:USERPROFILE '.afrochop\terraform\photos-dev'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
$env:TF_DATA_DIR = Join-Path $stateDir '.terraform'
terraform -chdir=infra\photos init "-backend-config=path=$stateDir\terraform.tfstate"
terraform -chdir=infra\photos fmt -check
terraform -chdir=infra\photos validate
terraform -chdir=infra\photos plan -out="$stateDir\photos.tfplan"
terraform -chdir=infra\photos show "$stateDir\photos.tfplan"
```

Set `TF_DATA_DIR` in each new shell before using this configuration. State,
backups, the plan, and provider downloads stay outside the OneDrive repository.
Commit `.terraform.lock.hcl`, but never state, plans, credentials, or local
variable files. Protect and back up the state directory using an approved
private backup location; it is local state with no team locking or shared
recovery. Do not initialize a second empty state for these resources. Move to a
shared encrypted backend with locking before multiple people manage them.

The provider rejects credentials for another account. If changing the account,
review the `aws_account_id` variable and resulting globally unique bucket name
before planning; this configuration deliberately fixes development and region.
If the bucket name is already taken, stop and resolve ownership/name explicitly,
rather than importing an unknown bucket or deleting anything.

## Apply only after approval

S3 storage, retained versions, requests, CloudFront requests/transfer and optional
invalidations may incur AWS charges. No budget, spend cap, WAF, custom domain,
access-log bucket, or production monitoring is provisioned. Review current AWS
pricing and configure billing alerts separately; alerts are not spending limits.

After reviewing and approving the exact saved plan:

```powershell
terraform -chdir=infra\photos apply "$stateDir\photos.tfplan"
terraform -chdir=infra\photos output
```

CloudFront deployment can take several minutes. Re-plan if the saved plan is
stale or the configuration changed. Never use `-auto-approve` as a replacement
for plan review.

## Connect the API and verify

Use the outputs for `SELLER_PHOTOS_BUCKET`, `SELLER_PHOTOS_REGION`, and
`SELLER_PHOTOS_PUBLIC_URL`. Leave `SELLER_PHOTOS_ENDPOINT` unset for AWS S3.
The existing API currently requires `SELLER_PHOTOS_ACCESS_KEY_ID` and
`SELLER_PHOTOS_SECRET_ACCESS_KEY`; a runtime identity must be chosen separately.
Attach `uploader_policy_arn` only to a dedicated, minimally privileged API
identity, not to a broad developer/provisioning user. Do not reuse the AWS
provisioning credentials or generate long-lived keys in Terraform state.
AWS-hosted role-based access needs an API change to use the SDK credential
chain; external hosting needs a supported federation or secret-management
approach. Infrastructure creation alone does not enable uploads.

After deployment and runtime credential configuration, upload through the
authenticated seller endpoint and check:

1. The returned CloudFront HTTPS URL serves the optimized JPEG anonymously.
2. The same key at the regional S3 URL returns 403 anonymously.
3. Anonymous CloudFront reads outside `sellers/` are denied.
4. The API identity can put/delete inside `sellers/`, but cannot list the
   bucket, read versions, change policies, or write outside that prefix.
5. Gallery removal deletes the origin object. Cached photos may remain for
   up to the API's one-year immutable cache lifetime, including in browsers.
   CloudFront invalidation cannot purge browser caches. Old versions remain
   private for up to 30 days; privacy removals need an operator procedure for
   versions and caches. This is public-photo storage, not a document vault.

Do not relax bucket public-access blocks to troubleshoot CloudFront. Check OAC,
the distribution ARN condition, object key, and deployment status instead.

## Provisioning permission blockers

The initial apply was denied before any managed resources were created:

- `s3:CreateBucket` was explicitly denied by AWS Organizations service control
  policy `p-i1elrswl`. An organization administrator must review and approve an
  appropriate policy change for this account, region, and bucket. Adding IAM
  permissions cannot override an explicit SCP deny.
- The `afrochop` provisioning user did not have identity-based permission for
  `cloudfront:CreateOriginAccessControl`. An administrator must grant a suitable
  provisioning identity the S3, CloudFront, and IAM policy-management permissions
  needed by this configuration, including read/refresh and tagging operations.
  The application uploader policy is intentionally insufficient for provisioning.

Other missing provisioning permissions may surface after these first blockers
are resolved. Do not remove security controls, switch regions/accounts, or use
different credentials to evade an organization restriction. Preserve the local
state, generate a fresh plan, and review it again before retrying apply.
