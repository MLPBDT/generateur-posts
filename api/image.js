export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body;
    const seed = Math.floor(Math.random() * 99999);
    const encoded = encodeURIComponent(prompt + ', no text, no watermark, no logo');
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&nologo=true&seed=${seed}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Pollinations error: ' + response.status);

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return res.status(200).json({ image: 'data:image/jpeg;base64,' + base64 });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
