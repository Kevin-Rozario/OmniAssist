# Omni Corp MFA Enrollment and Recovery

Document owner: Identity and Access. Last reviewed: 2026-09-10.

Multi-factor authentication (MFA) is required for every Omni Corp account. Omni ID, the single sign-on service at https://id.omnicorp.example, is the only place you manage it.

## Approved factors

| Factor | Who uses it | Notes |
| --- | --- | --- |
| Microsoft Authenticator with number matching | All employees and contractors | Default. Approve only prompts you started. |
| FIDO2 security key (YubiKey 5) | IT administrators, finance approvers, executives | Issued by IT. Register two keys. |
| One-time backup codes | Everyone, as a recovery option | Ten single-use codes. Store them in 1Password. |

SMS and voice call codes are not accepted.

## Enroll on a new account

1. Open https://id.omnicorp.example/mfa on your laptop.
2. Sign in with the temporary credentials from your welcome email.
3. Choose **Add authenticator**, scan the QR code with Microsoft Authenticator, and enter the six-digit confirmation.
4. Download your backup codes and save them in 1Password.

## Got a new phone

Before you wipe or trade in the old phone, open https://id.omnicorp.example/mfa, add the new phone as a second authenticator, then remove the old one. This takes two minutes and avoids a ticket.

## Lost phone or no access to your authenticator

1. Use a backup code at the sign-in prompt and re-enroll right away at https://id.omnicorp.example/mfa.
2. If you have no backup codes, open a ticket under `Access` from a colleague's device or call the Service Desk.
3. An agent verifies you on a video call and confirms with your manager in Workday, then clears your MFA so you can enroll again.
4. If the phone is lost or stolen, also report it in `#it-incidents` within one hour so sessions can be revoked.

## Prompt fatigue protection

If you receive an MFA prompt you did not start, deny it and report it immediately to `security@omnicorp.example`. Repeated unexpected prompts can mean your password is known to an attacker. Never approve a prompt because someone calls or messages you asking for it.
