export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body;
    const clean = (prompt || 'beautiful photo') + ', high quality, no text, no watermark, no logo';

    // Try models in order until one works
    const models = [
      'gemini-2.0-flash-preview-image-generation',
      'gemini-2.0-flash-exp-image-generation',
      'imagen-3.0-generate-002',
    ];

    let lastError = '';

    for (const model of models) {
      try {
        const isImagen = model.startsWith('imagen');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${isImagen ? 'predict' : 'generateContent'}?key=${process.env.GEMINI_API_KEY}`;

        const body = isImagen
          ? {
              instances: [{ prompt: clean }],
              parameters: { sampleCount: 1 }
            }
          : {
              contents: [{ parts: [{ text: "Generate an image: " + clean }] }],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
            };

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          lastError = await response.text();
          continue;
        }

        const data = await response.json();

        // Extract image - Gemini format
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData);
        if (imagePart) {
          const base64 = imagePart.inlineData.data;
          const mimeType = imagePart.inlineData.mimeType || 'image/png';
          return res.status(200).json({ image: `data:${mimeType};base64,${base64}` });
        }

        // Extract image - Imagen format
        const imgData = data?.predictions?.[0]?.bytesBase64Encoded;
        if (imgData) {
          return res.status(200).json({ image: `data:image/png;base64,${imgData}` });
        }

        lastError = 'No image in response: ' + JSON.stringify(data).substring(0, 200);
      } catch(e) {
        lastError = e.message;
        continue;
      }
    }

    throw new Error('All models failed. Last error: ' + lastError.substring(0, 300));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
