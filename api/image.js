export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body;
    const clean = (prompt || 'beautiful photo') + ', high quality, no text, no watermark, no logo';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Generate an image: " + clean }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error("Gemini error " + response.status + ": " + text.substring(0, 300));
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData);

    if (!imagePart) {
      throw new Error("Pas d'image dans la réponse: " + JSON.stringify(data).substring(0, 200));
    }

    const base64 = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    return res.status(200).json({ image: `data:${mimeType};base64,${base64}` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
