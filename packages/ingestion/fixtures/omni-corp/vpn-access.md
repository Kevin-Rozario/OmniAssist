# Omni Corp VPN Access

Omni Corp employees connect to the corporate network through the GlobalProtect VPN client when working remotely.

## Who needs VPN

- Full-time employees accessing internal apps (HRIS, expense, ticketing)
- Contractors with an active Omni Corp account and manager approval
- Guests do not receive VPN accounts

## How to connect

1. Install GlobalProtect from the Self-Service portal.
2. Use gateway `vpn.omnicorp.example`.
3. Sign in with your Omni Corp SSO credentials and complete MFA.
4. Confirm the status shows **Connected** before opening internal sites.

## Troubleshooting

- If MFA fails, reset your authenticator from https://id.omnicorp.example/mfa.
- Split-tunnel is enabled; public internet does not require VPN.
- Open an IT ticket with subject `VPN` if the gateway is unreachable for more than 15 minutes.
