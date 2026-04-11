export default async function handler(req, res) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    const data = await response.json();
    
    // Filter only image-capable models
    const models = (data.models || [])
      .filter(m => JSON.stringify(m).toLowerCase().includes('image'))
      .map(m => ({ name: m.name, methods: m.supportedGenerationMethods }));

    return res.status(200).json({ imageModels: models, total: data.models?.length });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
