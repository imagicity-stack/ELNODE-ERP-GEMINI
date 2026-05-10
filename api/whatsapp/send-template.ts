import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendWatiTemplate } from '../_wati';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { phone, templateName, parameters } = req.body as {
    phone: string;
    templateName: string;
    parameters: string[];
  };

  if (!phone || !templateName || !Array.isArray(parameters)) {
    return res.status(400).json({ error: 'Missing fields: phone, templateName, parameters' });
  }

  const result = await sendWatiTemplate(phone, templateName, parameters);
  if (!result.ok) {
    console.error('[whatsapp/send-template]', result.error);
    return res.status(502).json({ error: 'Failed to send WhatsApp message', detail: result.error });
  }
  return res.status(200).json({ success: true });
}
