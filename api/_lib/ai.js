// Groq (OpenAI-compatible). gpt-oss models think before answering: keep it short and hidden.
export async function chatJson(messages, { maxTokens = 1800, temperature = 0.8 } = {}) {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY manquante");
  const body = {
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", messages, temperature,
    max_completion_tokens: maxTokens + 1500, reasoning_effort: "low", include_reasoning: false,
    response_format: { type: "json_object" },
  };
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) {
      await new Promise((ok) => setTimeout(ok, Math.min(8, Number(r.headers.get("retry-after")) || 2 * (i + 1)) * 1000));
      if (i === 1) body.model = process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b";
      continue;
    }
    if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const t = (d.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error("Réponse IA illisible"); }
  }
  throw new Error("Groq indisponible (limite de débit)");
}
