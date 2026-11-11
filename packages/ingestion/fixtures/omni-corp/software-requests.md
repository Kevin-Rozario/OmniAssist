# Omni Corp Software Requests

Document owner: Endpoint Engineering with Security. Last reviewed: 2026-09-01.

Employees request new software through the IT service catalog. Do not install unsigned tools on company devices.

## Approved path

1. Open https://help.omnicorp.example/catalog.
2. Search for the application. If it is listed, click **Request**.
3. If it is not listed, submit **New software request** with business justification and estimated cost.
4. Manager approval is required for paid licenses. Security review is required for anything that processes customer data.

## Approval thresholds for paid software

| Annual cost per user | Approval needed |
| --- | --- |
| Free or already licensed | None. Installs automatically from Self-Service or Company Portal |
| Up to 500 USD | Manager |
| 501 to 5,000 USD | Manager and department director |
| Over 5,000 USD in total | Director, Finance and Procurement |

## Turnaround

- Catalog apps: usually within one business day
- New apps needing security review: up to ten business days

A security review checks where data is stored, whether the vendor has SOC 2 Type II or ISO 27001 evidence, single sign-on support and data retention terms. Submit the vendor name, the data involved and the business owner to avoid delays.

## Administrator rights

Standard users do not have local administrator rights. When a task needs elevation, such as installing a driver, use **Privilege Elevation** in Self-Service (Mac) or Company Portal (Windows). Elevation lasts 15 minutes and is logged. Repeated need for elevation should become a catalog request.

## Prohibited

- Peer-to-peer file sharing clients
- Unlicensed copies of commercial software
- Browser extensions that read email or SSO cookies without Security approval
- Personal cloud storage sync clients such as Dropbox, Google Drive for desktop or iCloud Drive on company laptops
- Remote-control tools such as TeamViewer or AnyDesk. IT uses BeyondTrust Remote Support, and you start the session from a code the agent gives you.

## Renewals and cancellations

Licenses assigned to you are reviewed every year. Unused licenses are reclaimed after 90 days without sign-in. Cancel a license you no longer need through the catalog so the cost is released.
