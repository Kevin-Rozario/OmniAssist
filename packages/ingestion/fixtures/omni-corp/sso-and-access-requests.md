# Omni Corp Access Requests and Single Sign-On

Document owner: Identity and Access. Last reviewed: 2026-08-28.

## How access works

Omni Corp uses role-based access control. Your job role in Workday gives you a baseline set of applications automatically. Anything beyond the baseline is a request.

## Request additional access

1. Open https://help.omnicorp.example and choose **Request access**.
2. Select the application and the role. If you are unsure, describe the task you need to do.
3. Your manager approves. Application owners approve for sensitive systems (finance ledger, production infrastructure, customer data stores).
4. Access is provisioned automatically for connected apps, usually within one business day. Manual provisioning can take up to three business days.

Do not ask a colleague to share their login. Shared accounts are not allowed.

## Access levels

| Level | Examples | Approval |
| --- | --- | --- |
| Baseline | Email, Slack, wiki, HRIS self-service, expense | Automatic from role |
| Team | Team repositories, dashboards, team Jira projects | Manager |
| Sensitive | Production cloud accounts, customer data stores, finance ledger, payroll admin | Manager and application owner |
| Privileged | Admin consoles, directory administration | Manager, application owner and Security |

Privileged access is time-boxed to 8 hours and every session is recorded.

## Quarterly access reviews

Each quarter, managers receive a review in Omni ID listing everyone's access. Unreviewed access is removed after 14 days. If an access you need disappears, request it again with a short justification.

## When you change teams

A role change in Workday removes team-specific access after a 14-day overlap. Request what you need for the new team before the overlap ends.

## SSO sign-in problems

- "You do not have access to this application": request the access above, or confirm your role in Workday is current.
- Sign-in loop in the browser: clear cookies for `omnicorp.example`, or try a private window.
- Works in one browser but not another: disable extensions that block cookies or modify headers, then retry.
