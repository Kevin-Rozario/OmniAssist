# Omni Corp Laptop Setup

Document owner: Endpoint Engineering. Last reviewed: 2026-09-05.

New hires receive a company MacBook or Windows laptop imaged with Omni Corp baseline software. Laptops are shipped to arrive at least two business days before your start date, or are ready for pickup at the IT desk on day one.

## Day-one checklist

1. Power on and connect to Omni-Guest Wi-Fi.
2. Sign in with the temporary credentials in your welcome email.
3. Complete FileVault / BitLocker encryption enrollment.
4. Install Company Portal / Jamf and wait for configuration profiles.
5. Sign into Slack, email, and the VPN client.
6. Enroll MFA at https://id.omnicorp.example/mfa and save your backup codes.
7. Join the Omni-Corp Wi-Fi once the device certificate has installed (about 10 minutes).

## Supported hardware

| Role | Standard laptop |
| --- | --- |
| Engineering, design, data | MacBook Pro 14-inch, Apple silicon, 32 GB memory |
| Business and sales | MacBook Air 13-inch, Apple silicon, 16 GB memory |
| Finance, operations, support | Dell Latitude 7450 with TPM 2.0, Windows 11 Pro, 16 GB memory |

- Apple silicon MacBook Pro or Air (current two generations)
- Dell Latitude business laptops with TPM 2.0

Windows laptops are provisioned with Windows Autopilot through Intune. Macs enroll through Apple Business Manager into Jamf automatically when first powered on and connected to the internet.

Personal devices are not enrolled in MDM and must not store Omni Corp customer data. See the BYOD policy for what is allowed on a personal phone.

## What is on the baseline image

Slack, Microsoft 365 apps, Zoom, GlobalProtect VPN, 1Password, the endpoint security agent, and the web browser with the company SSO extension. Anything else comes from the software catalog.

## Accessories

Each person can request one dock (Dell WD22TB4), two 27-inch monitors, a keyboard and mouse, and a Jabra Evolve2 headset through the catalog under `Hardware`. Delivery takes up to five business days.

## Support

If setup stalls for more than 30 minutes, visit the IT desk or open a ticket tagged `onboarding`.
