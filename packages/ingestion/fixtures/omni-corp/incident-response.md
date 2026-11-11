# Omni Corp IT Incident Response

Document owner: Security Operations. Last reviewed: 2026-09-12.

Report suspected security or availability incidents immediately. Do not wait for confirmation.

## Severity levels

| Level | Example | Response target |
| --- | --- | --- |
| Sev-1 | Production outage or confirmed account takeover | Page on-call within 5 minutes |
| Sev-2 | Degraded service affecting many users | Acknowledge within 30 minutes |
| Sev-3 | Isolated workstation issue | Next business day |

Sev-1 incidents are restored within 4 hours as a target. Severity levels map to ticket priorities P1, P2 and P3 in the Service Desk Handbook.

## How to report

1. Message `#it-incidents` in Slack with what you observed and when it started.
2. For Sev-1, also call the on-call number listed in the IT handbook.
3. Do not forward suspicious attachments; forward phishing mail as an attachment to `security@omnicorp.example`.

## Roles during a Sev-1 or Sev-2

- **Incident commander:** the on-call Security or Infrastructure lead. Owns decisions and the timeline.
- **Communications lead:** posts updates in `#it-incidents` every 30 minutes and updates https://status.omnicorp.example for customer-impacting events.
- **Scribe:** records actions with timestamps for the postmortem.

## What to do if you think your laptop is compromised

1. Disconnect from Wi-Fi or unplug the network cable. Do not power the laptop off, because evidence in memory is lost.
2. Do not try to clean it yourself or delete anything.
3. Report it in `#it-incidents` from another device, or call the Service Desk.
4. Security isolates the device remotely and decides whether to reimage it.

Signs include unexpected security prompts, files renamed with strange extensions, a ransom note, or the endpoint security agent reporting that it was disabled.

## Ransomware

Treat a ransom note as Sev-1. Disconnect the device from the network, do not pay or reply, and call the Service Desk. Backups of OneDrive and SharePoint can restore files to a point before the encryption.

## After the incident

IT posts a short summary in `#it-incidents` and files a postmortem for Sev-1 and Sev-2 within five business days. Postmortems are blameless: they describe what happened, the impact, the root cause and the actions with owners and due dates.
