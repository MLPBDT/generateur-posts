export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body;
    const clean = (prompt || 'beautiful photo') + ', high quality, professional photography, no text, no watermark, no logo';

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: clean,
          steps: 6
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error("Cloudflare error " + response.status + ": " + text.substring(0, 300));
    }

    const data = await response.json();

    if (!data.success || !data.result?.image) {
      throw new Error("Pas d'image dans la réponse: " + JSON.stringify(data).substring(0, 300));
    }

    // Cloudflare returns base64 image directly
    const base64 = data.result.image;
    return res.status(200).json({ image: `data:image/jpeg;base64,${base64}` });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
