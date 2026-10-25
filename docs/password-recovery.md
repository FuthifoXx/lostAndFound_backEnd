# Password recovery rollout

## Configuration and deployment

- Deploy the backend and frontend together. The frontend recovery branch includes the earlier session-expiry UX fix.
- Set backend FRONTEND_URL to the trusted, single frontend origin (production: https://back-2-owner.vercel.app). Do not use a comma-separated CORS list here.
- Production recovery email uses the existing BREVO_API_KEY and EMAIL_FROM transport. EMAIL_FROM must be a sender accepted by the configured Brevo account. EMAIL_NOTIFICATIONS_ENABLED and MATCH_NOTIFICATION_CHANNEL do not disable recovery email.
- The backend creates PasswordReset and RecoveryLimit model collections and waits for their indexes before listening. Do not remove their unique or TTL indexes.
- Recovery links expire after 30 minutes, are single-use, and are sent at most once per account per 5 minutes. A new link after the cooldown invalidates the previous one.
- The public recovery endpoints share a database-backed limit of 20 requests per IP per 15-minute bucket. The current server does not trust forwarded IP headers, so a reverse proxy can cause visitors to share this conservative limit. Verify the hosting proxy topology before configuring Express trust proxy; never blindly trust caller-supplied forwarded headers.
- Passwords require 8+ characters and at most 72 UTF-8 bytes (bcrypt limit). Existing passwords remain valid until reset.
- Successful reset increments authVersion; old JWTs become invalid on their next protected request. Existing pre-feature JWTs remain valid for accounts that have not reset their password.
- An email provider error produces the same public response as any request; consult provider logs and the generic backend error without logging reset secrets. Wait 5 minutes before another request. A failed message is not automatically retried.

## Supervised volunteer check

1. Volunteer opens Forgot password on the login page and enters their registered email themselves.
2. Confirm receipt in their actual inbox/spam folder; provider acceptance is not sufficient. They keep the link private and open it in the same browser tab until completion (refreshing after the token is removed from the address bar requires reopening the original email link).
3. Check password mismatch feedback, then choose a new password and complete the reset.
4. Sign in with the new password and confirm the same account, matched items and claim history remain present.
5. Confirm the old password, reused link and old logged-in session no longer work.
6. For an expired link, request a new one; do not create another account or manually edit password hashes.

The flow requires access to the registered email inbox. If the volunteer also forgot that address or lost access, stop self-service recovery and handle identity verification separately; knowing a phone number alone must not reset the account.

## Automated validation

Backend: node --test tests/*.test.js
Frontend: npm run build; node --test tests/session-expiry.test.mjs

Password recovery HTTP tests exercise the real routes, password hashing, JWT handling and mail adapter with database and provider boundaries stubbed. They do not prove production MongoDB index behavior or real inbox delivery. Check those during deployment.
