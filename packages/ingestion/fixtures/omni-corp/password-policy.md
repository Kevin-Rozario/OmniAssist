# Omni Corp Password Policy

Document owner: Identity and Access. Last reviewed: 2026-09-10.

Employees must use a unique password of at least 14 characters for Omni Corp accounts. Never reuse an Omni Corp password on another website or service.

## Requirements

- Minimum length 14 characters. Longer passphrases are encouraged.
- No periodic rotation. Passwords change only when you choose to, or when there is a suspected compromise.
- Passwords found in known breach lists, and variations of "omnicorp", are rejected automatically.
- Ten failed sign-in attempts lock the account for 15 minutes.
- Store passwords in the company 1Password Business vault. Do not keep them in browsers, spreadsheets, sticky notes or chat.
- Service and automation accounts use generated 32-character secrets stored in the secrets vault, never in source code.

## Reset Process

Use the self-service portal at https://id.omnicorp.example/reset. You need your registered authenticator to complete a reset. Admins must not reset passwords over chat.

If you cannot use self-service (for example, you lost your phone), open a ticket under `Access`. An agent verifies you on a video call and with your manager before issuing a one-time reset link. See the MFA guide.

## Suspected compromise

If you think your password is exposed, change it at once at https://id.omnicorp.example/reset, then message `#it-incidents` or email `security@omnicorp.example`. Security will revoke active sessions and review sign-in activity.

## Exceptions

Contractors receive 90-day accounts. Extensions require manager approval recorded in the IT ticket. No other exception to the length rule is granted, including for legacy applications; those applications must be fixed or placed behind single sign-on.
