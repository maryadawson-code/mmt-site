# Agent Bridge API Reference

**Endpoint:** `/.netlify/functions/agent-bridge`
**Auth:** Bearer token via `Authorization: Bearer <AGENT_BRIDGE_KEY>`
**Content-Type:** `application/json`

All POST endpoints use `action` field in the JSON body to route requests.

---

## GET — Read Dashboard State

**Query params:** `?section=all|agents|tasks|signals|pipeline|orders`

**Response (section=all):**
```json
{
  "agents": [{ "agent": "string", "status": "string", "last_seen": "ISO-8601", "current_task": "string" }],
  "tasks": [{ "id": "uuid", "task": "string", "agent": "string", "status": "string", "priority": "string", "created_at": "ISO-8601" }],
  "signals": [{ "id": "uuid", "title": "string", "signal_type": "string", "summary": "string", "status": "string" }],
  "pipeline": [{ "id": "uuid", "publish_date": "date", "day_slot": "string", "lead_topic": "string", "status": "string" }],
  "orders": {
    "marketpulse": [{ "id": "uuid", "email": "string", "topic": "string", "workflow_state": "string" }],
    "proposalpulse": [{ "id": "uuid", "email": "string", "file_name": "string", "verdict": "string", "overall_grade": "string" }]
  }
}
```

---

## POST Actions — Tasks

### `dispatch_task`
Dispatch a task to an agent.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | Yes | Task description |
| `agent` | string | Yes | Target agent name |
| `priority` | string | No | `normal` (default), `high`, `urgent` |

**Response:** `{ "task_id": "uuid" }`

### `complete_task`
Mark a task as completed.

| Field | Type | Required |
|-------|------|----------|
| `task_id` | uuid | Yes |
| `result` | any | No |

**Response:** `{ "completed": true }`

### `fail_task`
Mark a task as failed.

| Field | Type | Required |
|-------|------|----------|
| `task_id` | uuid | Yes |
| `result` | any | No |

**Response:** `{ "failed": true }`

### `update_task_status`
Update task status during execution.

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `task_id` | uuid | Yes | |
| `status` | string | Yes | `pending`, `acknowledged`, `in_progress`, `awaiting_approval`, `completed`, `failed` |
| `status_detail` | string | No | |

**Response:** `{ "updated": true }`

---

## POST Actions — Agents

### `update_agent`
Upsert agent heartbeat status.

| Field | Type | Required |
|-------|------|----------|
| `agent_id` | string | Yes |
| `status` | string | No | Default: `idle` |
| `current_task` | string | No |

**Response:** `{ "updated": true }`

---

## POST Actions — Signals

### `add_signal`
Add an intel signal.

| Field | Type | Required |
|-------|------|----------|
| `title` | string | Yes |
| `signal_type` | string | No |
| `summary` | string | No |
| `urls` | string[] | No |
| `severity` | string | No |

**Response:** `{ "signal_id": "uuid" }`

### `triage_signal`
Triage an intel signal.

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `signal_id` | uuid | Yes | |
| `triage_status` | string | Yes | `new`, `newsletter`, `dismissed`, `pinned` |

**Response:** `{ "triaged": true }`

---

## POST Actions — Pipeline

### `update_pipeline`
Update a newsletter pipeline entry.

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | Yes |
| `status` | string | No |
| `lead_topic` | string | No |
| `lead_score` | number | No |
| `notes` | string | No |
| `linkedin_drafted` | boolean | No |
| `podcast_points_drafted` | boolean | No |

**Response:** `{ "updated": true }`

### `add_pipeline`
Add a newsletter pipeline entry.

| Field | Type | Required |
|-------|------|----------|
| `publish_date` | date | Yes |
| `day_slot` | string | Yes |
| `lead_topic` | string | No |
| `notes` | string | No |

**Response:** `{ "pipeline_id": "uuid" }`

---

## POST Actions — Approvals

### `request_approval`
Request human approval for an agent action.

| Field | Type | Required |
|-------|------|----------|
| `agent_id` | string | Yes |
| `action_summary` | string | Yes |
| `action_detail` | string | No |
| `risk_level` | string | No | Default: `medium` |
| `task_id` | uuid | No |
| `context` | object | No |

**Response:** `{ "approval_id": "uuid" }`

### `decide_approval`
Approve or deny a pending approval.

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `approval_id` | uuid | Yes | |
| `decision` | string | Yes | `approved`, `denied` |
| `decided_by` | string | No | Default: `operator` |

**Response:** `{ "decided": true }`

### `list_approvals`
List approvals by status.

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `status` | string | No | `pending` (default), `recent`, or any status value |

**Response:** `{ "approvals": [...] }`

### `approval_submit`
Submit item to approval queue with auto-approve logic.

| Field | Type | Required |
|-------|------|----------|
| `title` | string | Yes |
| `category` | string | Yes |
| `targetRole` | string | Yes |
| `submittedBy` | string | Yes |
| `payloadType` | string | Yes |
| `description` | string | No |
| `targetEmail` | string | No |
| `payload` | object | No |
| `context` | object | No |
| `previewHtml` | string | No |

