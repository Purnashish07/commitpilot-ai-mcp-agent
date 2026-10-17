import { useEffect, useState, useMemo } from 'react'

type Task = {
  id: string
  commitment_id: string
  title: string
  status: 'proposed' | 'approved' | 'in_progress' | 'blocked' | 'done'
  blocker_reason?: string
  created_at: string
  reasoning?: string
  ai_insight?: string
  next_action?: string
  priority?: string
}

type Risk = {
  score: number
  level: 'Low' | 'Medium' | 'High'
  factors: string[]
}

type Action = {
  id: string
  commitment_id: string
  action_type: string
  title: string
  reasoning: string
  status: string
  created_at: string
}

type Commitment = {
  id: string
  title: string
  description: string
  deadline: string
  created_at: string
  status: string
  tags?: string[]
  tasks: Task[]
  actions: Action[]
  commitment_score: number
  done_count: number
  total_count: number
  risk: Risk
}

// Relative endpoint leveraging Vite proxy to prevent deployment failure
const API = '/api'

export default function App() {
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [deadline, setDeadline] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(['engineering', 'q4-goal'])
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)

  // Kanban view vs List view
  const [viewMode, setViewMode] = useState<'cards' | 'kanban'>('cards')

  // Focus Timer state (25 minutes = 1500 seconds)
  const [focusTask, setFocusTask] = useState<Task | null>(null)
  const [focusCommitmentTitle, setFocusCommitmentTitle] = useState<string>('')
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60)
  const [timerRunning, setTimerRunning] = useState<boolean>(false)

  // Certificate modal state
  const [certCommitment, setCertCommitment] = useState<Commitment | null>(null)

  // MCP Terminal Logs state
  const [mcpLogs, setMcpLogs] = useState<Action[]>([])

  const notifyError = (msg: string) => {
    setErrorBanner(msg)
    setTimeout(() => setErrorBanner(null), 6000)
  }

  const notifySuccess = (msg: string) => {
    setSuccessBanner(msg)
    setTimeout(() => setSuccessBanner(null), 4000)
  }

  // Fetch commitments with search filter
  const fetchData = async (q: string = searchQuery) => {
    setRefreshing(true)
    try {
      const url = q.trim() ? `${API}/commitments?q=${encodeURIComponent(q.trim())}` : `${API}/commitments`
      const res = await fetch(url)
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.detail || `Server returned error status ${res.status}`)
      }
      const data: Commitment[] = await res.json()
      setCommitments(data)

      // Fetch live MCP actions
      const actRes = await fetch(`${API}/actions`)
      if (actRes.ok) {
        const actData = await actRes.json()
        setMcpLogs(actData)
      }
    } catch (err: any) {
      console.error('Fetch error:', err)
      notifyError(`Failed to load data from backend: ${err.message || 'Unknown network error'}`)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Timer countdown effect
  useEffect(() => {
    let interval: any = null
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1)
      }, 1000)
    } else if (timeLeft === 0 && timerRunning) {
      setTimerRunning(false)
      notifySuccess(`🎉 Focus block complete for: "${focusTask?.title}"! Take a 5-minute break.`)
    }
    return () => clearInterval(interval)
  }, [timerRunning, timeLeft, focusTask])

  // Handle Tag addition
  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const clean = tagInput.trim().replace(/^#/, '').toLowerCase()
      if (clean && !tags.includes(clean)) {
        setTags([...tags, clean])
      }
      setTagInput('')
    }
  }

  const removeTag = (t: string) => {
    setTags(tags.filter((item) => item !== t))
  }

  // Create Commitment
  const createCommitment = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Title min length 3 validation (frontend guard)
    if (!title || title.trim().length < 3) {
      notifyError('Validation Error: Commitment title must be at least 3 characters long.')
      return
    }

    // Past date validation (frontend guard)
    if (deadline) {
      const selected = new Date(deadline + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (selected < today) {
        notifyError('Validation Error: Deadline cannot be in the past. Please select today or a future date.')
        return
      }
    }

    setLoading(true)
    try {
      const res = await fetch(`${API}/commitments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim(),
          deadline: deadline || null,
          tags: tags
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Server returned error ${res.status}`)
      }

      setTitle('')
      setDesc('')
      setDeadline('')
      setTags(['engineering', 'q4-goal'])
      notifySuccess('Commitment created! AI Bedrock simulation generated decomposed tasks with reasoning.')
      await fetchData()
    } catch (err: any) {
      notifyError(`Could not create commitment: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // State Machine Transition Handlers
  const approveTask = async (taskId: string) => {
    try {
      const res = await fetch(`${API}/tasks/${taskId}/approve`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to approve task')
      notifySuccess('Task approved! Ready for execution.')
      fetchData()
    } catch (err: any) {
      notifyError(err.message)
    }
  }

  const startTask = async (task: Task, commitmentTitle: string) => {
    try {
      const res = await fetch(`${API}/tasks/${task.id}/start`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to start task')
      
      // Also offer to launch Focus Timer
      setFocusTask(task)
      setFocusCommitmentTitle(commitmentTitle)
      setTimeLeft(25 * 60)
      setTimerRunning(true)
      notifySuccess(`Task "${task.title}" is in progress! 25-minute Focus Timer started.`)
      fetchData()
    } catch (err: any) {
      notifyError(err.message)
    }
  }

  const blockTask = async (taskId: string) => {
    const reason = window.prompt('Specify reason for blocker (e.g. Waiting on API credentials or approval):')
    if (reason === null) return
    try {
      const res = await fetch(`${API}/tasks/${taskId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'blocked', blocker_reason: reason || 'Blocked by external dependency' })
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to block task')
      notifySuccess('Task marked as blocked. High risk penalty calculated.')
      fetchData()
    } catch (err: any) {
      notifyError(err.message)
    }
  }

  const completeTask = async (taskId: string, commitment: Commitment) => {
    try {
      const res = await fetch(`${API}/tasks/${taskId}/complete`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to complete task')
      
      if (focusTask?.id === taskId) {
        setTimerRunning(false)
      }
      notifySuccess('Great work! Task marked as done.')
      await fetchData()

      // Check if this was the last remaining task to trigger 100% Certificate!
      const currentUndone = commitment.tasks.filter((t) => t.id !== taskId && t.status !== 'done')
      if (currentUndone.length === 0) {
        setCertCommitment({ ...commitment, commitment_score: 100 })
      }
    } catch (err: any) {
      notifyError(err.message)
    }
  }

  // Trigger Focus Timer manually via POST /api/focus/{task_id}
  const triggerFocusTimer = async (task: Task, commitmentTitle: string) => {
    try {
      const res = await fetch(`${API}/focus/${task.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_minutes: 25 })
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to initiate focus session')
      setFocusTask(task)
      setFocusCommitmentTitle(commitmentTitle)
      setTimeLeft(25 * 60)
      setTimerRunning(true)
      notifySuccess(`25-minute Pomodoro timer engaged for "${task.title}". Focus mode on!`)
      fetchData()
    } catch (err: any) {
      notifyError(err.message)
    }
  }

  const approveAllProposed = async (c: Commitment) => {
    const proposed = c.tasks.filter((x) => x.status === 'proposed')
    if (proposed.length === 0) {
      notifySuccess('All tasks already approved!')
      return
    }
    try {
      for (const t of proposed) {
        await fetch(`${API}/tasks/${t.id}/approve`, { method: 'POST' })
      }
      notifySuccess(`Approved ${proposed.length} proposed tasks successfully!`)
      fetchData()
    } catch (err: any) {
      notifyError(`Error approving tasks: ${err.message}`)
    }
  }

  const deleteCommitment = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this commitment and all associated tasks?')) return
    try {
      const res = await fetch(`${API}/commitments/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete commitment')
      notifySuccess('Commitment deleted.')
      fetchData()
    } catch (err: any) {
      notifyError(err.message)
    }
  }

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // All distinct tags for filter bar
  const allUniqueTags = useMemo(() => {
    const set = new Set<string>()
    commitments.forEach((c) => (c.tags || []).forEach((t) => set.add(t)))
    return Array.from(set)
  }, [commitments])

  // Filtered commitments
  const displayedCommitments = useMemo(() => {
    if (selectedTagFilter === 'all') return commitments
    return commitments.filter((c) => (c.tags || []).includes(selectedTagFilter))
  }, [commitments, selectedTagFilter])

  // Flattened tasks for Kanban view
  const allTasksWithParent = useMemo(() => {
    const list: { task: Task; parent: Commitment }[] = []
    displayedCommitments.forEach((c) => {
      c.tasks.forEach((t) => list.push({ task: t, parent: c }))
    })
    return list
  }, [displayedCommitments])

  return (
    <div className="min-h-screen bg-[#0d1117] text-zinc-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Banner Notifications */}
      {errorBanner && (
        <div className="bg-rose-500/90 text-white px-6 py-2.5 text-sm font-medium flex items-center justify-between shadow-lg sticky top-0 z-50 backdrop-blur-md border-b border-rose-400">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{errorBanner}</span>
          </div>
          <button onClick={() => setErrorBanner(null)} className="text-rose-100 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}
      {successBanner && (
        <div className="bg-emerald-500/90 text-white px-6 py-2.5 text-sm font-medium flex items-center justify-between shadow-lg sticky top-0 z-50 backdrop-blur-md border-b border-emerald-400">
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-emerald-100 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-[#161b22]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-tr from-cyan-500 via-indigo-500 to-fuchsia-500 text-white grid place-items-center rounded-xl font-black text-lg shadow-md shadow-cyan-500/20">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  CommitPilot AI
                </span>
                <span className="text-[10px] font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  V3 Ultimate
                </span>
                <span className="text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  MCP Active
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Autonomous Commitment Tracker • Bedrock AI Deconstruction • State-Machine Execution
              </p>
            </div>
          </div>

          {/* Active Focus Session Widget in Header */}
          {focusTask && (
            <div className="flex items-center gap-3 bg-zinc-900/90 border border-cyan-500/40 rounded-xl px-3 py-1.5 shadow-lg shadow-cyan-500/10">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></div>
              <div className="text-xs">
                <span className="text-zinc-400 text-[10px] block leading-none">FOCUS BLOCK (25m)</span>
                <span className="font-semibold text-cyan-300 truncate max-w-[140px] inline-block">{focusTask.title}</span>
              </div>
              <div className="font-mono text-base font-bold text-white bg-zinc-800 px-2.5 py-0.5 rounded-lg border border-zinc-700">
                {formatTime(timeLeft)}
              </div>
              <button
                onClick={() => setTimerRunning(!timerRunning)}
                className="text-xs px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium transition"
              >
                {timerRunning ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => {
                  setTimerRunning(false)
                  setFocusTask(null)
                }}
                className="text-xs text-zinc-400 hover:text-zinc-200"
                title="Dismiss timer"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded-md font-medium transition ${viewMode === 'cards' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              >
                Cards View
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1 rounded-md font-medium transition ${viewMode === 'kanban' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              >
                Kanban Board
              </button>
            </div>
            <button
              onClick={() => fetchData()}
              disabled={refreshing}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition text-xs border border-zinc-700"
              title="Refresh data"
            >
              {refreshing ? '⟳...' : '🔄'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[370px_1fr] gap-6 flex-1 w-full">
        {/* Left Column: Create Form + MCP Live Terminal */}
        <div className="space-y-6">
          {/* Commitment Creation Card */}
          <div className="bg-[#161b22] rounded-2xl border border-zinc-800 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-base text-zinc-100 flex items-center gap-2">
                <span>🎯</span> New Commitment
              </h2>
              <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 font-mono">
                min 3 chars
              </span>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              AI decomposes your promise into prioritized next actions with risk analysis.
            </p>

            <form onSubmit={createCommitment} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">Title (min 3 characters)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Deliver client v3 prototype by Friday"
                  className="w-full bg-[#0d1117] border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">Context / Deliverable Details</label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Specific requirements, outcome expectations, constraints..."
                  className="w-full bg-[#0d1117] border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 h-20 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">Deadline (Must be today or future)</label>
                <input
                  type="date"
                  value={deadline}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-[#0d1117] border border-zinc-700 rounded-xl px-3.5 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">Tags (Press enter or comma)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map((t) => (
                    <span key={t} className="text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      #{t}
                      <button type="button" onClick={() => removeTag(t)} className="hover:text-rose-400 text-[10px]">✕</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Add tag and hit enter..."
                  className="w-full bg-[#0d1117] border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-gradient-to-r from-cyan-600 via-indigo-600 to-fuchsia-600 hover:from-cyan-500 hover:to-fuchsia-500 text-white rounded-xl py-3 text-sm font-semibold shadow-lg shadow-cyan-900/40 hover:shadow-cyan-500/30 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="animate-spin text-sm">⟳</span>
                    <span>Deconstructing with Bedrock...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Create Commitment + AI Breakdown</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 p-3.5 bg-zinc-900/70 rounded-xl border border-zinc-800/80 text-[11px]">
              <p className="font-semibold text-zinc-300 mb-1 flex items-center gap-1.5">
                <span className="text-cyan-400">●</span> State Machine Pipeline
              </p>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400 font-mono mt-1 overflow-x-auto py-1">
                <span className="bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/40">proposed</span>
                <span>→</span>
                <span className="bg-blue-950 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800/40">approved</span>
                <span>→</span>
                <span className="bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded border border-purple-800/40">in_progress</span>
                <span>→</span>
                <span className="bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/40">done</span>
              </div>
            </div>
          </div>

          {/* Live Model Context Protocol (MCP) Terminal */}
          <div className="bg-[#161b22] rounded-2xl border border-zinc-800 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <h3 className="font-semibold text-xs text-zinc-200 uppercase tracking-wider font-mono">
                  MCP Terminal & Reasoning
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">protocol: v1</span>
            </div>
            <p className="text-[11px] text-zinc-400 mb-3">
              Real-time audit log of AI actions, reasoning, and tool executions.
            </p>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 font-mono text-[11px]">
              {mcpLogs.length === 0 ? (
                <div className="p-3 bg-zinc-900/60 rounded-lg text-zinc-500 text-center italic">
                  No MCP events logged yet.
                </div>
              ) : (
                mcpLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="p-2.5 bg-[#0d1117] border border-zinc-800 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-cyan-400 font-bold">{log.action_type}()</span>
                      <span className={`px-1.5 py-0.2 rounded ${log.status === 'approved' ? 'text-emerald-400 bg-emerald-950' : 'text-amber-400 bg-amber-950'}`}>
                        {log.status}
                      </span>
                    </div>
                    <div className="text-zinc-300 text-xs font-sans font-medium truncate">{log.title}</div>
                    <div className="text-[10px] text-zinc-400 bg-zinc-900/80 p-1.5 rounded border border-zinc-800/60 font-sans">
                      <span className="text-purple-400 font-semibold font-mono">Reasoning: </span>
                      {log.reasoning}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Search + Filters + Commitments / Kanban */}
        <div className="space-y-5">
          {/* Search Bar & Tag Filter Controls */}
          <div className="bg-[#161b22] rounded-2xl border border-zinc-800 p-4 shadow-sm flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <span className="absolute left-3.5 top-2.5 text-zinc-500 text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  fetchData(e.target.value)
                }}
                placeholder="Search commitments by title or description (?q filter)..."
                className="w-full bg-[#0d1117] border border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    fetchData('')
                  }}
                  className="absolute right-3 top-2.5 text-zinc-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Tag Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedTagFilter('all')}
                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition whitespace-nowrap ${
                  selectedTagFilter === 'all'
                    ? 'bg-zinc-200 text-black border-white'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                All Tags
              </button>
              {allUniqueTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTagFilter(tag)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition whitespace-nowrap ${
                    selectedTagFilter === tag
                      ? 'bg-cyan-500 text-black border-cyan-400 font-bold'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>

          {/* Header Stats */}
          <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg text-zinc-100">
                Commitments ({displayedCommitments.length})
              </h2>
              {selectedTagFilter !== 'all' && (
                <span className="text-xs text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded-full border border-cyan-800">
                  filtered by #{selectedTagFilter}
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-400 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Persistent SQLite
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Bedrock Simulated
              </span>
            </div>
          </div>

          {/* Empty State */}
          {displayedCommitments.length === 0 && (
            <div className="bg-[#161b22] border border-dashed border-zinc-800 rounded-2xl p-12 text-center text-zinc-500 space-y-3">
              <div className="text-4xl">🚀</div>
              <p className="font-medium text-zinc-300">No commitments found</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Create a new commitment on the left or clear your active search query to start tracking with AI decomposition.
              </p>
            </div>
          )}

          {/* KANBAN BOARD VIEW */}
          {viewMode === 'kanban' && displayedCommitments.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {(
                [
                  { key: 'proposed', title: 'Proposed', color: 'border-amber-500/40 bg-amber-500/5' },
                  { key: 'approved', title: 'Approved', color: 'border-blue-500/40 bg-blue-500/5' },
                  { key: 'in_progress', title: 'In Progress', color: 'border-purple-500/40 bg-purple-500/5' },
                  { key: 'done', title: 'Done', color: 'border-emerald-500/40 bg-emerald-500/5' }
                ] as const
              ).map((col) => {
                const colTasks = allTasksWithParent.filter((item) => item.task.status === col.key)
                return (
                  <div key={col.key} className={`rounded-xl border ${col.color} p-3 flex flex-col space-y-3 min-h-[420px]`}>
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                      <span className="font-bold text-xs uppercase tracking-wider text-zinc-300">{col.title}</span>
                      <span className="text-xs font-mono bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">
                        {colTasks.length}
                      </span>
                    </div>

                    <div className="space-y-2.5 overflow-y-auto flex-1">
                      {colTasks.map(({ task, parent }) => (
                        <div key={task.id} className="p-3 bg-[#161b22] border border-zinc-800 rounded-xl space-y-2 shadow-sm">
                          <div className="text-[10px] text-zinc-400 font-medium truncate">
                            🎯 {parent.title}
                          </div>
                          <div className="text-xs font-semibold text-zinc-100">{task.title}</div>
                          {task.reasoning && (
                            <div className="text-[10px] text-zinc-400 bg-zinc-900/80 p-1.5 rounded border border-zinc-800/80">
                              💡 {task.reasoning}
                            </div>
                          )}

                          {/* Quick State Machine Transition Actions */}
                          <div className="pt-1 flex flex-wrap gap-1">
                            {task.status === 'proposed' && (
                              <button
                                onClick={() => approveTask(task.id)}
                                className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded font-medium"
                              >
                                Approve
                              </button>
                            )}
                            {task.status === 'approved' && (
                              <>
                                <button
                                  onClick={() => startTask(task, parent.title)}
                                  className="text-[10px] bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded font-medium"
                                >
                                  Start Task
                                </button>
                                <button
                                  onClick={() => triggerFocusTimer(task, parent.title)}
                                  className="text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white px-2 py-0.5 rounded font-medium"
                                >
                                  ⏱ 25m Focus
                                </button>
                              </>
                            )}
                            {task.status === 'in_progress' && (
                              <>
                                <button
                                  onClick={() => completeTask(task.id, parent)}
                                  className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 rounded font-medium"
                                >
                                  Complete ✓
                                </button>
                                <button
                                  onClick={() => blockTask(task.id)}
                                  className="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded font-medium"
                                >
                                  Block 🚧
                                </button>
                              </>
                            )}
                            {task.status === 'blocked' && (
                              <button
                                onClick={() => startTask(task, parent.title)}
                                className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded font-medium"
                              >
                                Unblock
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* CARDS VIEW */}
          {viewMode === 'cards' && (
            <div className="space-y-4">
              {displayedCommitments.map((c) => {
                const isHundredPercent = c.commitment_score === 100 && c.total_count > 0
                return (
                  <div
                    key={c.id}
                    className={`bg-[#161b22] rounded-2xl border ${
                      isHundredPercent ? 'border-emerald-500/50 shadow-emerald-500/10' : 'border-zinc-800'
                    } p-6 shadow-xl transition-all relative overflow-hidden`}
                  >
                    {/* Header: Title, Tags, Risk Badge & Delete */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-zinc-100">{c.title}</h3>

                          {/* Risk Score Badge */}
                          {c.risk && (
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                                c.risk.level === 'High'
                                  ? 'bg-rose-950/80 text-rose-300 border-rose-700'
                                  : c.risk.level === 'Medium'
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                              }`}
                              title={c.risk.factors.join(', ')}
                            >
                              <span>Risk: {c.risk.score} ({c.risk.level})</span>
                            </span>
                          )}

                          {/* Certificate Badge when 100% */}
                          {isHundredPercent && (
                            <button
                              onClick={() => setCertCommitment(c)}
                              className="text-[11px] font-bold bg-gradient-to-r from-amber-500 to-yellow-400 text-black px-2.5 py-0.5 rounded-full shadow hover:scale-105 transition flex items-center gap-1 cursor-pointer"
                            >
                              🏆 Certificate Ready
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-zinc-400">
                          {c.description ? `${c.description} • ` : ''}
                          {c.deadline ? `Due ${c.deadline}` : 'No deadline set'}
                        </p>

                        {/* Commitment Tags */}
                        {c.tags && c.tags.length > 0 && (
                          <div className="flex items-center gap-1 pt-1">
                            {c.tags.map((t) => (
                              <span key={t} className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => deleteCommitment(c.id)}
                          className="text-xs text-zinc-400 hover:text-rose-400 px-2.5 py-1 rounded-lg border border-zinc-800 hover:border-rose-800 bg-zinc-900/50 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar & Score */}
                    <div className="mt-4 bg-zinc-900/70 p-3 rounded-xl border border-zinc-800/80">
                      <div className="flex justify-between items-center text-xs mb-1.5 font-medium">
                        <span className="text-zinc-300">Commitment Score</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {c.commitment_score}% ({c.done_count}/{c.total_count} tasks done)
                        </span>
                      </div>
                      <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 rounded-full ${
                            c.commitment_score === 100
                              ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                              : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                          }`}
                          style={{ width: `${c.commitment_score}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Task List with 3 Bedrock fields: reasoning, ai_insight, next_action */}
                    <div className="mt-4 space-y-2.5">
                      {c.tasks.map((t) => {
                        const isFocusActive = focusTask?.id === t.id
                        return (
                          <div
                            key={t.id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              isFocusActive
                                ? 'bg-cyan-950/20 border-cyan-500/60 shadow-lg shadow-cyan-900/20'
                                : t.status === 'done'
                                ? 'bg-emerald-950/10 border-emerald-900/40'
                                : t.status === 'blocked'
                                ? 'bg-rose-950/10 border-rose-900/40'
                                : 'bg-[#0d1117] border-zinc-800'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                                    t.status === 'done'
                                      ? 'bg-emerald-400'
                                      : t.status === 'in_progress'
                                      ? 'bg-purple-400 animate-pulse'
                                      : t.status === 'approved'
                                      ? 'bg-blue-400'
                                      : t.status === 'blocked'
                                      ? 'bg-rose-500'
                                      : 'bg-amber-400'
                                  }`}
                                ></span>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-semibold ${t.status === 'done' ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
                                      {t.title}
                                    </span>
                                    <span
                                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                                        t.status === 'done'
                                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                          : t.status === 'in_progress'
                                          ? 'bg-purple-950 text-purple-300 border-purple-800'
                                          : t.status === 'approved'
                                          ? 'bg-blue-950 text-blue-300 border-blue-800'
                                          : t.status === 'blocked'
                                          ? 'bg-rose-950 text-rose-300 border-rose-800'
                                          : 'bg-amber-950 text-amber-300 border-amber-800'
                                      }`}
                                    >
                                      {t.status}
                                    </span>
                                  </div>

                                  {/* Blocker reason banner if blocked */}
                                  {t.status === 'blocked' && t.blocker_reason && (
                                    <div className="text-[11px] text-rose-300 bg-rose-950/60 border border-rose-800/80 px-2 py-0.5 rounded mt-1">
                                      🚧 Blocker: {t.blocker_reason}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* State Machine Transition Action Buttons */}
                              <div className="flex items-center gap-1.5 self-end sm:self-auto flex-wrap">
                                {t.status === 'proposed' && (
                                  <button
                                    onClick={() => approveTask(t.id)}
                                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1 rounded-lg transition"
                                  >
                                    Approve
                                  </button>
                                )}

                                {t.status === 'approved' && (
                                  <>
                                    <button
                                      onClick={() => startTask(t, c.title)}
                                      className="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium px-3 py-1 rounded-lg transition"
                                    >
                                      Start
                                    </button>
                                    <button
                                      onClick={() => triggerFocusTimer(t, c.title)}
                                      className="text-xs bg-cyan-700 hover:bg-cyan-600 text-white font-medium px-2.5 py-1 rounded-lg transition flex items-center gap-1"
                                      title="Start 25-minute Pomodoro focus block"
                                    >
                                      ⏱ Focus
                                    </button>
                                  </>
                                )}

                                {t.status === 'in_progress' && (
                                  <>
                                    <button
                                      onClick={() => completeTask(t.id, c)}
                                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1 rounded-lg transition"
                                    >
                                      Done ✓
                                    </button>
                                    <button
                                      onClick={() => triggerFocusTimer(t, c.title)}
                                      className="text-xs bg-cyan-800 hover:bg-cyan-700 text-cyan-200 font-medium px-2 py-1 rounded-lg transition"
                                    >
                                      ⏱
                                    </button>
                                    <button
                                      onClick={() => blockTask(t.id)}
                                      className="text-xs bg-zinc-800 hover:bg-rose-950 text-zinc-300 hover:text-rose-200 border border-zinc-700 px-2 py-1 rounded-lg transition"
                                      title="Mark task as blocked"
                                    >
                                      🚧
                                    </button>
                                  </>
                                )}

                                {t.status === 'blocked' && (
                                  <button
                                    onClick={() => startTask(t, c.title)}
                                    className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium px-3 py-1 rounded-lg transition"
                                  >
                                    Unblock
                                  </button>
                                )}

                                {t.status !== 'done' && t.status !== 'in_progress' && (
                                  <button
                                    onClick={() => completeTask(t.id, c)}
                                    className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded-lg transition border border-zinc-700"
                                    title="Quick Complete"
                                  >
                                    ✓
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* 3 Bedrock Simulation Insight Fields */}
                            {(t.reasoning || t.ai_insight || t.next_action) && (
                              <div className="mt-3 pt-2.5 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                                {t.reasoning && (
                                  <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/70">
                                    <span className="text-cyan-400 font-bold block mb-0.5">🧠 Reasoning</span>
                                    <span className="text-zinc-300">{t.reasoning}</span>
                                  </div>
                                )}
                                {t.ai_insight && (
                                  <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/70">
                                    <span className="text-purple-400 font-bold block mb-0.5">⚡ AI Insight (Why this next?)</span>
                                    <span className="text-zinc-300">{t.ai_insight}</span>
                                  </div>
                                )}
                                {t.next_action && (
                                  <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/70">
                                    <span className="text-emerald-400 font-bold block mb-0.5">🚀 Next Action</span>
                                    <span className="text-zinc-300">{t.next_action}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Commitment Footer: Bulk Approve & State Machine Notes */}
                    <div className="mt-4 pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveAllProposed(c)}
                          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium px-3.5 py-1.5 rounded-lg border border-zinc-700 transition"
                        >
                          Approve All Proposed Tasks
                        </button>
                        {isHundredPercent && (
                          <button
                            onClick={() => setCertCommitment(c)}
                            className="text-xs bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold px-3 py-1.5 rounded-lg transition"
                          >
                            View Certificate 🏆
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        MCP Policy: proposed actions require explicit user approval before execution
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* 100% COMPLETION CERTIFICATE MODAL */}
      {certCommitment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md grid place-items-center p-4">
          <div className="bg-gradient-to-b from-[#1c2128] to-[#0d1117] border-2 border-amber-500/80 rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl shadow-amber-500/20 relative animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-amber-400 to-yellow-200 rounded-full grid place-items-center text-3xl shadow-lg shadow-amber-500/40">
              🏆
            </div>
            <span className="text-xs font-mono tracking-widest text-amber-400 uppercase font-semibold">
              OFFICIAL CERTIFICATE OF COMPLETION
            </span>
            <h2 className="text-2xl font-black text-white mt-1 mb-2">Commitment Fulfilled!</h2>
            <p className="text-sm text-zinc-300 mb-6">
              This acknowledges that the commitment <span className="font-bold text-amber-300">"{certCommitment.title}"</span> has reached 100% completion across all decomposed tasks.
            </p>

            <div className="bg-zinc-900/90 rounded-2xl border border-zinc-800 p-4 text-left space-y-2 mb-6 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Commitment ID:</span>
                <span className="text-zinc-300">{certCommitment.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Tasks Completed:</span>
                <span className="text-emerald-400 font-bold">{certCommitment.total_count} / {certCommitment.total_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Final Score:</span>
                <span className="text-amber-400 font-bold">100% Mastered</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Verified By:</span>
                <span className="text-cyan-400">CommitPilot AI MCP Engine</span>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.print()}
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-5 py-2.5 rounded-xl shadow transition"
              >
                Print / Save Certificate
              </button>
              <button
                onClick={() => setCertCommitment(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs px-5 py-2.5 rounded-xl border border-zinc-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-[#161b22] py-6 mt-12 text-center text-xs text-zinc-400">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            Built with React • TypeScript • Tailwind CSS • Python • FastAPI • Model Context Protocol • SQLite
          </div>
          <div className="text-zinc-400 font-mono text-[11px]">
            CommitPilot AI V3 Ultimate • AWS Bedrock Ready
          </div>
        </div>
      </footer>
    </div>
  )
}
