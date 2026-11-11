# Omni Corp Wi-Fi and Office Network

Document owner: Network and Infrastructure. Last reviewed: 2026-09-03.

## Networks

| SSID | For | How you join |
| --- | --- | --- |
| Omni-Corp | Managed company laptops | Automatic. The device certificate installed by MDM authenticates you (802.1X) |
| Omni-Guest | Visitors and unenrolled devices | Captive portal. Access lasts 24 hours and must be sponsored by an employee |
| Omni-IoT | Printers, displays and building systems | Not available to users |

Personal phones can use Omni-Guest. They cannot join Omni-Corp.

## Sponsor a guest

1. Ask the visitor to join **Omni-Guest** and enter their name and your email on the portal.
2. You receive an email. Click **Approve** within 15 minutes.
3. The guest's access ends after 24 hours. Repeat for longer visits.

Guests cannot reach internal systems. Employees on Omni-Guest must use the VPN to reach internal applications.

## Wi-Fi troubleshooting

1. Turn Wi-Fi off and on, then forget and rejoin the network.
2. Confirm the date and time are correct. A wrong clock can break certificate login.
3. On a Mac, check in Self-Service that the **Wi-Fi certificate** configuration profile is installed. On Windows check Company Portal sync status.
4. On Windows, to flush DNS run `ipconfig /flushdns` in a terminal. On macOS run `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`.
5. Move closer to an access point. The 5 GHz band is faster, and 2.4 GHz reaches further.
6. If only one device is affected and it keeps dropping, open a `Network` ticket with the building, floor and a rough time of the drops.

If many people on a floor lose Wi-Fi at the same time, report it in `#it-help`. That is a P2 incident.

## Wired network

Desk docks provide gigabit Ethernet. Ethernet on a managed laptop uses the same 802.1X certificate. Do not connect personal routers, switches or access points to office ports.

## Remote access

For internal systems away from the office use the VPN. See the VPN Access guide.