**Response:** `{ "approvalId": "uuid", "autoApproved": boolean }`

---

## POST Actions — Cost Management

### `cost_summary`
Get today's cost summary.

**Response:** `{ "totalCents": number, "calls": number, "alerts": [...] }`

### `cost_resolve_alert`
Resolve a cost alert.

| Field | Type | Required |
|-------|------|----------|
| `alertId` | uuid | Yes |
| `decision` | string | No |
| `notes` | string | No |

### `cost_update_threshold`
Update cost alert threshold for a function.

| Field | Type | Required |
|-------|------|----------|
| `product` | string | Yes |
| `provider` | string | Yes |
| `functionName` | string | Yes |
| `multiplier` | number | No |

---

## POST Actions — Finance

### `finance_summary`
Get financial overview (today's spend + monthly burn + pending decisions).

### `finance_alerts`
List unresolved finance alerts.

### `finance_services`
List all services in inventory.

### `finance_update_service`
Update a service record.

| Field | Type | Required |
|-------|------|----------|
| `serviceName` | string | Yes |
| `fields` | object | Yes |

---

## POST Actions — Customers

### `customer_summary`
Get customer health summary (total, active, revenue, at-risk count).

### `customer_at_risk`
List customers with high churn risk.

### `customer_update`
Update customer profile.

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |
| `fields` | object | Yes |

---

## POST Actions — Projects

### `project_dashboard`
Get active projects and open task counts.

### `project_backlog`
List open project tasks.

### `project_create_task`
Create a project task.

| Field | Type | Required |
|-------|------|----------|
| `title` | string | Yes |
| `description` | string | No |
| `priority` | string | No |
| `assignee` | string | No |
| `type` | string | No |
| `platform` | string | No |

### `project_move_task`
Update task status.

| Field | Type | Required |
|-------|------|----------|
| `taskId` | uuid | Yes |
| `status` | string | Yes |

---

## POST Actions — Issues

### `issue_list`
List open issues (not closed/wont-fix).

### `issue_detail`
Get issue detail with comments.

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | Yes |

### `issue_create`
Create a new issue.

| Field | Type | Required |
|-------|------|----------|
| `title` | string | Yes |
| `category` | string | No | Default: `bug` |
| `source` | string | No | Default: `agent` |
| `product` | string | No |
| `severity` | string | No | Default: `medium` |
| `errorLogs` | string | No |
| `rootCause` | string | No |
| `suggestedFix` | string | No |
| `affectedFiles` | string[] | No |
| `assignAgent` | string | No | Default: `ops-code` |

### `issue_comment`
Add comment to issue.

| Field | Type | Required |
|-------|------|----------|
| `issueId` | uuid | Yes |
| `content` | string | Yes |
| `author` | string | No |
| `authorType` | string | No |
| `codeDiff` | string | No |
| `codeFile` | string | No |

### `issue_diagnose`
Add diagnosis to an issue.

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | Yes |
| `rootCause` | string | No |
| `affectedFiles` | string[] | No |
| `suggestedFix` | string | No |
| `fixComplexity` | string | No |
| `estimatedMinutes` | number | No |

### `issue_propose_fix`
Propose a fix for an issue.

| Field | Type | Required |
|-------|------|----------|
| `id` | uuid | Yes |
| `fixDiff` | string | No |
| `fixBranch` | string | No |
| `fixCommit` | string | No |
| `fixPrUrl` | string | No |
| `fixComplexity` | string | No |

---

## POST Actions — Deployments

### `deployment_log`
Log a deployment.

| Field | Type | Required |
|-------|------|----------|
| `branch` | string | Yes |
| `commitSha` | string | No |
| `commitMessage` | string | No |
| `deployType` | string | No | Default: `production` |
| `triggeredBy` | string | No |
| `netlifyDeployId` | string | No |
| `status` | string | No | Default: `success` |
| `homepageStatus` | number | No |
| `homepageSize` | number | No |
| `fixesIssues` | uuid[] | No |

### `deployment_verify`
Verify a deployment and update fixed issues.

| Field | Type | Required |
|-------|------|----------|
| `deploymentId` | uuid | Yes |
| `status` | string | No | Default: `success` |
| `homepageStatus` | number | No |
| `homepageSize` | number | No |
| `verificationNotes` | string | No |
| `fixesIssues` | uuid[] | No |

---

## POST Actions — QA

### `qa_summary`
Get QA summary for all products (proposalpulse, marketpulse, site).

### `qa_regressions`
List recent regressions.

---

## Error Responses

All errors return:
```json
{ "error": "Error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Missing required fields or invalid input |
| 401 | Missing or invalid Bearer token |
| 429 | Rate limited (60 req/min per IP) |
| 500 | Internal server error |

---

## Rate Limiting

60 requests per minute per IP address. Returns 429 with:
```json
{ "error": "Too many requests", "reset_minutes": 1 }
```
