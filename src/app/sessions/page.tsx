'use client';

import { useState, useMemo } from 'react';
import { MessageSquare, FolderOpen, Search, Clock, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useClaude, useSessionMessages } from '@/hooks/useClaude';
import type { ClaudeMessage } from '@/lib/claude-code';

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
}

function projectLabel(path: string) {
  return path.split('/').filter(Boolean).slice(-2).join('/');
}

export default function SessionsPage() {
  const { data, loading } = useClaude();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<{ projectId: string; sessionId: string } | null>(null);

  const { messages, loading: msgLoading } = useSessionMessages(
    selectedSession?.projectId ?? null,
    selectedSession?.sessionId ?? null
  );

  const allSessions = useMemo(() => {
    if (!data?.projects) return [];
    return data.projects
      .flatMap(p =>
        (p.sessions || []).map(s => ({
          projectId: p.id,
          projectPath: p.path,
          sessionId: s.id,
          lastActivity: s.lastActivity instanceof Date ? s.lastActivity.getTime() : Number(s.lastActivity),
        }))
      )
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allSessions;
    const q = search.toLowerCase();
    return allSessions.filter(s =>
      s.projectPath.toLowerCase().includes(q) || s.sessionId.toLowerCase().includes(q)
    );
  }, [allSessions, search]);

  const isSelected = (s: typeof allSessions[0]) =>
    selectedSession?.projectId === s.projectId && selectedSession?.sessionId === s.sessionId;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Session list */}
      <div className="w-96 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5" />
            Sessions
          </h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search sessions..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-secondary border border-border rounded-lg"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No sessions found</p>
          ) : (
            filtered.map(s => (
              <button
                key={`${s.projectId}-${s.sessionId}`}
                onClick={() => setSelectedSession(isSelected(s) ? null : { projectId: s.projectId, sessionId: s.sessionId })}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/50 transition-colors ${isSelected(s) ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <FolderOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate">{projectLabel(s.projectPath)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-foreground/80">{s.sessionId.slice(0, 16)}…</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="w-3 h-3" />
                    {formatDate(s.lastActivity)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Message panel */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {!selectedSession ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageSquare className="w-10 h-10 opacity-30" />
            <p className="text-sm">Select a session to view the conversation</p>
          </div>
        ) : msgLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading messages...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="mb-4 pb-4 border-b border-border">
              <p className="text-xs text-muted-foreground font-mono">{selectedSession.sessionId}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {projectLabel(allSessions.find(s => s.sessionId === selectedSession.sessionId)?.projectPath ?? '')}
              </p>
            </div>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No messages in this session</p>
            ) : (
              messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg as ClaudeMessage} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ClaudeMessage }) {
  const [open, setOpen] = useState(false);
  const isUser = msg.type === 'user';

  const textParts: string[] = [];
  const toolParts: string[] = [];
  const thinkParts: string[] = [];

  const blocks = Array.isArray(msg.content) ? msg.content : [msg.content];
  for (const b of blocks) {
    if (typeof b === 'string') { textParts.push(b); continue; }
    if (b.type === 'text' && b.text) textParts.push(b.text);
    if (b.type === 'thinking' && b.thinking) thinkParts.push(b.thinking);
    if (b.type === 'tool_use') toolParts.push((b as { type: string; name?: string }).name ?? 'tool');
    if (b.type === 'tool_result') toolParts.push('result');
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm ${isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
        {textParts.length > 0 && (
          <p className="whitespace-pre-wrap break-words">{textParts.join('\n')}</p>
        )}
        {toolParts.length > 0 && (
          <p className="text-xs opacity-60 mt-1">{toolParts.map(t => `⚙ ${t}`).join('  ')}</p>
        )}
        {thinkParts.length > 0 && (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs opacity-50 mt-1 flex items-center gap-1 hover:opacity-80"
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            thinking
          </button>
        )}
        {open && thinkParts.map((t, i) => (
          <p key={i} className="text-xs opacity-40 mt-1 whitespace-pre-wrap italic">{t}</p>
        ))}
      </div>
    </div>
  );
}
