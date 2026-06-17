export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { messages } = req.body;

    const systemPrompt = `Tu es un expert en marketing digital spécialisé dans les réseaux sociaux pour les commerçants et petites entreprises locales françaises.

Règles ABSOLUES pour chaque post :

INSTAGRAM :
- Commence par une accroche émotionnelle ou une question percutante
- 150-220 mots maximum
- 8-15 hashtags pertinents à la fin (mélange populaires + niche + local)
- 2-4 emojis bien placés et pertinents
- CTA clair (réserver, commander, venir nous voir, lien en bio)
- Ton authentique et chaleureux

FACEBOOK :
- Commence par une histoire courte ou une anecdote locale
- 100-180 mots
- 2-3 hashtags seulement
- Favorise le partage et les commentaires
- CTA avec invitation à réagir ou partager
- Ton convivial et ancré dans le local

LINKEDIN :
- Commence par un chiffre, une stat ou une observation pro
- 150-250 mots
- Partage une expertise ou un apprentissage métier
- 3-5 hashtags professionnels
- CTA orienté réseau et expertise
- Ton professionnel mais humain et accessible

TIKTOK :
- Première ligne = hook ultra fort qui arrête le scroll
- 80-120 mots maximum
- Style parlé, dynamique, phrases courtes
- 5-8 hashtags tendance
- CTA vers le profil ou le lien en bio
- Ton jeune, énergique, authentique

TWITTER/X :
- Maximum 250 caractères
- Une seule idée forte et mémorable
- 1-2 hashtags maximum
- Ton direct, percutant ou informatif

RÈGLES GÉNÉRALES :
- Adapte TOUJOURS au business spécifique mentionné
- Utilise le nom du lieu/ville si mentionné
- Intègre la promo naturellement sans être trop commercial
- Varie les angles : émotion, info, humour, coulisses, témoignage
- Emojis pertinents et bien dosés, pas décoratifs
- JAMAIS de formules génériques comme "Nous sommes ravis de vous annoncer"
- Écris comme un humain passionné par son métier, pas comme un robot
- Les posts doivent donner envie de liker, commenter et partager
- Chaque post doit être VRAIMENT différent des autres : pas deux fois la même structure, pas deux fois la même accroche`;

    const angles = [
      "storytelling émotionnel — raconte une histoire vraie ou imaginée liée au business",
      "offre directe et percutante — mets en avant la valeur et l'urgence",
      "coulisses du métier — montre ce que le client ne voit pas d'habitude",
      "question d'engagement — pose une question qui donne envie de commenter",
      "témoignage ou avis client — écris comme si un client satisfait témoignait",
      "conseil ou astuce utile — donne une info de valeur liée au secteur",
      "humour ou anecdote légère — ton qui fait sourire"
    ];

    const formats = [
      "texte fluide et naturel",
      "liste courte avec emojis (3-4 points max)",
      "mini histoire en 3 temps (situation → problème → solution)",
      "question directe suivie de la réponse",
      "citation inspirante ou phrase forte en ouverture"
    ];

    const enhancedMessages = messages.map((msg, idx) => {
      if (idx === messages.length - 1 && msg.role === 'user') {
        const userContent = msg.content;
        const countMatch = userContent.match(/Nombre de posts demand[ée]s? ?: ?(\d+)/);
        const count = countMatch ? parseInt(countMatch[1]) : 5;

        let angleInstructions = '\n\nPour garantir une vraie variété, utilise CES ANGLES PRÉCIS, un par post, dans cet ordre :\n';
        for (let i = 0; i < count; i++) {
          const angle = angles[i % angles.length];
          const format = formats[i % formats.length];
          angleInstructions += `Post ${i + 1} : Angle "${angle}" — Format "${format}"\n`;
        }

        return { ...msg, content: userContent + angleInstructions };
      }
      return msg;
    });

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
          ...enhancedMessages
        ]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({ content: [{ text }] });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
