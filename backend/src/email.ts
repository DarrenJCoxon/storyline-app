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

        <tr><td style="padding:24px 40px 8px">
          <a href="vscode://darrenjcoxon.storyline-extension/activate?key=${licenceKey}" style="display:block;text-align:center;background:#16a34a;color:#fff;padding:16px 24px;border-radius:10px;font-size:17px;font-weight:600;text-decoration:none">
            Activate Storyline →
          </a>
          <p style="margin:8px 0 0;font-size:12px;color:#888;text-align:center">Click the button above on the device where Storyline is installed. It applies your credits automatically — no copy-paste.</p>
        </td></tr>

        <tr><td style="padding:24px 40px 8px">
          <p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#666">Adding to a second device?</p>
          <p style="margin:0 0 10px;font-size:13px;color:#888;line-height:1.5">Save the licence key below — paste it into the "Paste key from email" prompt on your other machine.</p>
          <div style="background:#0f0f0f;border:1px solid #333;border-radius:8px;padding:14px 18px;font-family:'SF Mono','Fira Code',monospace;font-size:14px;letter-spacing:0.05em;color:#a78bfa;text-align:center">
            ${licenceKey}
          </div>
        </td></tr>

        <tr><td style="padding:24px 40px 32px">
          <p style="margin:0 0 12px;font-size:13px;color:#888;line-height:1.6">Don't have Storyline installed yet? <a href="https://github.com/DarrenJCoxon/storyline-app/releases/latest" style="color:#a78bfa;text-decoration:none">Download the installer</a>, run it, then come back to this email and click <strong>Activate Storyline</strong>.</p>
          <p style="margin:0;font-size:13px;color:#666;line-height:1.6">Lost this email? Visit <a href="https://api.storyline.my/resend-key" style="color:#666">storyline.my</a> and enter your email address to have your key resent.</p>
        </td></tr>

        <tr><td style="background:#111;padding:20px 40px;border-top:1px solid #2a2a2a">
          <p style="margin:0;font-size:13px;color:#555">Questions? Reply to this email or contact <a href="mailto:darren@coxon.ai" style="color:#555">darren@coxon.ai</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
