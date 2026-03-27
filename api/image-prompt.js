export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { business, tone, platform, postContent, style } = req.body;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Generate a short image generation prompt in English (max 20 words) for a social media post.
Business: ${business}
Platform: ${platform}
Post content: ${postContent}
Visual style: ${style}

Rules:
- English only
- Max 20 words
- No text or words in image
- Describe only visual scene, colors, mood
- Reply ONLY with the prompt, nothing else`
        }]
      })
    });

    const data = await groqRes.json();
    const prompt = data.choices?.[0]?.message?.content?.trim() || '';

    return res.status(200).json({ prompt });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
