import "server-only";

export type BatchEmail = { to: string; subject: string; text: string; from: string; replyTo?: string; unsubscribeUrl?: string };

// Sends up to 100 emails in one Resend request (each its own message, so
// every reader gets their own unsubscribe link). Returns how many went.
export async function sendEmailBatch(emails: BatchEmail[]): Promise<number> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("batch not sent: RESEND_API_KEY is not set");
    return 0;
  }
  let sent = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          chunk.map((m) => ({
            from: m.from,
            to: m.to,
            subject: m.subject.replace(/[\r\n]+/g, " ").slice(0, 150),
            text: m.text,
            ...(m.replyTo ? { reply_to: m.replyTo } : {}),
            ...(m.unsubscribeUrl
              ? { headers: { "List-Unsubscribe": `<${m.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
              : {}),
          })),
        ),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) console.error("batch email failed:", res.status, await res.text());
      else sent += chunk.length;
    } catch (err) {
      console.error("batch email failed:", err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

// Sends a plain-text email through Resend (jambuch.in is a verified sending
// domain). Plain text only, so nothing a visitor types can turn into HTML.
// Returns false instead of throwing: callers decide whether a failed email matters.
export async function sendEmail(msg: {
  to: string;
  subject: string;
  text: string;
  from?: string;
  replyTo?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("email not sent: RESEND_API_KEY is not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: msg.from ?? process.env.RESEND_FROM ?? "jambuch.in <ideas@jambuch.in>",
        to: msg.to,
        subject: msg.subject.replace(/[\r\n]+/g, " ").slice(0, 150),
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("email failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("email failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
