# Omni Corp IT Organization Overview

Document owner: Director of IT Operations. Last reviewed: 2026-09-15. Applies to all Omni Corp employees and contractors.

Omni Corp is an enterprise software company with about 2,400 employees. Headquarters is in Austin, Texas. Regional offices are in Dublin (EMEA), Singapore (APAC) and Bengaluru (engineering hub). About 60 percent of staff work hybrid and 15 percent work fully remote.

## What IT owns

| Team | Scope | Contact |
| --- | --- | --- |
| Service Desk | Tickets, accounts, devices, software requests | `helpdesk@omnicorp.example`, Slack `#it-help` |
| Endpoint Engineering | Laptop images, MDM (Jamf for Mac, Intune for Windows), patching | via Service Desk ticket |
| Identity and Access | Omni ID single sign-on, MFA, access reviews, privileged access | via Service Desk ticket, category `Access` |
| Network and Infrastructure | Offices, Wi-Fi, VPN, data centre and cloud network | via Service Desk ticket, category `Network` |
| Security Operations | Incidents, phishing, vulnerability management, device compromise | `security@omnicorp.example`, Slack `#it-incidents` |
| Collaboration Services | Microsoft 365, Slack, Zoom, meeting-room AV | via Service Desk ticket, category `Collaboration` |

## Where to get help

- Self-service portal: https://help.omnicorp.example (tickets, software catalog, knowledge articles).
- Slack: `#it-help` for quick questions. Do not post passwords, MFA codes or customer data.
- Phone: Americas +1 512 555 0142, EMEA +353 1 555 0142, APAC +65 6555 0142.
- Walk-up IT desk: Austin HQ floor 2, Dublin floor 1, Singapore level 12, Bengaluru floor 3. Open Monday to Friday 09:00 to 17:00 local time.

## Service hours

The Service Desk follows the sun:

- Americas: Monday to Friday 07:00 to 19:00 Central Time.
- EMEA: Monday to Friday 08:00 to 18:00 Irish time.
- APAC: Monday to Friday 08:00 to 18:00 Singapore time.

Security and availability emergencies (Sev-1) are covered 24 hours a day, 7 days a week through the on-call rotation. See the Incident Response guide.

## Systems of record

- Identity: Omni ID at https://id.omnicorp.example (single sign-on and MFA).
- Ticketing: Jira Service Management behind https://help.omnicorp.example.
- HR system: Workday. Joiner, mover and leaver events in Workday trigger account changes automatically.
- Expenses: Concur.
- Email, calendar and files: Microsoft 365. Chat: Slack. External meetings: Zoom.

## What IT does not handle

IT does not handle payroll, benefits, parental leave, travel booking, office parking or facilities requests. Use the People Operations portal for HR questions and the Workplace team (`workplace@omnicorp.example`) for building issues.
