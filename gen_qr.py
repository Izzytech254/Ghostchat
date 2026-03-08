import qrcode
import base64
from io import BytesIO

LAN_IP = "192.168.1.170"
URL = f"https://{LAN_IP}:8082"
APK = f"https://{LAN_IP}:8082/whispro.apk"

qr = qrcode.make(APK)  # QR points to APK download
buf = BytesIO()
qr.save(buf, format="PNG")
b64 = base64.b64encode(buf.getvalue()).decode()

lines = [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>Whispro Install</title>",
    "<style>",
    "body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;"
    "display:flex;flex-direction:column;align-items:center;justify-content:center;"
    "min-height:100vh;gap:20px;padding:28px;box-sizing:border-box}",
    "h1{font-size:1.5rem;margin:0;font-weight:700}",
    "p{margin:0;color:#6b7280;font-size:.85rem;text-align:center}",
    "img{border-radius:16px;width:220px;height:220px;border:2px solid #38bdf8}",
    ".btn{display:block;color:#000;background:#38bdf8;font-size:.95rem;font-weight:600;"
    "word-break:break-all;text-align:center;text-decoration:none;"
    "padding:13px 24px;border-radius:8px;width:100%;max-width:320px}",
    ".btn:hover{background:#7dd3fc}",
    ".link{color:#38bdf8;font-size:.85rem;text-align:center;word-break:break-all}",
    "</style>",
    "</head>",
    "<body>",
    "<h1>Whispro</h1>",
    "<p>Scan QR or tap the button to install</p>",
    '<img src="data:image/png;base64,' + b64 + '" alt="QR for APK download">',
    '<a class="btn" href="' + APK + '">Download APK</a>',
    '<p>After install, open app — no USB required</p>',
    '<a class="link" href="' + URL + '">' + URL + "</a>",
    "</body>",
    "</html>",
]

out = "/home/boss/Documents/Projects/Ghost/web-client/dist/link.html"
with open(out, "w") as f:
    f.write("\n".join(lines))

print("Written:", out)
