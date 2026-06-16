export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body;
    const clean = (prompt || 'beautiful photo') + ', high quality, no text, no watermark, no logo';

    const response = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.TOGETHER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "black-forest-labs/FLUX.1-schnell-Free",
        prompt: clean,
        width: 1024,
        height: 1024,
        steps: 4,
        n: 1
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error("Together AI error " + response.status + ": " + text.substring(0, 200));
    }

    const data = await response.json();
    const imageUrl = data?.data?.[0]?.url;

    if (!imageUrl) throw new Error("Pas d'image dans la réponse");

    // Fetch the image and convert to base64
    const imgRes = await fetch(imageUrl);
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return res.status(200).json({ image: `data:image/jpeg;base64,${base64}` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
