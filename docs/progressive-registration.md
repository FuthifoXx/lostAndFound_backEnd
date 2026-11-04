# Progressive registration pilot

## Scope

Signup now asks for display name, email and password. The backend explicitly ignores identity numbers, legal names, phone numbers, role and matching settings supplied to registration. Email confirmation is distinct from document matching and ownership verification.

Recovery setup is authenticated and includes:

- A private loss report (up to 10 per account), usable before email confirmation. It is a note in that user's account, not a public listing, claim or automatic recovery search.
- Email confirmation using a random, hashed, single-use link that expires after 30 minutes. Confirmation is explicit (a button), to avoid consuming links during automatic email scans. Requests have a 5-minute account cooldown.
- Optional names + DOB candidate matching. Only approved, unassigned, available items with recorded names/DOB qualify. Candidate responses expose only an opaque reference, document-type label and `possible` status; no photo, identity number, names, DOB, location or raw description. Users check Recovery setup for new candidates; candidate emails are not sent in this pilot.
- Optional exact document matching. The account's email must first be confirmed and the user explicitly consents. Existing approved unassigned items are checked immediately and assigned atomically. Future upload approval uses the existing matching path. Matching is not proof of ownership: the existing partner claim/handover process remains mandatory.
- Legacy users retain exact matching when the new matchingActive flag is absent. No data migration, case reassignment or public expansion is performed. Existing exact document numbers cannot be changed through Recovery setup; support handles corrections.

Passwords remain hashed with bcrypt. Existing document-number storage is retained; this change does not introduce field-level encryption or claim POPIA compliance certification. Names, DOB and loss reports remain personal information. No document photos or profile-photo matching is added.

## Deployment

Deploy both review branches to a staging environment before merging to production. New email-confirmation and enrollment endpoints require the new backend; the new signup API does not accept the previous signup form without a display name. Use FRONTEND_URL for the matching frontend's trusted single origin. Production requires the existing BREVO_API_KEY and EMAIL_FROM settings. Confirmation emails are independent of the lifecycle channel flags.

The backend adds EmailVerification and LossReport collections. Wait for EmailVerification's unique and TTL indexes at startup. Keep the existing User unique/sparse document-number indexes. There is no need to reset users or clean the database.

Existing accounts can keep using claims without new email confirmation. Editing an account's email removes its confirmation and pauses future exact/candidate matching until setup is completed again. Already associated items and claims are preserved. Confirmed progressive accounts use email for lifecycle notifications so an optional unverified phone does not become the recovery delivery route.

Setup request limits use database-backed limits scoped by account and endpoint for authenticated users. Public signup/confirmation use separate per-IP endpoint limits. Password recovery keeps its existing shared IP limit. Public limits remain conservative behind a reverse proxy; verify the hosting proxy configuration before trusting forwarded headers.

## Supervised testing

Use consenting volunteers' own inboxes in staging; do not post confirmation links, passwords or document numbers in chat or screenshots.

1. Create an account with the three basic fields. Confirm that no ID, phone, DOB or legal-name fields are requested.
2. Sign in, create a private lost-item report, and check it is only listed in that account.
3. Confirm the email link and refresh Recovery setup. Before confirmation, matching controls must be disabled.
4. Opt into names/DOB matching. With a synthetic approved document having the same names/DOB, confirm only a generic possible-match card is visible; there must be no owner assignment or image access from it.
5. Choose exact matching, provide the synthetic document number privately, and save. Confirm the existing approved item becomes matched and appears in My Items. Its number should disappear from the input after save.
6. Continue the existing claim -> partner approval -> collection -> receipt -> closure flow.
7. Check a second candidate with identical names/DOB is not automatically assigned ownership and cannot access the first person's document. Duplicate exact document enrollment must be rejected.
8. Recheck a legacy account's login, matching, partner assignment and claim history.

## Automated checks

Backend: `node --test tests/*.test.js`
Frontend: `npm run build` and targeted ESLint. Existing session regression tests remain available.

The HTTP tests use real Express routes and bcrypt/JWT with database/provider boundaries stubbed. They cover signup data minimisation, schema validation for accounts without identity details, email expiry/replay/email binding, authentication, candidate response fields, atomic linking/idempotence, document collision rejection, private reports and legacy matching. Staging still needs actual MongoDB index and email inbox checks.
