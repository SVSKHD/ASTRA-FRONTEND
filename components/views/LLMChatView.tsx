import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Bot,
  History,
  Plus,
  MessageSquare,
  ChevronDown,
  Zap,
  Paperclip,
  X,
  StickyNote,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotes } from "@/hooks/useNotes";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { dumps } from "@zenoaihq/tson";

type Model = "gemini" | "chatgpt";

interface ChatSession {
  id: string;
  title: string;
  date: string;
}

interface Message {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: number;
  attachment?: {
    name: string;
    size: number;
    type: string;
  };
}

const MOCK_HISTORY: ChatSession[] = [
  { id: "1", title: "Market Analysis Q3", date: "Today" },
  { id: "2", title: "Code Refactoring", date: "Yesterday" },
];

export const LLMChatView = () => {
  const [selectedModel, setSelectedModel] = useState<Model>("gemini");
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Internal Notes Integration
  const { notes, loading: notesLoading } = useNotes();
  const [isNotesPickerOpen, setIsNotesPickerOpen] = useState(false);

  // Initialize Gemini
  const genAI = useRef(
    new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI || ""),
  );

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAttachment(file);
    }
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAttachNote = (note: any) => {
    const noteContent = dumps(note);
    const file = new File(
      [noteContent],
      `${note.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.tson`,
      { type: "application/tson" },
    );
    setAttachment(file);
    setIsNotesPickerOpen(false);
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachment) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      text: input,
      timestamp: Date.now(),
      attachment: attachment
        ? {
            name: attachment.name,
            size: attachment.size,
            type: attachment.type,
          }
        : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      let prompt = input;
      if (attachment) {
        const text = await attachment.text();
        prompt = `${input}\n\n[Attached Context: ${attachment.name}]\n${text}`;
        handleRemoveAttachment();
      }

      if (selectedModel === "gemini") {
        const model = genAI.current.getGenerativeModel({
          model: "gemini-2.5-flash",
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "model",
          text: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, botMessage]);
      } else {
        setTimeout(() => {
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "model",
            text: "ChatGPT integration is coming soon.",
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, botMessage]);
          setIsLoading(false);
        }, 1000);
      }
    } catch (error) {
      console.error("Error generating response:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: "Sorry, I encountered an error processing your request.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-[calc(100vh-250px)] w-full flex gap-6">
      {/* Sidebar - History */}
      <div className="hidden md:flex w-64 flex-col gap-4">
        <button
          onClick={() => setMessages([])}
          className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-2 text-white/80 hover:text-white transition-all font-medium active:scale-95 duration-200"
        >
          <Plus size={18} />
          <span>New Chat</span>
        </button>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
          <div className="space-y-2">
            <div className="px-2 text-xs font-semibold text-white/30 uppercase tracking-wider">
              Recent
            </div>
            {MOCK_HISTORY.map((chat) => (
              <button
                key={chat.id}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 text-white/60 hover:text-white transition-colors flex items-center gap-3 group"
              >
                <MessageSquare
                  size={16}
                  className="text-white/30 group-hover:text-white/70 transition-colors"
                />
                <span className="truncate text-sm">{chat.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md overflow-hidden flex flex-col relative w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 z-0" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-4 border-b border-white/5 bg-white/5 backdrop-blur-xl">
          <div className="relative">
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-sm font-medium text-white transition-all"
            >
              <span className="flex items-center gap-2">
                {selectedModel === "gemini" ? (
                  <>
                    <Sparkles size={14} className="text-blue-400" />
                    <span>Gemini 1.5 Flash</span>
                  </>
                ) : (
                  <>
                    <Zap size={14} className="text-green-400" />
                    <span>ChatGPT 4o</span>
                  </>
                )}
              </span>
              <ChevronDown
                size={14}
                className={`text-white/50 transition-transform ${isModelDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {isModelDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 w-48 bg-[#111] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 ring-1 ring-white/10"
                >
                  <button
                    onClick={() => {
                      setSelectedModel("gemini");
                      setIsModelDropdownOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors"
                  >
                    <Sparkles size={16} className="text-blue-400" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        Gemini 1.5 Flash
                      </span>
                      <span className="text-[10px] text-white/40">
                        Google DeepMind
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedModel("chatgpt");
                      setIsModelDropdownOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors border-t border-white/5"
                  >
                    <Zap size={16} className="text-green-400" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        ChatGPT 4o
                      </span>
                      <span className="text-[10px] text-white/40">OpenAI</span>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-2 py-1 rounded bg-white/5 border border-white/5 text-[10px] text-white/30 font-mono">
              {selectedModel === "gemini" ? "1M Context" : "128k Context"}
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto z-10 space-y-6 p-6 scroll-smooth custom-scrollbar">
          {messages.length === 0 ? (
            /* Welcome Message */
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-60">
              <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center rotate-3">
                {selectedModel === "gemini" ? (
                  <Sparkles size={32} className="text-blue-400" />
                ) : (
                  <Zap size={32} className="text-green-400" />
                )}
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-xl font-semibold text-white">
                  How can {selectedModel === "gemini" ? "Gemini" : "ChatGPT"}{" "}
                  help?
                </h3>
                <p className="text-sm text-white/50">
                  Ask for market analysis, trade summaries, or code assistance.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-sm"
                        : "bg-white/5 border border-white/10 text-white/90 rounded-tl-sm"
                    }`}
                  >
                    {msg.attachment && (
                      <div className="mb-2 p-2 bg-black/20 rounded-lg border border-white/5 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                          <Paperclip size={14} className="text-white/60" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium text-white truncate">
                            {msg.attachment.name}
                          </span>
                          <span className="text-[10px] text-white/40">
                            {(msg.attachment.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>
                    )}
                    {msg.role === "user" ? (
                      <div className="text-sm">{msg.text}</div>
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none text-sm">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0 leading-relaxed text-white/90">
                                {children}
                              </p>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc pl-4 mb-2 text-white/80 space-y-1">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal pl-4 mb-2 text-white/80 space-y-1">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="pl-1">{children}</li>
                            ),
                            h1: ({ children }) => (
                              <h1 className="text-lg font-bold text-white mb-2 mt-4 first:mt-0">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-base font-semibold text-white mb-2 mt-3">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-sm font-semibold text-white mb-1 mt-2">
                                {children}
                              </h3>
                            ),
                            code: ({ children, className }) => {
                              const isInline = !className;
                              return isInline ? (
                                <code className="bg-white/10 px-1 py-0.5 rounded text-xs font-mono text-blue-200">
                                  {children}
                                </code>
                              ) : (
                                <div className="bg-[#111] rounded-lg p-3 my-2 border border-white/10 overflow-x-auto text-xs font-mono text-gray-300">
                                  {children}
                                </div>
                              );
                            },
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-3 rounded-lg border border-white/10">
                                <table className="w-full text-left border-collapse">
                                  {children}
                                </table>
                              </div>
                            ),
                            thead: ({ children }) => (
                              <thead className="bg-white/5">{children}</thead>
                            ),
                            th: ({ children }) => (
                              <th className="px-3 py-2 text-xs font-semibold text-white border-b border-white/10">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-3 py-2 text-xs text-white/70 border-b border-white/5">
                                {children}
                              </td>
                            ),
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-2 border-blue-500 pl-3 my-2 text-white/60 italic">
                                {children}
                              </blockquote>
                            ),
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-sm flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce delay-75" />
                      <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce delay-150" />
                    </div>
                    <span className="text-xs text-white/50 animate-pulse">
                      Analyzing your question...
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 z-10 relative">
          {/* Attachment Preview */}
          <AnimatePresence>
            {attachment && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full left-6 mb-2 flex items-center gap-2 px-3 py-2 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-lg"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <Paperclip size={14} className="text-white/60" />
                </div>
                <div className="flex flex-col max-w-[200px]">
                  <span className="text-xs font-medium text-white truncate">
                    {attachment.name}
                  </span>
                  <span className="text-[10px] text-white/40">
                    {(attachment.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  onClick={handleRemoveAttachment}
                  className="p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors ml-2"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}

            {/* Notes Picker Popover */}
            {isNotesPickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full left-6 mb-2 w-64 max-h-60 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-xl overflow-hidden flex flex-col z-50"
              >
                <div className="px-3 py-2 border-b border-white/5 text-xs font-semibold text-white/50 uppercase">
                  Select Internal Note
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                  {notesLoading ? (
                    <div className="p-4 text-center text-xs text-white/30">
                      Loading...
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="p-4 text-center text-xs text-white/30">
                      No notes found
                    </div>
                  ) : (
                    notes.map((note) => (
                      <button
                        key={note.id}
                        onClick={() => handleAttachNote(note)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors text-xs truncate flex items-center gap-2"
                      >
                        <StickyNote
                          size={12}
                          className="flex-shrink-0 opacity-50"
                        />
                        <span className="truncate">{note.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />

            {/* File Input (Hidden) */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,application/json"
              className="hidden"
            />

            <div className="relative w-full bg-[#0A0A0A]/80 border border-white/10 rounded-xl flex items-center overflow-hidden transition-all focus-within:border-white/20">
              {/* Attachment Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="pl-3 pr-2 py-4 text-white/40 hover:text-white transition-colors"
                title="Attach JSON file"
              >
                <Paperclip size={20} />
              </button>

              {/* Note Button */}
              <button
                onClick={() => setIsNotesPickerOpen(!isNotesPickerOpen)}
                className="px-2 py-4 text-white/40 hover:text-white transition-colors"
                title="Attach Internal Note"
              >
                <StickyNote size={20} />
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${selectedModel === "gemini" ? "Gemini" : "ChatGPT"}...`}
                className="w-full bg-transparent border-none py-4 px-2 text-white placeholder-white/30 focus:outline-none focus:ring-0 font-medium"
              />

              <div className="pr-2">
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && !attachment) || isLoading}
                  className={`p-2 rounded-lg transition-all ${
                    input.trim() || attachment
                      ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25 rotate-0 scale-100"
                      : "bg-white/5 text-white/30 rotate-90 scale-90"
                  }`}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
