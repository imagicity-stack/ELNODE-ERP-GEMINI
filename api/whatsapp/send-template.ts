import type { VercelRequest, VercelResponse } from '@vercel/node';

const WATI_BASE = 'https://live-mt-server.wati.io/10155007';

function formatIndianPhone(raw: string): string {
  const n = (raw || '').replace(/\D/g, '');
  if (n.length === 10) return '91' + n;
  if (n.length === 11 && n.startsWith('0')) return '91' + n.slice(1);
  if (n.length === 12 && n.startsWith('91')) return n;
  return n;
}

async function sendWatiTemplate(
  phone: string,
  templateName: string,
  parameters: string[],
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const token = process.env.WATI_API_TOKEN;
  if (!token) return { ok: false, error: 'WATI_API_TOKEN not configured' };

  const number = formatIndianPhone(phone);
  try {
    const url = `${WATI_BASE}/api/v1/sendTemplateMessage?whatsappNumber=${number}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_name: templateName,
        broadcast_name: templateName,
        parameters: parameters.map((value, i) => ({ name: String(i + 1), value })),
      }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      return { ok: false, status: r.status, error: err || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unknown fetch error' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body: any = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const { phone, templateName, parameters } = body as {
      phone?: string;
      templateName?: string;
      parameters?: string[];
    };

    if (!phone || !templateName || !Array.isArray(parameters)) {
      return res.status(400).json({
        error: 'Missing fields: phone, templateName, parameters',
        received: { hasPhone: !!phone, hasTemplate: !!templateName, paramsIsArray: Array.isArray(parameters) },
      });
    }

    if (!process.env.WATI_API_TOKEN) {
      return res.status(500).json({ error: 'WATI_API_TOKEN not configured on the server' });
    }

    const result = await sendWatiTemplate(phone, templateName, parameters);
    if (!result.ok) {
      console.error('[whatsapp/send-template]', result.error);
      return res.status(502).json({ error: 'Failed to send WhatsApp message', detail: result.error, watiStatus: result.status });
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[whatsapp/send-template] uncaught', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message || String(err) });
  }
}
