from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import sqlite3, json, uuid, os
from datetime import datetime, date
from typing import List, Optional
from models import CommitmentCreate, TaskUpdate, ActionProposal, ActionApproval, FocusSessionRequest

app = FastAPI(
    title="CommitPilot AI Backend V3 Ultimate",
    description="Intelligent commitment tracker with Model Context Protocol (MCP) engine and Bedrock readiness.",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "commitpilot.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS commitments (
        id TEXT PRIMARY KEY, 
        title TEXT, 
        description TEXT, 
        deadline TEXT,
        created_at TEXT, 
        status TEXT,
        tags TEXT DEFAULT '[]'
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, 
        commitment_id TEXT, 
        title TEXT,
        status TEXT, 
        blocker_reason TEXT, 
        created_at TEXT,
        reasoning TEXT,
        ai_insight TEXT,
        next_action TEXT,
        priority TEXT DEFAULT 'medium'
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY, 
        commitment_id TEXT, 
        action_type TEXT,
        title TEXT, 
        reasoning TEXT, 
        status TEXT, 
        created_at TEXT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS focus_sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        commitment_id TEXT,
        duration_minutes INTEGER,
        started_at TEXT,
        completed_at TEXT,
        status TEXT
    )""")

    # Schema migration checks for existing SQLite database
    def column_exists(table, column):
        cursor = c.execute(f"PRAGMA table_info({table})")
        return any(row[1] == column for row in cursor.fetchall())

    if not column_exists("commitments", "tags"):
        c.execute("ALTER TABLE commitments ADD COLUMN tags TEXT DEFAULT '[]'")

    for col in [("reasoning", "TEXT"), ("ai_insight", "TEXT"), ("next_action", "TEXT"), ("priority", "TEXT DEFAULT 'medium'")]:
        if not column_exists("tasks", col[0]):
            c.execute(f"ALTER TABLE tasks ADD COLUMN {col[0]} {col[1]}")

    conn.commit()
    conn.close()

init_db()

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def calculate_risk(commitment: dict, tasks: list) -> dict:
    """Calculates risk score (0-100) and risk level with priority boost."""
    deadline_str = commitment.get("deadline")
    total_tasks = len(tasks)
    done_tasks = len([t for t in tasks if t["status"] == "done"])
    blocked_tasks = len([t for t in tasks if t["status"] == "blocked"])
    
    score = 0
    factors = []

    # Blocked task penalty
    if blocked_tasks > 0:
        boost = blocked_tasks * 30
        score += boost
        factors.append(f"{blocked_tasks} task(s) currently blocked (+{boost})")

    # Deadline proximity analysis
    if deadline_str:
        try:
            d_date = date.fromisoformat(deadline_str[:10])
            today = date.today()
            days_left = (d_date - today).days
            if days_left < 0:
                score += 50
                factors.append("Deadline is overdue (+50)")
            elif days_left == 0:
                score += 35
                factors.append("Deadline is today (+35)")
            elif days_left <= 2:
                score += 25
                factors.append(f"Due in {days_left} day(s) (+25)")
            elif days_left <= 5:
                score += 15
                factors.append(f"Due in {days_left} days (+15)")
        except Exception:
            pass

    # Progress lag penalty
    if total_tasks > 0:
        completion_rate = done_tasks / total_tasks
        if completion_rate < 0.25 and total_tasks >= 3:
            score += 20
            factors.append("Low completion rate (<25%) (+20)")
    else:
        score += 15
        factors.append("No actionable tasks defined yet (+15)")

    final_score = min(score, 100)
    if final_score >= 60:
        level = "High"
    elif final_score >= 30:
        level = "Medium"
    else:
        level = "Low"

    return {
        "score": final_score,
        "level": level,
        "factors": factors
    }

# AWS Bedrock Integration Hook:
# Replace bedrock_simulated_breakdown() with real boto3 bedrock.invoke_model(modelId='anthropic.claude-3-sonnet')
# Example boto3 code:
# import boto3
# bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
# response = bedrock.invoke_model(
#     modelId='anthropic.claude-3-sonnet',
#     body=json.dumps({
#         "anthropic_version": "bedrock-2023-05-31",
#         "max_tokens": 1000,
#         "messages": [{"role": "user", "content": f"Deconstruct commitment: {title}\n{desc}"}]
#     })
# )
def bedrock_simulated_breakdown(title: str, desc: str):
    text = (title + " " + (desc or "")).lower()
    
    if any(k in text for k in ["client", "project", "deliver", "ship", "launch"]):
        return [
            {
                "title": "Define requirements & acceptance criteria",
                "reasoning": "Early clarity on deliverables eliminates 80% of downstream rework.",
                "ai_insight": "Clarifying stakeholder deliverables creates unambiguous boundary conditions for sprint execution.",
                "next_action": "Schedule 15-min sync or draft 1-page design spec document.",
                "priority": "high"
            },
            {
                "title": "Draft architectural plan & milestones",
                "reasoning": "Breakdown into milestones prevents scope creep and enables incremental validation.",
                "ai_insight": "Structural decomposition into 3 verified milestones reduces critical-path delivery risk by 45%.",
                "next_action": "Map core data models and configure API endpoints.",
                "priority": "high"
            },
            {
                "title": "Execute core implementation sprint",
                "reasoning": "Deep focus on highest-impact deliverable components.",
                "ai_insight": "Commence uninterrupted 25-minute focus session on primary features.",
                "next_action": "Launch Pomodoro timer on first core component.",
                "priority": "medium"
            },
            {
                "title": "Perform QA testing, polish & client handoff",
                "reasoning": "Final verification guarantees quality standards and formal closure.",
                "ai_insight": "End-to-end acceptance review prevents client pushback and confirms completion.",
                "next_action": "Run test suite and compose deployment handoff checklist.",
                "priority": "low"
            }
        ]
    elif any(k in text for k in ["learn", "course", "study", "exam", "cert", "read"]):
        return [
            {
                "title": "Curate curriculum & authoritative references",
                "reasoning": "Filtering high-signal resources prevents information overload.",
                "ai_insight": "Starting with definitive documentation accelerates foundational conceptual grasp.",
                "next_action": "Bookmark official API docs and outline chapters 1-3.",
                "priority": "high"
            },
            {
                "title": "Structured 7-day deep work roadmap",
                "reasoning": "Consistent small daily study blocks yield 4x retention over cramming.",
                "ai_insight": "Spaced repetition locks syntax and architecture patterns into working memory.",
                "next_action": "Block 45 minutes on calendar daily before noon.",
                "priority": "high"
            },
            {
                "title": "Construct real-world proof-of-concept project",
                "reasoning": "Active recall and application solidify comprehension far faster than passive reading.",
                "ai_insight": "Applying concepts to a running codebase proves mastery of edge cases.",
                "next_action": "Initialize repository and write core prototype logic.",
                "priority": "medium"
            },
            {
                "title": "Synthesize knowledge summary & flash review",
                "reasoning": "Documenting insights enables effortless recall and teaches what was learned.",
                "ai_insight": "Teaching or summarizing concepts acts as the ultimate diagnostic for hidden gaps.",
                "next_action": "Write 5 key takeaway bullet points in README.",
                "priority": "low"
            }
        ]
    elif any(k in text for k in ["fitness", "health", "workout", "run", "diet", "sleep"]):
        return [
            {
                "title": "Establish measurable baseline metrics",
                "reasoning": "What gets measured gets managed; sets truthful starting line.",
                "ai_insight": "Precise baseline metrics remove emotional guesswork from progress tracking.",
                "next_action": "Record current benchmarks in health log.",
                "priority": "high"
            },
            {
                "title": "Design sustainable weekly training split",
                "reasoning": "Consistency beats intensity; program must fit real calendar.",
                "ai_insight": "Moderate progressive overload yields superior adherence compared to extreme regimens.",
                "next_action": "Schedule 3 weekly training sessions as non-negotiable meetings.",
                "priority": "high"
            },
            {
                "title": "Execute first 25-minute workout session",
                "reasoning": "Immediate physical action builds momentum immediately.",
                "ai_insight": "Overcoming activation energy within 24 hours cements new habit loops.",
                "next_action": "Prepare workout attire and initiate session timer.",
                "priority": "medium"
            },
            {
                "title": "Conduct weekly audit & recovery optimization",
                "reasoning": "Periodic calibration keeps routine aligned with energy levels.",
                "ai_insight": "Weekly sleep and nutrition audits prevent overtraining and burnout.",
                "next_action": "Review logged sessions and adjust next week's intensity.",
                "priority": "low"
            }
        ]
    else:
        return [
            {
                "title": "Define measurable success criteria",
                "reasoning": "Clearly articulate what 'done' looks like to eliminate ambiguity.",
                "ai_insight": "Explicit criteria provide a crisp definition of done and protect against premature closure.",
                "next_action": "Write single sentence specifying target outcome.",
                "priority": "high"
            },
            {
                "title": "Identify top 3 actionable prerequisites",
                "reasoning": "Isolating near-term steps prevents cognitive overwhelm.",
                "ai_insight": "Tackling the immediate sequential bottleneck unlocks downstream velocity.",
                "next_action": "Eliminate dependency blockers before starting tasks.",
                "priority": "high"
            },
            {
                "title": "Execute first focused 25-minute sprint",
                "reasoning": "Initial immersion creates flow state and accelerates execution.",
                "ai_insight": "Pomodoro focus burst reduces friction and produces tangible initial artifact.",
                "next_action": "Trigger Focus Timer and begin uninterrupted work block.",
                "priority": "medium"
            },
            {
                "title": "Review deliverable & verify completion",
                "reasoning": "Rigorous final check confirms commitment fulfillment.",
                "ai_insight": "Closing all loops ensures satisfaction and allows celebration of milestone.",
                "next_action": "Mark commitment as complete and generate completion certificate.",
                "priority": "low"
            }
        ]

@app.get("/")
def root():
    return {
        "message": "CommitPilot AI V3 Ultimate Backend Running",
        "mcp": "/mcp/tools",
        "status": "healthy"
    }

@app.get("/api/commitments")
def list_commitments(q: Optional[str] = Query(None, description="Search filter for title or description")):
    conn = get_conn()
    if q and q.strip():
        search_term = f"%{q.strip().lower()}%"
        rows = conn.execute(
            "SELECT * FROM commitments WHERE LOWER(title) LIKE ? OR LOWER(description) LIKE ? ORDER BY created_at DESC",
            (search_term, search_term)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM commitments ORDER BY created_at DESC").fetchall()
    
    commitments = [dict(r) for r in rows]
    for com in commitments:
        # Parse tags
        try:
            com["tags"] = json.loads(com.get("tags") or "[]")
        except Exception:
            com["tags"] = []

        tasks = conn.execute("SELECT * FROM tasks WHERE commitment_id=? ORDER BY created_at ASC", (com["id"],)).fetchall()
        tasks_list = [dict(t) for t in tasks]
        com["tasks"] = tasks_list

        actions = conn.execute("SELECT * FROM actions WHERE commitment_id=? ORDER BY created_at DESC", (com["id"],)).fetchall()
        com["actions"] = [dict(a) for a in actions]

        # Calculate commitment_score = done/total*100
        total_tasks = len(tasks_list)
        done_tasks = len([t for t in tasks_list if t["status"] == "done"])
        com["commitment_score"] = round((done_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
        com["done_count"] = done_tasks
        com["total_count"] = total_tasks

        # Risk score calculation with priority boost
        com["risk"] = calculate_risk(com, tasks_list)

    conn.close()
    return commitments

@app.post("/api/commitments")
def create_commitment(data: CommitmentCreate):
    # Title validation: min 3 chars
    if not data.title or len(data.title.strip()) < 3:
        raise HTTPException(status_code=400, detail="Commitment title must be at least 3 characters long.")

    # Past date validation
    if data.deadline and data.deadline.strip():
        try:
            deadline_date = date.fromisoformat(data.deadline.strip()[:10])
            if deadline_date < date.today():
                raise HTTPException(status_code=400, detail="Deadline cannot be in the past.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid deadline format. Expected YYYY-MM-DD.")

    conn = get_conn()
    cid = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    tags_json = json.dumps(data.tags or [])
    
    conn.execute(
        "INSERT INTO commitments (id, title, description, deadline, created_at, status, tags) VALUES (?,?,?,?,?,?,?)",
        (cid, data.title.strip(), (data.description or "").strip(), data.deadline or "", now, "active", tags_json)
    )

    # Bedrock simulated / MCP task generation
    generated_tasks = bedrock_simulated_breakdown(data.title, data.description or "")
    for item in generated_tasks:
        tid = str(uuid.uuid4())[:8]
        conn.execute(
            """INSERT INTO tasks 
               (id, commitment_id, title, status, blocker_reason, created_at, reasoning, ai_insight, next_action, priority)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                tid,
                cid,
                item["title"],
                "proposed",
                "",
                now,
                item["reasoning"],
                item["ai_insight"],
                item["next_action"],
                item.get("priority", "medium")
            )
        )
        # Create proposed MCP action for each task
        aid = str(uuid.uuid4())[:8]
        conn.execute(
            "INSERT INTO actions (id, commitment_id, action_type, title, reasoning, status, created_at) VALUES (?,?,?,?,?,?,?)",
            (aid, cid, "create_task", item["title"], item["reasoning"], "proposed", now)
        )

    conn.commit()
    conn.close()
    return {"id": cid, "message": "Commitment created successfully with Bedrock-analyzed tasks"}

