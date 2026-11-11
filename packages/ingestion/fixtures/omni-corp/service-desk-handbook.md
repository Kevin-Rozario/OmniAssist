# Omni Corp Service Desk Handbook

Document owner: Service Desk Manager. Last reviewed: 2026-08-20.

## Ticket priorities and targets

Every ticket gets a priority from the impact and the number of people affected. Priorities line up with the incident severity levels in the Incident Response guide.

| Priority | Meaning | Example | First response | Resolution target |
| --- | --- | --- | --- | --- |
| P1 (Sev-1) | Production outage or confirmed account takeover | Company-wide email down | On-call paged within 5 minutes | Restore within 4 hours |
| P2 (Sev-2) | Degraded service affecting many users | VPN gateway slow for one office | Acknowledged within 30 minutes | 1 business day |
| P3 (Sev-3) | Single user or single workstation issue | Laptop will not join Wi-Fi | Next business day | 3 business days |
| P4 | Request or question | Request a second monitor | Next business day | 5 business days |

Business days are Monday to Friday in the requester's region, excluding Omni Corp public holidays.

## How to open a ticket

1. Go to https://help.omnicorp.example and choose **Get help**.
2. Pick the closest category: `Access`, `Hardware`, `Software`, `Network`, `Collaboration`, `Security` or `Onboarding`.
3. Describe what you tried, the exact error text, and when it started. Attach a screenshot, not a photo of the screen when possible.
4. For anything urgent, also call the regional phone number. Phone calls are logged as tickets.

Do not include passwords, MFA codes, recovery codes or customer data in a ticket.

## Identity checks

The Service Desk verifies who you are before changing credentials or MFA:

- Password resets and MFA resets are done through Omni ID self-service wherever possible.
- If self-service is not possible, an agent verifies you on a video call with your camera on, and confirms with your manager in Workday.
- Agents never reset a password over chat, email or phone, and never ask you to read out a code.

## Escalation

If a P2 or P3 ticket has not been acknowledged within its target, reply to the ticket with the word `escalate`. The Service Desk Manager is notified automatically. For P1 events, call the regional phone number and say "Sev-1".

## Surveys and feedback

You receive a two-question survey when a ticket closes. Scores below 3 out of 5 are reviewed by the Service Desk Manager within two business days.
