// projects-api.js — Projects, sprints, and task management API

const { createClient } = require("@supabase/supabase-js");
const { validateAuth } = require("./lib/auth");

const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function ok(d) { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(d) }; }
function err(s, m) { return { statusCode: s, headers: HEADERS, body: JSON.stringify({ error: m }) }; }

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const auth = await validateAuth(event, sb);
  if (!auth.authenticated) return err(401, "Unauthorized");
  const params = event.queryStringParameters || {};

  if (event.httpMethod === "GET") {
    const view = params.view || "dashboard";

    if (view === "dashboard") {
      const [projectsRes, tasksRes, sprintsRes] = await Promise.all([
        sb.from("projects").select("*").eq("status", "active").order("priority"),
        sb.from("project_tasks").select("id, title, status, priority, assignee, type, platform, completed_at").not("status", "in", '("done","cancelled")').order("priority").limit(100),
        sb.from("sprints").select("*").eq("status", "active"),
      ]);
      const tasks = tasksRes.data || [];
      const blocked = tasks.filter(t => t.status === "blocked").length;
      return ok({
        projects: projectsRes.data || [],
        openTasks: tasks.length,
        blockedTasks: blocked,
        sprints: sprintsRes.data || [],
        tasksByStatus: tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {}),
      });
    }

    if (view === "backlog") {
      const { data } = await sb.from("project_tasks").select("*").not("status", "in", '("done","cancelled")').order("priority").order("created_at", { ascending: false });
      return ok({ tasks: data || [] });
    }

    if (view === "sprint" && params.id) {
      const { data: sprint } = await sb.from("sprints").select("*").eq("id", params.id).single();
      const { data: tasks } = await sb.from("project_tasks").select("*").eq("sprint_id", params.id).order("status").order("priority");
      return ok({ sprint, tasks: tasks || [] });
    }

    if (view === "blocked") {
      const { data } = await sb.from("project_tasks").select("*").eq("status", "blocked").order("priority");
      return ok({ tasks: data || [] });
    }

    if (view === "assignee") {
      const assignee = params.assignee;
      if (!assignee) return err(400, "assignee required");
      const { data } = await sb.from("project_tasks").select("*").eq("assignee", assignee).not("status", "in", '("done","cancelled")').order("priority");
      return ok({ tasks: data || [] });
    }

    if (view === "burndown") {
      const { data: done } = await sb.from("project_tasks").select("completed_at").eq("status", "done").not("completed_at", "is", null).order("completed_at");
      const { data: total } = await sb.from("project_tasks").select("id", { count: "exact", head: true });
      return ok({ completedByDate: (done || []).reduce((acc, t) => { const d = t.completed_at.split("T")[0]; acc[d] = (acc[d] || 0) + 1; return acc; }, {}), totalTasks: total });
    }

    return err(400, "Unknown view: " + view);
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch { return err(400, "Invalid JSON"); }

    if (body.action === "create_task") {
      const { title, description, priority, assignee, type, platform, projectId, sprintId, tags } = body;
      if (!title) return err(400, "title required");
      const { data, error: insertErr } = await sb.from("project_tasks").insert({
        title, description, priority: priority || "normal", assignee, type: type || "task",
        platform, project_id: projectId, sprint_id: sprintId, tags: tags || [],
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ taskId: data.id });
    }

    if (body.action === "update_task") {
      const { id, ...updates } = body;
      if (!id) return err(400, "id required");
      delete updates.action;
      updates.updated_at = new Date().toISOString();
      if (updates.status === "in_progress" && !updates.started_at) updates.started_at = new Date().toISOString();
      if (updates.status === "done" && !updates.completed_at) updates.completed_at = new Date().toISOString();
      await sb.from("project_tasks").update(updates).eq("id", id);
      return ok({ updated: true });
    }

    if (body.action === "create_sprint") {
      const { name, goal, projectId, startDate, endDate } = body;
      if (!name) return err(400, "name required");
      const { data, error: insertErr } = await sb.from("sprints").insert({
        name, goal, project_id: projectId, start_date: startDate, end_date: endDate, status: "active",
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ sprintId: data.id });
    }

    if (body.action === "create_project") {
      const { name, description, platform, owner, priority, startDate, targetDate } = body;
      if (!name || !platform) return err(400, "name and platform required");
      const { data, error: insertErr } = await sb.from("projects").insert({
        name, description, platform, owner, priority: priority || "normal", start_date: startDate, target_date: targetDate,
      }).select("id").single();
      if (insertErr) return err(500, insertErr.message);
      return ok({ projectId: data.id });
    }

    if (body.action === "move_task") {
      const { id, status, sprintId } = body;
      if (!id) return err(400, "id required");
      const updates = { updated_at: new Date().toISOString() };
      if (status) {
        updates.status = status;
        if (status === "in_progress") updates.started_at = new Date().toISOString();
        if (status === "done") updates.completed_at = new Date().toISOString();
      }
      if (sprintId !== undefined) updates.sprint_id = sprintId;
      await sb.from("project_tasks").update(updates).eq("id", id);
      return ok({ moved: true });
    }

    return err(400, "Unknown action");
  }

  return err(405, "Method not allowed");
};
