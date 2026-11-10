# Omni Corp IT Incident Response

Report suspected security or availability incidents immediately. Do not wait for confirmation.

## Severity levels

| Level | Example | Response target |
| --- | --- | --- |
| Sev-1 | Production outage or confirmed account takeover | Page on-call within 5 minutes |
| Sev-2 | Degraded service affecting many users | Acknowledge within 30 minutes |
| Sev-3 | Isolated workstation issue | Next business day |

## How to report

1. Message `#it-incidents` in Slack with what you observed and when it started.
2. For Sev-1, also call the on-call number listed in the IT handbook.
3. Do not forward suspicious attachments; forward phishing mail as an attachment to `security@omnicorp.example`.

## After the incident

IT posts a short summary in `#it-incidents` and files a postmortem for Sev-1 and Sev-2 within five business days.
