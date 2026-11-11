# Omni Corp Change Management and Maintenance Windows

Document owner: Director of IT Operations. Last reviewed: 2026-09-16.

## Change types

| Type | Definition | Approval |
| --- | --- | --- |
| Standard | Pre-approved, low risk and repeatable, such as a laptop patch or adding a user to a group | Pre-approved template |
| Normal | Anything that could affect users or production and is not pre-approved | Change Advisory Board (CAB) |
| Emergency | Needed now to stop or prevent a Sev-1 or Sev-2 | On-call director, reviewed after the fact |

## Maintenance windows

- **Standard window:** Saturday 02:00 to 06:00 Central Time.
- **Endpoint patching:** Windows updates install on the second Tuesday evening of the month after you are prompted. Macs install updates after a five-day deferral. Restart within 3 days of the prompt.
- **Customer-facing systems:** changes only inside the standard window unless the CAB approves otherwise.

Planned downtime is announced in `#it-help` and by email at least 5 business days ahead. Emergency maintenance is announced as soon as it is approved.

## Change Advisory Board

The CAB meets every Tuesday at 10:00 Central Time. Submit a normal change by Friday 17:00 the week before. Each request needs a description, risk, test result, rollback plan and the planned window.

## Change freezes

Normal changes are not scheduled:

- During the last two weeks of December.
- For the last three business days of each fiscal quarter, for finance systems.
- During a Sev-1 incident, for the affected systems.

Only emergency changes are allowed during a freeze.

## Rollback

Every change needs a documented rollback that can be completed within the maintenance window. If a change causes a Sev-1 or Sev-2, roll back first and diagnose afterwards.

## Post-change review

Failed or emergency changes get a review in the next CAB meeting, covering what happened, why the risk was missed and what will change in the template.

## Patching and your laptop

Do not delay restarts more than three days. A laptop that misses patches for 14 days loses access to internal applications until it is updated.