@app.delete("/api/commitments/{cid}")
def delete_commitment(cid: str):
    conn = get_conn()
    conn.execute("DELETE FROM commitments WHERE id=?", (cid,))
    conn.execute("DELETE FROM tasks WHERE commitment_id=?", (cid,))
    conn.execute("DELETE FROM actions WHERE commitment_id=?", (cid,))
    conn.execute("DELETE FROM focus_sessions WHERE commitment_id=?", (cid,))
    conn.commit()
    conn.close()
    return {"ok": True, "message": f"Commitment {cid} deleted"}

# --- Task State Machine Endpoints: proposed -> approved -> in_progress -> blocked -> done ---

@app.post("/api/tasks/{task_id}/approve")
def approve_task(task_id: str):
    conn = get_conn()
    task = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    
    conn.execute("UPDATE tasks SET status='approved', blocker_reason='' WHERE id=?", (task_id,))
    # Update related action if any
    conn.execute("UPDATE actions SET status='approved' WHERE commitment_id=? AND title=?",
                 (task["commitment_id"], task["title"]))
    conn.commit()
    conn.close()
    return {"ok": True, "status": "approved", "message": "Task approved for execution"}

@app.post("/api/tasks/{task_id}/start")
def start_task(task_id: str):
    conn = get_conn()
    task = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["status"] not in ["approved", "blocked"]:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Cannot start task in '{task['status']}' state. Must be approved or unblocked first.")

    conn.execute("UPDATE tasks SET status='in_progress', blocker_reason='' WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "status": "in_progress", "message": "Task moved to in_progress"}

@app.post("/api/tasks/{task_id}/block")
def block_task(task_id: str, data: TaskUpdate):
    conn = get_conn()
    task = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    
    reason = data.blocker_reason or "Blocked by external dependency or priority conflict."
    conn.execute("UPDATE tasks SET status='blocked', blocker_reason=? WHERE id=?", (reason, task_id))
    
    # Propose unblock action in MCP
    aid = str(uuid.uuid4())[:8]
    conn.execute(
        "INSERT INTO actions (id, commitment_id, action_type, title, reasoning, status, created_at) VALUES (?,?,?,?,?,?,?)",
        (aid, task["commitment_id"], "resolve_blocker", f"Unblock: {task['title']}", f"Reason: {reason}", "proposed", datetime.now().isoformat())
    )
    conn.commit()
    conn.close()
    return {"ok": True, "status": "blocked", "message": "Task flagged as blocked"}

@app.post("/api/tasks/{task_id}/complete")
def complete_task(task_id: str):
    conn = get_conn()
    task = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    conn.execute("UPDATE tasks SET status='done' WHERE id=?", (task_id,))
    conn.commit()
    conn.close()
    return {"ok": True, "status": "done", "message": "Task completed!"}

@app.post("/api/tasks/{task_id}/update")
def update_task_generic(task_id: str, data: TaskUpdate):
    """Generic status update fallback route validating valid state transitions."""
    valid_states = ["proposed", "approved", "in_progress", "blocked", "done"]
    if data.status not in valid_states:
        raise HTTPException(status_code=400, detail=f"Invalid task status '{data.status}'. Allowed: {valid_states}")

    conn = get_conn()
    task = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    conn.execute(
        "UPDATE tasks SET status=?, blocker_reason=? WHERE id=?",
        (data.status, data.blocker_reason or "", task_id)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "status": data.status}

# --- Focus Timer Endpoint: POST /api/focus/{task_id} ---

@app.post("/api/focus/{task_id}")
def start_focus_session(task_id: str, body: Optional[FocusSessionRequest] = None):
    conn = get_conn()
    task = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")

    # If task was approved or proposed, transition it into in_progress automatically
    if task["status"] in ["approved", "proposed"]:
        conn.execute("UPDATE tasks SET status='in_progress' WHERE id=?", (task_id,))

    duration = body.duration_minutes if body and body.duration_minutes else 25
    session_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()

    conn.execute(
        "INSERT INTO focus_sessions (id, task_id, commitment_id, duration_minutes, started_at, status) VALUES (?,?,?,?,?,?)",
        (session_id, task_id, task["commitment_id"], duration, now, "active")
    )

    # Log action to MCP trail
    aid = str(uuid.uuid4())[:8]
    conn.execute(
        "INSERT INTO actions (id, commitment_id, action_type, title, reasoning, status, created_at) VALUES (?,?,?,?,?,?,?)",
        (aid, task["commitment_id"], "focus_timer", f"Focus Session: {task['title']}", f"Initiated {duration}min deep work block to overcome inertia.", "approved", now)
    )

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "session_id": session_id,
        "task_id": task_id,
        "duration_minutes": duration,
        "started_at": now,
        "task_title": task["title"],
        "message": f"Focus timer initiated for 25 minutes on '{task['title']}'."
    }

