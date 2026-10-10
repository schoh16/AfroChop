# Records Retention and Safety Preservation Policy — DRAFT FOR COUNSEL REVIEW

**DRAFT — NOT LEGAL ADVICE OR READY FOR OPERATION.** Counsel and privacy/safety leads must fill in retention periods, validate legal bases, approve holds and deletion procedures, and configure the corresponding jobs before launch.

## Principles

Collect and retain the minimum information needed for service delivery, compliance, payment reconciliation, safety review, and legal obligations. Limit access by role and purpose. Delete or de-identify records when their approved retention period ends unless a legal hold or safety investigation requires preservation. A legal hold suspends routine deletion only for records within its documented scope.

## Record classes and schedule (periods require approval)

| Record class | Typical examples | Access | Retention period / trigger |
|---|---|---|---|
| Customer allergy/dietary disclosure | Disclosed allergens, restriction notes, acknowledgment timestamp/version, cook response | Customer, assigned cook, authorized safety/support personnel | [COUNSEL TO SET] |
| Booking and communications | Request, quotes, status changes, in-app messages | Booking participants, authorized support/safety staff | [COUNSEL TO SET] |
| Menu safety statements | Ingredients, allergens, cross-contact risks, changes | Public fields only for public dishes; change history restricted | [COUNSEL TO SET] |
| Grocery evidence | Receipt image/reference, total, notes | Customer for that booking, submitting cook, authorized support | [COUNSEL TO SET] |
| Provider permits and verification | Permit reference, jurisdiction, service type, expiry and reviewer outcome | Provider and specifically authorized compliance admins | [COUNSEL TO SET] |
| Food-safety incidents | Report, severity, evidence references, investigation/actions | Reporter (limited own-case view), authorized safety/admin team | [COUNSEL TO SET; include legal holds] |
| Audit/access events | Acknowledgment, permit decision, incident review, suspension and access log | Authorized security/compliance admins | [COUNSEL TO SET] |

## Controls

1. Keep allergy and dietary values off public endpoints and out of unrelated provider searches.
2. Record the notice version and server-side acknowledgment/response timestamps; do not replace historical evidence without retaining an audit trail.
3. Restrict permit document references to the provider and authorized reviewers. Store original documents in private object storage, not public URLs.
4. Log authorized access and administrative changes to sensitive records.
5. Apply deletion or de-identification using approved retention settings; test backups, legal holds, and propagation to vendors.
6. Escalate urgent safety incidents immediately and preserve the relevant records while the investigation and legal hold remain active.

## Governance

Before launch, counsel must identify statutory recordkeeping duties and limitations, approve periods for each jurisdiction/service, assign an owner, define deletion evidence and exceptions, and review vendor backup lifecycles. The implementation does not currently execute retention/deletion jobs; this draft is a required operational follow-up, not evidence that deletion controls are active.
