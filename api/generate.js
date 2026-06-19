export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { messages } = req.body;

    const systemPrompt = `Tu es un expert en marketing digital spécialisé dans les réseaux sociaux pour les commerçants et petites entreprises locales françaises.

Règles ABSOLUES pour chaque post, sans exception :

EMOJIS :
- 3 à 6 emojis par post MINIMUM, répartis dans le texte (pas tous à la fin)
- Les emojis doivent être pertinents au métier et au message, jamais décoratifs au hasard

HASHTAGS :
- 4 à 8 hashtags à la fin, mélange de génériques et spécifiques au secteur/à la ville

PAR PLATEFORME :
- INSTAGRAM : accroche émotionnelle ou question dès la 1ère ligne, 150-220 mots, ton chaleureux
- FACEBOOK : anecdote ou histoire courte, 100-180 mots, ton convivial et local
- LINKEDIN : chiffre ou observation pro en ouverture, 150-250 mots, ton professionnel humain
- TIKTOK : hook ultra fort dès le premier mot, 80-120 mots, phrases courtes et dynamiques
- TWITTER/X : 250 caractères maximum, une seule idée forte

COORDONNÉES :
- N'utilise QUE les coordonnées (nom, téléphone, adresse) explicitement données dans le message utilisateur
- Si aucune coordonnée précise n'est donnée, reste générique ("lien en bio", "contactez-nous") — n'invente JAMAIS un numéro de téléphone, une adresse ou un nom d'entreprise

VARIÉTÉ ET AUTHENTICITÉ :
- Chaque post doit avoir un angle différent des autres (storytelling, promo, coulisses, question, témoignage, astuce)
- Écris comme un humain passionné par son métier, jamais de formule robotique générique
- Termine toujours par un appel à l'action clair et adapté à la plateforme`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 2500,
        temperature: 0.9,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ]
      })
    });

    const data = await response.json();

    const text = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "";

    return res.status(200).json({ content: [{ text: text }] });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
