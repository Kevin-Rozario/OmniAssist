# Omni Corp Files, Backup and Recovery

Document owner: Collaboration Services. Last reviewed: 2026-08-22.

## Where files live

- **OneDrive:** your personal work files. Desktop, Documents and Pictures are redirected to OneDrive on managed laptops (Known Folder Move), so they are backed up automatically.
- **SharePoint and Teams files:** shared team content. Prefer a team site over emailing attachments.
- **Not backed up:** anything stored only on the laptop outside those folders, USB drives, and personal cloud storage. Time Machine and File History are not supported.

Do not store company files in personal cloud accounts. See the Data Classification guide.

## Recovering deleted or overwritten files

| Situation | What to do | Window |
| --- | --- | --- |
| Deleted a file in OneDrive | Open the OneDrive recycle bin on the web and restore | 93 days |
| Deleted a file in SharePoint | Site recycle bin, then the second-stage recycle bin | 93 days in total |
| Overwrote or corrupted a file | Open the file's **Version history** and restore an older version | Up to 500 versions |
| Many files encrypted or changed (ransomware) | Report a Sev-1 at once. Security can restore your library to a point in time | 30 days |
| Deleted an email | Recover Deleted Items in Outlook | 30 days, then 14 more days via recoverable items |

If the window has passed, open a ticket under `Collaboration`. Restores from long-term backup are possible for SharePoint sites for up to one year and take up to two business days.

## OneDrive sync problems

1. Click the OneDrive cloud icon, then the gear, and read the status message.
2. A red cross on a file usually means an invalid character in the name (such as `: * ? " < > |`) or a path longer than 400 characters. Rename it.
3. Sync paused or stuck: choose **Resume sync**, then sign out and back in to OneDrive.
4. Storage is 1 TB per person. At 90 percent, move archives to a team site or ask for more through a ticket with a manager's approval.

## Sharing files

- Share by link to named people. Anyone links are disabled for Confidential data.
- Guest sharing outside the company expires after 30 days by default.
- Remove access to a shared folder when a project ends.

## Large files and datasets

Files over 25 MB should be shared by link. For datasets over 100 GB, open a `Collaboration` ticket so Infrastructure can provide approved storage.
