// ============================================================
// creative-api.js — Creative Studio API (migrated from missionpulse.ai)
//
// POST: action-based routing for creative project management
// Auth: ?key= parameter checked against COMMAND_CENTER_KEY env var
// ============================================================

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function unauthorized() {
  return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unauthorized" }) };
}

function ok(data) {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function err(status, msg) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ error: msg }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return err(500, "Not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, supabase);
  if (!auth.authenticated) return unauthorized();

  // === GET: List projects with counts ===
  if (event.httpMethod === "GET") {
    const [projectsRes, imagesRes, promptsRes] = await Promise.all([
      supabase
        .from("creative_projects")
        .select("*, creative_prompts(count), creative_images(count)")
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("creative_images")
        .select("id, project_id, image_url, thumbnail_url, model_used, rating, selected, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("creative_prompts")
        .select("id, project_id, prompt_text, style_tags, version, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return ok({
      projects: projectsRes.data || [],
      recent_images: imagesRes.data || [],
      recent_prompts: promptsRes.data || [],
    });
  }

  // === POST: Actions ===
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    const { action } = body;

    // --- list_projects ---
    if (action === "list_projects") {
      const { data, error: qErr } = await supabase
        .from("creative_projects")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(body.limit || 50);
      if (qErr) return err(500, qErr.message);
      return ok({ projects: data });
    }

    // --- create_project ---
    if (action === "create_project") {
      const { article_title, article_url, article_excerpt, pipeline_id } = body;
      if (!article_title) return err(400, "article_title required");
      const { data, error: insertErr } = await supabase
        .from("creative_projects")
        .insert({
          article_title,
          article_url: article_url || null,
          article_excerpt: article_excerpt || null,
          pipeline_id: pipeline_id || null,
        })
        .select("*")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ created: true, project: data });
    }

    // --- update_project ---
    if (action === "update_project" && body.id) {
      const updates = { updated_at: new Date().toISOString() };
      if (body.status) updates.status = body.status;
      if (body.article_title) updates.article_title = body.article_title;
      if (body.article_url !== undefined) updates.article_url = body.article_url;
      if (body.article_excerpt !== undefined) updates.article_excerpt = body.article_excerpt;
      if (body.pipeline_id !== undefined) updates.pipeline_id = body.pipeline_id;
      const { error: updateErr } = await supabase.from("creative_projects").update(updates).eq("id", body.id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ updated: true });
    }

    // --- delete_project ---
    if (action === "delete_project" && body.id) {
      const { error: deleteErr } = await supabase.from("creative_projects").delete().eq("id", body.id);
      if (deleteErr) return err(500, deleteErr.message);
      return ok({ deleted: true });
    }

    // --- get_project (full detail with prompts, images, research) ---
    if (action === "get_project" && body.id) {
      const [projRes, promptsRes, imagesRes, researchRes] = await Promise.all([
        supabase.from("creative_projects").select("*").eq("id", body.id).single(),
        supabase.from("creative_prompts").select("*").eq("project_id", body.id).order("created_at", { ascending: false }),
        supabase.from("creative_images").select("*").eq("project_id", body.id).is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("creative_research").select("*").eq("project_id", body.id).order("created_at", { ascending: false }),
      ]);
      if (projRes.error) return err(404, "Project not found");
      return ok({
        project: projRes.data,
        prompts: promptsRes.data || [],
        images: imagesRes.data || [],
        research: researchRes.data || [],
      });
    }

    // --- create_prompt ---
    if (action === "create_prompt") {
      const { project_id, prompt_text, style_tags, parent_prompt_id } = body;
      if (!project_id || !prompt_text) return err(400, "project_id and prompt_text required");

      // Auto-increment version
      let version = 1;
      if (parent_prompt_id) {
        const { data: parent } = await supabase
          .from("creative_prompts")
          .select("version")
          .eq("id", parent_prompt_id)
          .single();
        if (parent) version = parent.version + 1;
      }

      const { data, error: insertErr } = await supabase
        .from("creative_prompts")
        .insert({
          project_id,
          prompt_text,
          style_tags: style_tags || [],
          version,
          parent_prompt_id: parent_prompt_id || null,
        })
        .select("*")
        .single();
      if (insertErr) return err(500, insertErr.message);

      // Update project status
      await supabase.from("creative_projects").update({ status: "generating" }).eq("id", project_id);

      return ok({ created: true, prompt: data });
    }

    // --- generate_image (calls ai-image function internally) ---
    if (action === "generate_image") {
      const { project_id, prompt_id, prompt_text, provider, size, style } = body;
      if (!project_id || !prompt_id || !prompt_text) return err(400, "project_id, prompt_id, and prompt_text required");

      // Call the existing ai-image function logic
      try {
        const aiImageModule = require("./ai-image");
        const fakeEvent = {
          httpMethod: "POST",
          queryStringParameters: { key: event.queryStringParameters?.key },
          body: JSON.stringify({
            provider: provider || "gpt_image",
            prompt: prompt_text,
            size: size || "1024x1024",
            style: style || "natural",
          }),
        };
        const aiResp = await aiImageModule.handler(fakeEvent);
        const aiData = JSON.parse(aiResp.body);

        if (aiResp.statusCode !== 200 || aiData.error) {
          return err(aiResp.statusCode || 500, aiData.error || "Image generation failed");
        }

        // Store the image URL
        const imageUrl = aiData.base64
          ? `data:${aiData.mimeType || "image/png"};base64,${aiData.base64}`
          : aiData.url;

        const { data: imgRow, error: imgErr } = await supabase
          .from("creative_images")
          .insert({
            project_id,
            prompt_id,
            image_url: imageUrl,
            model_used: provider || "gpt_image",
            generation_params: { size, style, revised_prompt: aiData.revised_prompt },
          })
          .select("*")
          .single();
        if (imgErr) return err(500, imgErr.message);

        return ok({ created: true, image: imgRow, revised_prompt: aiData.revised_prompt });
      } catch (e) {
        return err(500, e.message);
      }
    }

    // --- list_images ---
    if (action === "list_images") {
      const query = supabase
        .from("creative_images")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(body.limit || 50);
      if (body.project_id) query.eq("project_id", body.project_id);
      const { data, error: qErr } = await query;
      if (qErr) return err(500, qErr.message);
      return ok({ images: data });
    }

    // --- rate_image ---
    if (action === "rate_image" && body.id) {
      const updates = {};
      if (body.rating !== undefined) updates.rating = body.rating;
      if (body.selected !== undefined) updates.selected = body.selected;
      if (body.notes !== undefined) updates.notes = body.notes;
      const { error: updateErr } = await supabase.from("creative_images").update(updates).eq("id", body.id);
      if (updateErr) return err(500, updateErr.message);

      // If selecting, update project status
      if (body.selected && body.project_id) {
        // Deselect others in the same project
        await supabase.from("creative_images").update({ selected: false }).eq("project_id", body.project_id).neq("id", body.id);
        await supabase.from("creative_projects").update({ status: "complete" }).eq("id", body.project_id);
      }

      return ok({ updated: true });
    }

    // --- delete_image (soft delete) ---
    if (action === "delete_image" && body.id) {
      const { error: updateErr } = await supabase
        .from("creative_images")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", body.id);
      if (updateErr) return err(500, updateErr.message);
      return ok({ deleted: true });
    }

    // --- research ---
    if (action === "add_research") {
      const { project_id, type, content, source } = body;
      if (!project_id || !type || !content) return err(400, "project_id, type, and content required");
      const { data, error: insertErr } = await supabase
        .from("creative_research")
        .insert({ project_id, type, content, source: source || null })
        .select("*")
        .single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ created: true, research: data });
    }

    // --- list_research ---
    if (action === "list_research" && body.project_id) {
      const { data, error: qErr } = await supabase
        .from("creative_research")
        .select("*")
        .eq("project_id", body.project_id)
        .order("created_at", { ascending: false });
      if (qErr) return err(500, qErr.message);
      return ok({ research: data });
    }

    return err(400, "Unknown action: " + action);
  }

  return err(405, "Method not allowed");
};
