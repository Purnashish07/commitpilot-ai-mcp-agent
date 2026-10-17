# CommitPilot AI V3 Ultimate - Production Winner

An autonomous, AI-driven commitment tracker and execution engine powered by **FastAPI**, **React 18 + TypeScript**, **Tailwind CSS**, **Model Context Protocol (MCP)**, **SQLite**, and designed for **AWS Bedrock**.

---

### Core Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite (Configured with relative `/api` proxy)
- **Backend**: Python 3.10+, FastAPI, Pydantic, SQLite persistent database
- **Protocol**: Model Context Protocol (MCP v1) with full transparent reasoning and tool specifications
- **AI Engine**: Bedrock-simulated cognitive decomposition (ready for `anthropic.claude-3-sonnet` via `boto3`)

---

## 🛠️ How to Run

### 1. Backend (FastAPI + SQLite + MCP)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Backend runs at `http://localhost:8000`. Interactive API Docs are available at `http://localhost:8000/docs` and MCP specification at `http://localhost:8000/mcp/tools`.

### 2. Frontend (React + TypeScript + Tailwind)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser. All requests to `/api` and `/mcp` are proxied directly to the backend.

---

## 🌟 V3 Features & Fixes Implemented

### 1. Robust Fixes
- **Relative API Proxy**: `API = '/api'` in `frontend/src/App.tsx` mapped through Vite proxy in `vite.config.ts`, ensuring instant local and production deployment with no CORS or hardcoded host failures.
- **Past Date Validation**: Backend validates `date.fromisoformat(deadline) < date.today()` and raises HTTP 400; frontend prevents past date selection.
- **Title Validation**: Enforced minimum 3 characters on both frontend UI input and backend Pydantic model (`min_length=3`).
- **Complete Task State Machine**: Endpoints for `proposed -> approved -> in_progress -> blocked -> done`:
  - `POST /api/tasks/{task_id}/approve`
  - `POST /api/tasks/{task_id}/start`
  - `POST /api/tasks/{task_id}/block`
  - `POST /api/tasks/{task_id}/complete`
  - `POST /api/tasks/{task_id}/update` (state-validated generic fallback)
- **Search & Tag Filter**: `GET /api/commitments?q={search_query}` with real-time reactive search and tag filtering.
- **Error Handling**: Wrapped all client requests in `try/catch` with informative banner alerts for error and success states.

### 2. Winner Features
- **Dynamic Commitment Score**: `commitment_score = done / total * 100` dynamically calculated on every commitment.
- **Cognitive Decomposition Fields**: Each task features `reasoning`, `ai_insight` ("Why this next?"), and `next_action`.
- **25-Minute Focus Timer**: Pomodoro deep work countdown timer triggerable directly from tasks (`POST /api/focus/{task_id}`) and header status widget.
- **Live MCP Terminal**: Real-time audit log of MCP tools, statuses, and reasoning.
- **100% Milestone Certificate Modal**: Celebration certificate with print/save support when all tasks in a commitment reach 100%.
- **Risk Score Engine**: Dynamic risk calculation (0-100 score + Low/Medium/High level) with priority penalty boosts for blockers, approaching deadlines, or low completion rates.
- **Kanban Board & Cards Views**: Switch seamlessly between Card view and a 4-column drag/click Kanban board.
- **AWS Bedrock Integration Hook**: Documented Claude 3 Sonnet `boto3` invocation hook in `backend/main.py`.

---

## 📦 Project Structure
```
CommitPilot-FIXED/
├── backend/
│   ├── main.py              # FastAPI endpoints, state machine, risk engine, Bedrock simulation
│   ├── models.py            # Pydantic validation schemas
│   ├── mcp_server.py        # Model Context Protocol tools implementation
│   ├── commitpilot.db       # SQLite persistent storage
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # React TypeScript application (Kanban, Timer, Certificate, MCP logs)
│   │   ├── main.tsx         # Root entry point
│   │   └── index.css        # Tailwind directives
│   ├── vite.config.ts       # Vite proxy config (/api -> http://localhost:8000)
│   ├── tailwind.config.js   # Tailwind CSS configuration
│   └── package.json         # Frontend dependencies and build scripts
├── README.md                # Comprehensive documentation
├── RUN_BACKEND.bat          # 1-Click Windows run backend
├── RUN_FRONTEND.bat         # 1-Click Windows run frontend
└── HOW_TO_RUN.txt           # Quick start instructions
```
## Friction Log 

Task 1:【entity-GitHub¦canonical_name=GitHub】 push from Antigravity
Steps: Created repo CommitPilot-【entity-GitHub¦canonical_name=GitHub】-Ready, tried one-click push from IDE.
Expected: Direct push with 【entity-GitHub¦canonical_name=GitHub】 auth.
Actual: Failed - PAT token required, no helper UI.
Severity: Medium
Workaround: Created classic PAT with repo scope.
Suggestion: Add GitHub PAT helper in Antigravity UI.

Task 2: Devpost description blocked
Steps: Pasted description with -> and https URL.
Expected: Accept.
Actual: Error - must be URL.
Severity: Low
Workaround: Replaced -> with to and moved URLs to separate field.
Suggestion: Allow markdown chars in description field.

Task 3: Bedrock Claude 3 Cold Start
Steps: Integrated Bedrock for reasoning.
Expected: Instant.
Actual: 3-4 sec first call delay.
Severity: Low
Workaround: Added Simulated mode flag with instant fallback.
Suggestion: Add edge cache example in Bedrock docs.
