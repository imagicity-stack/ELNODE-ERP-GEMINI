import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendWatiTemplate } from '../_wati';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      return res.status(502).json({ error: 'Failed to send WhatsApp message', detail: result.error });
    }
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[whatsapp/send-template] uncaught', err);
    return res.status(500).json({ error: 'Internal error', detail: err?.message || String(err) });
  }
}
