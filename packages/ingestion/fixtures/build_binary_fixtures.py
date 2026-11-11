#!/usr/bin/env python3
"""Regenerates the .docx and .pdf files in omni-corp/ using only the standard library.

Run from this directory:  python3 build_binary_fixtures.py
The text is fictional Omni Corp content; edit it here, not in the binary files.
"""

import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).parent / "omni-corp"

AUP_TITLE = "Omni Corp Acceptable Use Policy"
AUP = [
    ("p", "Document owner: Security and Compliance. Last reviewed: 2026-07-15. Applies to employees, contractors and guests who use Omni Corp systems."),
    ("h", "Purpose"),
    ("p", "This policy sets the rules for using Omni Corp laptops, accounts, networks and data. It protects customers, colleagues and the company."),
    ("h", "Your accounts"),
    ("p", "You are responsible for everything done with your Omni ID. Do not share your password, MFA codes or backup codes with anyone, including IT staff. Use a unique password of at least 14 characters. See the Password Policy."),
    ("h", "Company devices"),
    ("p", "Company laptops are for work and limited personal use that does not create risk or cost. Keep devices encrypted and updated. Do not disable the endpoint security agent. Do not install software outside the approved catalog."),
    ("p", "Report a lost or stolen device within one hour in #it-incidents or to security@omnicorp.example."),
    ("h", "Acceptable use"),
    ("b", "Use company systems for company business and reasonable personal use during breaks."),
    ("b", "Keep Confidential and Restricted data in approved company systems only."),
    ("b", "Be respectful in email, Slack, Teams and Zoom. Harassment is not tolerated."),
    ("b", "Follow customer contracts and copyright and licence terms."),
    ("h", "Not acceptable"),
    ("b", "Accessing systems or data you have no business need for."),
    ("b", "Bypassing security controls, including VPN, MFA, endpoint protection or web filtering."),
    ("b", "Mining cryptocurrency, running personal servers or hosting personal sites on company equipment."),
    ("b", "Downloading pirated media or software, or sharing company content on personal cloud storage."),
    ("b", "Pasting Confidential or Restricted data into public AI tools or unapproved services."),
    ("b", "Using company systems for political campaigning or running a personal business."),
    ("h", "Monitoring"),
    ("p", "Omni Corp logs access to systems and scans email and web traffic for security threats and data loss. Content is reviewed only when there is a security, legal or compliance reason, and only by authorised staff. Personal devices enrolled for work apps are monitored only for device health, not personal content."),
    ("h", "Consequences"),
    ("p", "Violations can lead to loss of access, disciplinary action up to dismissal, and legal action where the law requires. Report concerns to security@omnicorp.example. You will not be penalised for reporting in good faith."),
    ("h", "Exceptions"),
    ("p", "Exceptions need written approval from the Director of Security and Compliance and are recorded with an expiry date."),
]

PDF_TITLE = "Omni Corp IT Service Catalog Quick Reference"
PDF_LINES = [
    "Last reviewed 2026-09-25. Portal: https://help.omnicorp.example/catalog",
    "",
    "ACCOUNTS AND ACCESS",
    "- Reset password: https://id.omnicorp.example/reset (self-service, 14 character minimum)",
    "- Enroll or reset MFA: https://id.omnicorp.example/mfa (backup codes: ten single-use)",
    "- Request application access: catalog > Request access (manager approval, 1 business day)",
    "- Contractor account extension: manager approval recorded in the ticket (accounts last 90 days)",
    "",
    "DEVICES",
    "- New laptop for a new hire: category Onboarding, 10 business days before start",
    "- Dock, two 27-inch monitors, keyboard, mouse, headset: category Hardware, up to 5 business days",
    "- Repair or loaner laptop: category Hardware. Loaner same day at walk-up desks",
    "- Lost or stolen device: report within 1 hour in #it-incidents",
    "- Refresh: every 36 months, you are emailed 60 days ahead",
    "",
    "SOFTWARE",
    "- Catalog apps: usually 1 business day",
    "- New software needing security review: up to 10 business days",
    "- Paid licences: manager up to 500 USD per user per year; director up to 5,000 USD",
    "- Admin rights: not granted. Use Privilege Elevation (15 minutes, logged)",
    "",
    "NETWORK AND COLLABORATION",
    "- VPN: GlobalProtect, gateway vpn.omnicorp.example, 4 hour idle timeout, 12 hour session",
    "- Wi-Fi: Omni-Corp (managed laptops), Omni-Guest (visitors, 24 hours, employee sponsor)",
    "- Shared mailbox or distribution list: category Collaboration, 1 business day",
    "- Meeting room problem: message #it-help with the room name",
    "",
    "SECURITY",
    "- Report phishing: Outlook Report Phish button or forward as attachment to security@omnicorp.example",
    "- Travel notification: 10 business days before international trips",
    "- Sev-1 emergency: call the regional Service Desk number and say Sev-1",
    "",
    "HOURS: Americas 07:00-19:00 CT, EMEA 08:00-18:00 Irish time, APAC 08:00-18:00 SGT (Mon-Fri)",
]


def build_docx(path: Path) -> None:
    def para(kind: str, text: str) -> str:
        t = escape(text)
        if kind == "h":
            return f'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>{t}</w:t></w:r></w:p>'
        if kind == "b":
            return f'<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>{t}</w:t></w:r></w:p>'
        return f'<w:p><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>'

    title = f'<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>{escape(AUP_TITLE)}</w:t></w:r></w:p>'
    body = title + "".join(para(k, t) for k, t in AUP)
    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {ns}><w:body>{body}</w:body></w:document>'
    styles = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {ns}>'
        '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>'
        '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>'
        '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>'
        "</w:styles>"
    )
    numbering = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering {ns}>'
        '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>'
        '<w:lvlText w:val="-"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    doc_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
        "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", styles)
        z.writestr("word/numbering.xml", numbering)
        z.writestr("word/_rels/document.xml.rels", doc_rels)


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(path: Path) -> None:
    page_w, page_h, margin, leading = 612, 792, 54, 14
    per_page = (page_h - 2 * margin) // leading
    lines = [("title", PDF_TITLE), ("", "")] + [("body", line) for line in PDF_LINES]
    pages = [lines[i : i + per_page] for i in range(0, len(lines), per_page)]

    objects: list[bytes] = []

    def add(body: str) -> int:
        objects.append(body.encode("latin-1"))
        return len(objects)

    catalog = add("<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add("PLACEHOLDER")
    font_id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    bold_id = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    page_ids = []
    for page in pages:
        ops = ["BT", f"{margin} {page_h - margin} Td", f"{leading} TL"]
        for kind, text in page:
            font, size = ("/F2", 14) if kind == "title" else ("/F1", 10)
            if text.isupper() and kind == "body" and text:
                font, size = "/F2", 11
            ops.append(f"{font} {size} Tf")
            ops.append(f"({pdf_escape(text)}) Tj T*")
        ops.append("ET")
        stream = "\n".join(ops)
        content_id = add(f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream")
        page_ids.append(
            add(
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {page_w} {page_h}] "
                f"/Contents {content_id} 0 R /Resources << /Font << /F1 {font_id} 0 R /F2 {bold_id} 0 R >> >> >>"
            )
        )
    kids = " ".join(f"{i} 0 R" for i in page_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("latin-1")

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    path.write_bytes(bytes(out))


if __name__ == "__main__":
    build_docx(OUT / "acceptable-use-policy.docx")
    build_pdf(OUT / "it-service-catalog-quick-reference.pdf")
    print("wrote acceptable-use-policy.docx and it-service-catalog-quick-reference.pdf")
