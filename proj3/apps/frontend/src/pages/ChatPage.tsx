import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  getConversation,
  listConversations,
  saveAnswerToKnowledge,
  streamChat,
} from "../lib/api";
import type { ChatAnswerSummary, Conversation, KnowledgeScope, Message } from "../types/chat";
import { KNOWLEDGE_SCOPES } from "../types/chat";
import { ConversationSidebar } from "../components/ConversationSidebar";
import { ChatMessage } from "../components/ChatMessage";
import { ChatComposer } from "../components/ChatComposer";

/** Local-only shape for the in-flight assistant reply. Not persisted to
 *  Message[] until the "done" event lands (or the user stops generation,
 *  in which case it's kept purely client-side -- the backend never wrote
 *  a row for it, since generation didn't finish). */
interface StreamingReply {
  content: string;
  stopped?: boolean;
}

let localIdCounter = 0;
function localId() {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

export function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(true);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<KnowledgeScope>(KNOWLEDGE_SCOPES[0]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState<StreamingReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    setConversationsLoading(true);
    return listConversations({ page: 1, pageSize: 50 })
      .then((res) => setConversations(res.items))
      .catch(() => {
        // Sidebar failing to load shouldn't block the composer -- the
        // person can still chat, they just won't see history yet.
      })
      .finally(() => setConversationsLoading(false));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingReply]);

  const selectConversation = useCallback((id: string) => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setStreamingReply(null);
    setActiveConversationId(id);
    setMessagesLoading(true);
    setError(null);
    getConversation(id)
      .then(({ conversation, messages: msgs }) => {
        setActiveConversation(conversation);
        setMessages(msgs);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not load this conversation.");
      })
      .finally(() => setMessagesLoading(false));
  }, []);

  const startNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setStreamingReply(null);
    setActiveConversationId(null);
    setActiveConversation(null);
    setMessages([]);
    setError(null);
  }, []);

  const handleSend = useCallback(() => {
    const question = draft.trim();
    if (!question || isStreaming) return;

    setDraft("");
    setError(null);

    const userMessage: Message = {
      id: localId(),
      conversationId: activeConversationId ?? "",
      role: "USER",
      content: question,
      sourceBadge: null,
      confidence: null,
      topSimilarity: null,
      knowledgeRefs: null,
      externalReason: null,
      savedToKnowledge: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    streamingContentRef.current = "";
    setStreamingReply({ content: "" });
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    streamChat(
      {
        question,
        conversationId: activeConversationId ?? undefined,
        knowledgeScope: scope === "All Topics" ? undefined : scope,
      },
      {
        onDelta: (delta) => {
          streamingContentRef.current += delta;
          setStreamingReply({ content: streamingContentRef.current });
        },
        onDone: (summary: ChatAnswerSummary) => {
          const assistantMessage: Message = {
            id: summary.messageId,
            conversationId: summary.conversationId,
            role: "ASSISTANT",
            content: streamingContentRef.current,
            sourceBadge: summary.sourceBadge,
            confidence: summary.confidence,
            topSimilarity: summary.topSimilarity,
            knowledgeRefs: summary.sourcesUsed,
            externalReason: summary.externalReason,
            savedToKnowledge: false,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setStreamingReply(null);
          setIsStreaming(false);
          if (!activeConversationId) {
            setActiveConversationId(summary.conversationId);
            setActiveConversation({
              id: summary.conversationId,
              userId: null,
              title: question.slice(0, 60),
              knowledgeScope: scope === "All Topics" ? null : scope,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
          loadConversations();
        },
        onError: (message) => {
          setError(message);
          setStreamingReply(null);
          setIsStreaming(false);
        },
      },
      controller.signal
    );
  }, [draft, isStreaming, activeConversationId, scope, loadConversations]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    if (streamingContentRef.current) {
      setStreamingReply({ content: streamingContentRef.current, stopped: true });
      // Keep the stopped partial reply visible, but don't leave it wired
      // to further updates -- fold it into local message state so the
      // scroll/empty-state logic below treats it like any other bubble.
      setMessages((prev) => [
        ...prev,
        {
          id: localId(),
          conversationId: activeConversationId ?? "",
          role: "ASSISTANT",
          content: streamingContentRef.current,
          sourceBadge: null,
          confidence: null,
          topSimilarity: null,
          knowledgeRefs: null,
          externalReason: "Generation was stopped before it finished.",
          savedToKnowledge: false,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    setStreamingReply(null);
  }, [activeConversationId]);

  const handleSaveToKnowledge = useCallback((messageId: string) => {
    setSavingMessageId(messageId);
    saveAnswerToKnowledge(messageId)
      .then(() => {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, savedToKnowledge: true } : m)));
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not save this answer.");
      })
      .finally(() => setSavingMessageId(null));
  }, []);

  const showEmptyState = !messagesLoading && messages.length === 0 && !streamingReply;

  return (
    <div className="mx-auto flex h-[calc(100vh-56px)] max-w-6xl flex-col sm:flex-row">
      <ConversationSidebar
        conversations={conversations}
        loading={conversationsLoading}
        activeConversationId={activeConversationId}
        onSelect={selectConversation}
        onNewConversation={startNewConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {error && (
            <div className="mb-4 rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-3 font-body text-sm text-[var(--color-fail)]">
              {error}
            </div>
          )}

          {messagesLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-16 w-2/3 animate-pulse rounded-lg bg-[var(--color-paper-raised)] ${
                    i % 2 ? "ml-auto" : ""
                  }`}
                />
              ))}
            </div>
          )}

          {showEmptyState && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="font-display text-lg text-[var(--color-ink)]">Ask your knowledge base anything</p>
              <p className="max-w-sm font-body text-sm text-[var(--color-ink-soft)]">
                Questions are answered from your processed lectures first. If nothing relevant is found, the
                assistant falls back to a general AI answer that you can save into your library.
              </p>
            </div>
          )}

          {!messagesLoading && (
            <div className="space-y-4">
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  sourceBadge={m.sourceBadge}
                  confidence={m.confidence}
                  knowledgeRefs={m.knowledgeRefs}
                  externalReason={m.externalReason}
                  savedToKnowledge={m.savedToKnowledge}
                  onSaveToKnowledge={
                    m.sourceBadge === "EXTERNAL_AI" ? () => handleSaveToKnowledge(m.id) : undefined
                  }
                  saving={savingMessageId === m.id}
                />
              ))}

              {streamingReply && (
                <ChatMessage role="ASSISTANT" content={streamingReply.content} isStreaming />
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          scope={scope}
          onScopeChange={setScope}
          scopeLocked={activeConversationId ? activeConversation?.knowledgeScope ?? "All Topics" : null}
          disabled={messagesLoading}
        />
      </div>
    </div>
  );
}
