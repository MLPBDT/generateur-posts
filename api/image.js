export const maxDuration = 60; // increase Vercel timeout to 60s

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body;
    const seed = Math.floor(Math.random() * 99999);
    const clean = (prompt || 'beautiful photo') + ', no text, no watermark, no logo';
    const encoded = encodeURIComponent(clean);

    // Try flux model first, then standard
    const urls = [
      `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}&model=flux`,
      `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}`,
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 50000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) continue;
        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('image')) continue;

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength < 5000) continue;

        const base64 = Buffer.from(buffer).toString('base64');
        const ext = ct.includes('png') ? 'png' : 'jpeg';
        return res.status(200).json({ image: `data:image/${ext};base64,` + base64 });
      } catch(e) {
        continue;
      }
    }

    return res.status(500).json({ error: 'All image sources failed' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
