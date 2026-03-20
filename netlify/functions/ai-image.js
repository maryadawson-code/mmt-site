// ============================================================
// ai-image.js — Image generation proxy (DALL-E 3, GPT Image, Imagen 3)
//
// POST: { provider, prompt, size, style, quality }
// Auth: ?key= checked against COMMAND_CENTER_KEY
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: HEADERS, body: '{"error":"Method not allowed"}' };

  const _sb = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;
  const authResult = await validateAuth(event, _sb);
  if (!authResult.authenticated) {
    return { statusCode: 401, headers: HEADERS, body: '{"error":"Unauthorized"}' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: HEADERS, body: '{"error":"Invalid JSON"}' }; }

  const { provider, prompt, size = "1024x1024", style = "natural", quality = "standard" } = body;

  try {
    let result;

    if (provider === "dalle3" || provider === "gpt_image") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

      const model = provider === "gpt_image" ? "gpt-image-1" : "dall-e-3";
      const reqBody = { model, prompt, n: 1, size };
      if (provider === "dalle3") { reqBody.style = style; reqBody.quality = quality; }
      if (provider === "gpt_image") { reqBody.quality = quality; }

      const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      const img = data.data[0];
      result = {
        url: img.url || null,
        base64: img.b64_json || null,
        revised_prompt: img.revised_prompt || null,
        provider,
        mimeType: "image/png",
      };

    } else if (provider === "imagen3") {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

      const aspectRatio = size === "1792x1024" ? "16:9" : size === "1024x1792" ? "9:16" : "1:1";
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio } }),
      });
      if (!resp.ok) throw new Error(`Google ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      result = { base64: data.predictions[0].bytesBase64Encoded, provider: "imagen3", mimeType: "image/png" };

    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Log to database
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      await supabase.from("generated_images").insert({
        prompt,
        provider,
        model: provider === "dalle3" ? "dall-e-3" : provider === "gpt_image" ? "gpt-image-1" : "imagen-3.0",
        image_url: result.url || null,
        size,
        style,
        metadata: { revised_prompt: result.revised_prompt },
      });
    } catch { /* non-blocking */ }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
