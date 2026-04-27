const POSTMARK_API = 'https://api.postmarkapp.com/email'
const FROM = 'Storyline <hello@storyline.my>'

export async function sendLicenceEmail(
  to: string,
  licenceKey: string,
  postmarkApiKey: string,
): Promise<void> {
  const body = JSON.stringify({
    From: FROM,
    To: to,
    Subject: 'Your Storyline licence key',
    HtmlBody: licenceEmailHtml(licenceKey),
    MessageStream: 'outbound',
  })

  const res = await fetch(POSTMARK_API, {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': postmarkApiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Postmark error ${res.status}: ${text}`)
  }
}

function licenceEmailHtml(licenceKey: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e8e8e8">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;overflow:hidden;max-width:560px;width:100%">

        <tr><td style="padding:32px 40px 0">
          <p style="margin:0;font-size:22px;font-weight:600;color:#e8e8e8">Your Storyline licence key</p>
          <p style="margin:12px 0 0;font-size:15px;color:#888">Keep this email — it's your key to your credits on any device.</p>
        </td></tr>

        <tr><td style="padding:24px 40px">
          <p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#666">Licence Key</p>
          <div style="background:#0f0f0f;border:1px solid #333;border-radius:8px;padding:16px 20px;font-family:'SF Mono','Fira Code',monospace;font-size:20px;letter-spacing:0.05em;color:#a78bfa;text-align:center">
            ${licenceKey}
          </div>
        </td></tr>

        <tr><td style="padding:0 40px 32px">
          <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.08em">Getting started</p>
          <p style="margin:0 0 10px;font-size:14px;color:#bbb;line-height:1.6">1. <a href="https://github.com/DarrenJCoxon/storyline-app/releases/latest" style="color:#a78bfa;text-decoration:none">Download the Storyline installer</a> and open it.</p>
          <p style="margin:0 0 10px;font-size:14px;color:#bbb;line-height:1.6">2. Press <span style="background:#2a2a2a;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:13px">Cmd+Shift+P</span> and run <span style="background:#2a2a2a;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:13px">Storyline: Enter Licence Key</span>.</p>
          <p style="margin:0 0 24px;font-size:14px;color:#bbb;line-height:1.6">3. Paste the key above and hit Enter. Your credits activate immediately.</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.6">Changed device? Visit <a href="https://api.storyline.my/resend-key" style="color:#666">storyline.my</a> and enter this email address to have your key resent.</p>
        </td></tr>

        <tr><td style="background:#111;padding:20px 40px;border-top:1px solid #2a2a2a">
          <p style="margin:0;font-size:13px;color:#555">Questions? Reply to this email or contact <a href="mailto:coxondj@gmail.com" style="color:#555">coxondj@gmail.com</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
