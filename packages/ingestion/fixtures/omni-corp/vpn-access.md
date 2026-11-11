# Omni Corp VPN Access

Document owner: Network and Infrastructure. Last reviewed: 2026-09-02.

Omni Corp employees connect to the corporate network through the GlobalProtect VPN client when working remotely.

## Who needs VPN

- Full-time employees accessing internal apps (HRIS, expense, ticketing)
- Contractors with an active Omni Corp account and manager approval
- Guests do not receive VPN accounts

## How to connect

1. Install GlobalProtect from the Self-Service portal (Mac) or Company Portal (Windows).
2. Use gateway `vpn.omnicorp.example`. The client picks the closest regional gateway for you.
3. Sign in with your Omni Corp SSO credentials and complete MFA.
4. Confirm the status shows **Connected** before opening internal sites.

The minimum supported client version is 6.2. Managed laptops update the client automatically. If your client is older, reinstall it from the Self-Service portal.

## Session limits

- Idle timeout: 4 hours with no traffic.
- Maximum session length: 12 hours. You are asked to sign in again with MFA after that.
- Split-tunnel is enabled. Public internet traffic does not go through the VPN, so you do not need to be connected to browse the public web, to use Slack or Zoom, or to join a Teams meeting.

You do need VPN for the HRIS, expense system, internal wiki, source code hosting on the private network and the ticketing admin console.

## Troubleshooting

- If MFA fails, reset your authenticator from https://id.omnicorp.example/mfa.
- "Gateway not responding": check that you have internet access, disconnect from any other VPN, then try again. Try a mobile hotspot to rule out a hotel or home router blocking the connection.
- "Certificate not found": your device certificate did not install. Restart the laptop and wait five minutes on the Omni-Corp network or VPN, then retry. If it persists, open a ticket under `Network`.
- Slow connection on VPN: confirm you are using the closest gateway, close cloud-sync clients during large downloads, and report sustained slowness as a P3 ticket with a speed test screenshot.
- Open an IT ticket with subject `VPN` if the gateway is unreachable for more than 15 minutes.

## Contractors

Contractor VPN access ends when the contractor account expires. Contractor accounts last 90 days. To extend, the contractor's manager records the approval in the IT ticket. See the Identity and Password Policy.
