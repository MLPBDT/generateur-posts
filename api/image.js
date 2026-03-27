export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body;
    const clean = (prompt || 'beautiful photo') + ', high quality, no text, no watermark';

    const response = await fetch(
      "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.HF_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: clean }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error("HuggingFace error " + response.status + ": " + text.substring(0, 200));
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return res.status(200).json({ image: 'data:image/jpeg;base64,' + base64 });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
