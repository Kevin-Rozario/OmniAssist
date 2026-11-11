# Omni Corp BYOD and Mobile Device Policy

Document owner: Endpoint Engineering with Security. Last reviewed: 2026-08-25.

Omni Corp does not issue phones, except loaner phones for high-risk travel. You may use a personal phone or tablet for work apps under this policy.

## What is allowed

| Device | Allowed access |
| --- | --- |
| Personal phone or tablet | Outlook, Teams, Slack, Zoom, Microsoft Authenticator and the Workday app |
| Personal laptop or desktop | Web versions of Microsoft 365 and Slack only. No VPN, no Confidential data, no downloads |
| Company laptop | Everything in the approved catalog |

Personal devices are not enrolled in full device management. Omni Corp manages only the work apps through app protection policies in Intune.

## Requirements for personal phones and tablets

- iOS 17 or later, or Android 13 or later. Update within 30 days of a security release.
- A device passcode of at least six digits, or biometrics.
- Work apps require their own PIN and block copy and paste into personal apps.
- No jailbroken or rooted devices. Compromised devices are blocked automatically.

## Enroll a personal phone

1. Install Outlook or Microsoft Authenticator from the official app store.
2. Sign in with your Omni Corp email. You are guided through the app protection prompts.
3. Accept the work-app PIN setup.

## What Omni Corp can and cannot see

IT can see that a device is registered, its operating system version and whether it meets requirements. IT **cannot** see your personal photos, messages, browsing history or location. If you leave Omni Corp or lose the phone, IT performs a **selective wipe** that removes only work app data.

## Lost personal phone

Report it in `#it-incidents` within one hour. Security triggers a selective wipe and revokes sessions. Then re-enroll your authenticator at https://id.omnicorp.example/mfa.

## Travel and roaming

Work apps use data roaming charges from your own plan. Omni Corp reimburses work-related roaming costs through Concur when you provide the bill. For high-risk countries use a loaner device; see the Travel IT Guide.

## Personal laptops

Personal laptops must not store Omni Corp customer data. If you need a computer and your device is in repair, ask for a loaner.
