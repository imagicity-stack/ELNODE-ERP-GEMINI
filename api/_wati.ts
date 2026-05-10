const WATI_BASE = 'https://live-mt-server.wati.io/10155007';

export function formatIndianPhone(raw: string): string {
  const n = raw.replace(/\D/g, '');
  if (n.length === 10) return '91' + n;
  if (n.length === 11 && n.startsWith('0')) return '91' + n.slice(1);
  if (n.length === 12 && n.startsWith('91')) return n;
  return n;
}

export async function sendWatiTemplate(
  phone: string,
  templateName: string,
  parameters: string[],
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WATI_API_TOKEN;
  if (!token) return { ok: false, error: 'WATI_API_TOKEN not configured' };

  const number = formatIndianPhone(phone);
  try {
    const res = await fetch(
      `${WATI_BASE}/api/v1/sendTemplateMessage?whatsappNumber=${number}`,
      {
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
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: JSON.stringify(err) };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unknown error' };
  }
}
