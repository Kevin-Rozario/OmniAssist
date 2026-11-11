# Omni Corp Data Classification and Handling

Document owner: Security and Compliance. Last reviewed: 2026-07-30.

Every piece of Omni Corp information has one of four classifications. Treat unlabeled information as Internal until you know otherwise.

## Classifications

| Class | Definition | Examples |
| --- | --- | --- |
| Public | Approved for anyone | Marketing pages, published docs, press releases |
| Internal | Safe for employees and contractors | Org charts, internal wiki, project plans |
| Confidential | Harm if disclosed outside the company | Customer data, contracts, pricing, source code, employee records |
| Restricted | Severe harm or legal duty if disclosed | Passwords and keys, payment card data, health data, unreleased financial results, merger plans |

## Handling rules

| Action | Internal | Confidential | Restricted |
| --- | --- | --- | --- |
| Store | Company OneDrive, SharePoint, wiki | Company OneDrive or SharePoint with restricted sharing | Approved vault or system only |
| Share outside | Allowed if the recipient needs it | Needs a signed NDA and approval from the data owner | Not allowed without Security approval |
| Email | Allowed | Encrypt, or use a secure share link | Never by email or chat |
| Personal device | Not recommended | Not allowed | Not allowed |
| Printing | Allowed | Collect immediately and shred after use | Do not print |

Customer data is Confidential by default and must be stored only in approved customer data stores. It must never be pasted into public AI tools or personal accounts.

## Using AI tools

Do not paste Confidential or Restricted information into public chatbots or other unapproved AI services. Use the approved company AI assistants only, and review outputs before sharing them.

## Data loss prevention

Outbound email and file sharing are scanned. Messages containing payment card numbers or national identity numbers are blocked and reported to Security. If a legitimate message is blocked, open a ticket under `Security` rather than trying to work around it.

## Retention

Records are kept according to the retention schedule. Do not delete records that are subject to a legal hold. If you receive a hold notice from Legal, stop deleting related files until you are told the hold is released.

## Reporting a data exposure

If you send information to the wrong recipient or find data exposed, report it within one hour to `security@omnicorp.example` or `#it-incidents`. Early reports let Security recall emails or revoke links.