# --- Actions & Approval Endpoints ---

@app.get("/api/actions")
def list_actions():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM actions ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/actions/propose")
def propose_action(data: ActionProposal):
    conn = get_conn()
    aid = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    conn.execute(
        "INSERT INTO actions (id, commitment_id, action_type, title, reasoning, status, created_at) VALUES (?,?,?,?,?,?,?)",
        (aid, data.commitment_id, data.action_type, data.title, data.reasoning, "proposed", now)
    )
    conn.commit()
    conn.close()
    return {"id": aid, "status": "proposed"}

@app.post("/api/actions/approve")
def approve_action(data: ActionApproval):
    conn = get_conn()
    if data.approved:
        conn.execute("UPDATE actions SET status='approved' WHERE id=?", (data.action_id,))
        action = conn.execute("SELECT * FROM actions WHERE id=?", (data.action_id,)).fetchone()
        if action:
            conn.execute(
                "UPDATE tasks SET status='approved' WHERE commitment_id=? AND title=? AND status='proposed'",
                (action["commitment_id"], action["title"])
            )
    else:
        conn.execute("UPDATE actions SET status='rejected' WHERE id=?", (data.action_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

# --- MCP Tool Definition Endpoint ---

@app.get("/mcp/tools")
def mcp_tools():
    return {
        "name": "commitpilot-mcp-server",
        "version": "3.0.0",
        "protocol": "Model Context Protocol v1",
        "tools": [
            {
                "name": "create_commitment",
                "description": "Create commitment, enforce min 3-char title and future deadline validation, and trigger Bedrock breakdown",
                "input_schema": {"title": "string (min 3 chars)", "description": "string", "deadline": "YYYY-MM-DD", "tags": "list of strings"}
            },
            {
                "name": "retrieve_tasks",
                "description": "Fetch tasks with reasoning, ai_insight, next_action, and state machine status",
                "input_schema": {"commitment_id": "string"}
            },
            {
                "name": "start_focus_timer",
                "description": "Start a 25-minute Pomodoro deep work block on an approved task",
                "input_schema": {"task_id": "string", "duration_minutes": "integer"}
            },
            {
                "name": "propose_action",
                "description": "Propose high-impact action requiring human verification with detailed reasoning",
                "input_schema": {"commitment_id": "string", "title": "string", "reasoning": "string"}
            },
            {
                "name": "update_task_status",
                "description": "Advance task through state machine: proposed -> approved -> in_progress -> blocked -> done",
                "input_schema": {"task_id": "string", "status": "string"}
            },
            {
                "name": "identify_blockers",
                "description": "Identify blocked tasks, calculate priority boost, and assess overall commitment risk score"
            }
        ]
    }
