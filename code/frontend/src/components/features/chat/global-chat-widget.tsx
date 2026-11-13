"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { productService } from "@/services/product-service";
import { useWishlist } from "@/context/wishlist-context";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { aiService } from "@/services/ai-service";
import { useChat } from "@/context/chat-context";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

// Unified product type that works for both mock catalog & backend public search response
interface UnifiedProduct {
  id: number;
  name: string;
  pricePerDay: number;
  categoryName: string;
  primaryImageUrl: string | null;
  similarityScore?: number;
}

const mapToUnifiedProduct = (prod: any): UnifiedProduct => {
  return {
    id: prod.id,
    name: prod.name,
    pricePerDay: prod.pricePerDay,
    categoryName: prod.categoryName || prod.category?.name || "Khác",
    primaryImageUrl: prod.primaryImageUrl || prod.primaryImage || null,
    similarityScore: prod.similarityScore
  };
};

function MarkdownRenderer({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
      {parts.map((part, idx) => {
        if (part.startsWith("```")) {
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match ? match[1] : "";
          const code = match ? match[2] : part.slice(3, -3);

          return (
            <div
              key={idx}
              className="relative my-2 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-950 font-mono text-[10px] shadow-sm"
            >
              <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-900 bg-zinc-900 text-zinc-400">
                <span className="uppercase text-[8px] font-bold tracking-wider">{lang || "code"}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-violet-700 text-zinc-300 hover:text-white transition-all text-[8px] font-semibold cursor-pointer"
                >
                  Copy
                </button>
              </div>
              <pre className="p-2 overflow-x-auto text-zinc-250 leading-normal">
                <code>{code}</code>
              </pre>
            </div>
          );
        } else {
          const lines = part.split("\n");
          return (
            <div key={idx} className="space-y-0.5">
              {lines.map((line, lIdx) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("###")) {
                  return (
                    <h3 key={lIdx} className="text-xs font-extrabold text-violet-700 dark:text-violet-400 mt-2 mb-0.5">
                      {trimmed.replace("###", "").trim()}
                    </h3>
                  );
                }
                if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
                  return (
                    <li key={lIdx} className="ml-3 list-disc pl-0.5 py-0.5">
                      {trimmed.slice(1).trim()}
                    </li>
                  );
                }
                if (/^\d+\./.test(trimmed)) {
                  const matchDigit = trimmed.match(/^(\d+)\./);
                  const digitLength = matchDigit ? matchDigit[0].length : 2;
                  return (
                    <li key={lIdx} className="ml-3 list-decimal pl-0.5 py-0.5">
                      {trimmed.slice(digitLength).trim()}
                    </li>
                  );
                }
                if (trimmed === "") return <div key={lIdx} className="h-0.5" />;

                const boldParts = trimmed.split(/(\*\*.*?\*\*)/g);
                return (
                  <p key={lIdx} className="my-0.5">
                    {boldParts.map((bp, bpIdx) => {
                      if (bp.startsWith("**") && bp.endsWith("**")) {
                        return (
                          <strong key={bpIdx} className="font-extrabold text-zinc-900 dark:text-white">
                            {bp.slice(2, -2)}
                          </strong>
                        );
                      }
                      const codeParts = bp.split(/(\`.*?\`)/g);
                      return codeParts.map((cp, cpIdx) => {
                        if (cp.startsWith("`") && cp.endsWith("`")) {
                          return (
                            <code
                              key={cpIdx}
                              className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 px-1 py-0.5 rounded text-amber-600 dark:text-amber-400 font-mono text-[10px]"
                            >
                              {cp.slice(1, -1)}
                            </code>
                          );
                        }
                        return cp;
                      });
                    })}
                  </p>
                );
              })}
            </div>
          );
        }
      })}
    </div>
  );
}

interface ChatProductCardProps {
  prod: UnifiedProduct;
  rentalDays: number;
  onHeartClick: (e: React.MouseEvent, id: number, name: string) => void;
}

function ChatProductCard({ prod, rentalDays, onHeartClick }: ChatProductCardProps) {
  const { isFavorited } = useWishlist();
  const favorited = isFavorited(prod.id);
  const price = `${Number(prod.pricePerDay).toLocaleString("vi-VN")}đ`;
  const totalPrice = `${Number(prod.pricePerDay * rentalDays).toLocaleString("vi-VN")}đ`;

  return (
    <div className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 hover:border-violet-400 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all group shrink-0 w-full sm:w-[260px] relative">
      <button
        onClick={(e) => onHeartClick(e, prod.id, prod.name)}
        title={favorited ? "Bỏ yêu thích" : "Yêu thích"}
        className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-xs transition-colors cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill={favorited ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          strokeWidth={favorited ? 0 : 2}
          stroke="currentColor"
          className={`w-4 h-4 ${favorited ? "text-pink-500" : "text-white"}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
        </svg>
      </button>

      <div className="flex h-[80px]">
        <div className="w-[80px] shrink-0 bg-zinc-100 dark:bg-zinc-950 overflow-hidden relative">
          <img
            src={prod.primaryImageUrl || "https://placehold.co/200x200/e2e8f0/64748b?text=No+Image"}
            alt={prod.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
        <div className="flex-1 p-2 flex flex-col justify-between min-w-0">
          <div>
            <span className="text-[8px] font-bold tracking-wider uppercase text-violet-600 dark:text-violet-400 block truncate">
              {prod.categoryName}
            </span>
            <h4 className="font-extrabold text-[10px] text-zinc-900 dark:text-white leading-tight line-clamp-2 mt-0.5">
              {prod.name}
            </h4>
          </div>
          <div className="flex items-end justify-between mt-1">
            <span className="text-violet-700 dark:text-violet-400 font-black text-xs">
              {price}<span className="text-zinc-500 font-medium text-[9px]">/ngày</span>
            </span>
            {rentalDays > 1 && (
              <span className="text-zinc-500 text-[9px] font-medium">
                ∑ {totalPrice}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="bg-zinc-50 dark:bg-zinc-950 p-1.5 border-t border-zinc-150 dark:border-zinc-800 flex">
        <Link
          href={`/products/${prod.id}`}
          className="flex-1 text-center bg-violet-600 hover:bg-violet-700 text-white py-1 rounded text-[10px] font-bold shadow-sm transition-colors cursor-pointer"
        >
          Xem chi tiết & Đặt thuê
        </Link>
      </div>
    </div>
  );
}

export function GlobalChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "chat">("list");
  
  // AI State
  const [aiMessages, setAiMessages] = useState<Array<{ sender: "user" | "assistant"; text: string }>>([
    {
      sender: "assistant",
      text: "Xin chào! Tôi là Trợ lý AI thông minh của RentHub. Bạn đang tìm thuê đồ đi phượt, đồ công nghệ hay muốn tôi gợi ý sản phẩm phù hợp nào?"
    }
  ]);
  const [aiInputValue, setAiInputValue] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [aiConversationId, setAiConversationId] = useState<number | undefined>(undefined);
  const [availableProducts, setAvailableProducts] = useState<UnifiedProduct[]>([]);
  const [isListening, setIsListening] = useState(false);
  
  // User Chat Context
  const { user } = useAuth();
  const { toggleFavorite } = useWishlist();
  const { triggerToast } = useToast();
  const {
    conversations,
    activeConversationId,
    selectConversation,
    sendMessage,
    messages: userMessages,
    loadingMessages,
    loadMoreMessages,
    activeReferencedProduct,
    setActiveReferencedProduct,
    isOpen: contextIsOpen,
    closeChat
  } = useChat();

  const [typedMessage, setTypedMessage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userMessageEndRef = useRef<HTMLDivElement>(null);

  // Reset AI chat when user changes
  useEffect(() => {
    setAiConversationId(undefined);
    setAiMessages([
      {
        sender: "assistant",
        text: "Xin chào! Tôi là Trợ lý AI thông minh của RentHub. Bạn đang tìm thuê đồ đi phượt, đồ công nghệ hay muốn tôi gợi ý sản phẩm phù hợp nào?"
      }
    ]);
  }, [user?.id]);

  // Auto open from context (e.g. from product page "Chat với chủ đồ")
  useEffect(() => {
    if (contextIsOpen) {
      setIsOpen(true);
      setActiveTab("chat");
    }
  }, [contextIsOpen]);

  // Sync scroll
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [aiMessages, isAiTyping, userMessages]);

  useEffect(() => {
    if (userMessageEndRef.current) {
      userMessageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [userMessages]);

  // Init AI Products
  useEffect(() => {
    setMounted(true);
    productService.getPublicProducts({ size: 20 })
      .then(res => {
        if (res && res.content) {
          setAvailableProducts(res.content.map(mapToUnifiedProduct));
        }
      })
      .catch(console.error);
  }, []);

  // Fetch AI conversation history
  useEffect(() => {
    if (user && isOpen && !aiConversationId) {
      aiService.getConversations().then(res => {
        if (res && res.length > 0) {
          const lastConv = res[0];
          setAiConversationId(lastConv.id);
          aiService.getMessages(lastConv.id).then(msgs => {
            if (msgs && msgs.length > 0) {
              const formattedMsgs = msgs.map(m => ({
                sender: m.role === "model" ? "assistant" : "user",
                text: m.content
              })) as Array<{ sender: "user" | "assistant"; text: string }>;
              setAiMessages(formattedMsgs);
            }
          }).catch(console.error);
        }
      }).catch(console.error);
    }
  }, [user, isOpen, aiConversationId]);

  const handleSendAiMessage = async (textToSend?: string) => {
    const text = textToSend || aiInputValue.trim();
    if (!text) return;
    if (!textToSend) setAiInputValue("");
    setAiMessages((prev) => [...prev, { sender: "user", text }]);
    setIsAiTyping(true);

    try {
      const response = await aiService.chat({
        content: text,
        conversationId: aiConversationId
      });
      setAiConversationId(response.conversationId ?? undefined);
      setAiMessages((prev) => [...prev, { sender: "assistant", text: response.response }]);
      
      const regex = /\[PRODUCT:(\d+)\]/g;
      let match;
      const newIds = [];
      while ((match = regex.exec(response.response)) !== null) {
        newIds.push(parseInt(match[1], 10));
      }
      for (const id of newIds) {
        if (!availableProducts.find(p => p.id === id)) {
          productService.getPublicProductDetail(id).then(prod => {
            setAvailableProducts(prev => [...prev, mapToUnifiedProduct(prod)]);
          }).catch(console.error);
        }
      }
    } catch (err: any) {
      console.error("AI Error:", err);
      triggerToast(err.message || "Lỗi kết nối đến AI.");
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleSendUserMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedMessage.trim() || !activeConversationId) return;
    await sendMessage(typedMessage.trim());
    setTypedMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendUserMessage();
    }
  };

  const extractButtons = (text: string): { label: string; query: string }[] => {
    const regex = /\[BUTTON:(.*?)\|(.*?)\]/g;
    const buttons: { label: string; query: string }[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      buttons.push({ label: match[1], query: match[2] });
    }
    return buttons;
  };

  const cleanMessageText = (text: string): string => {
    let clean = text.replace(/\[PRODUCT:\d+\]/g, "");
    return clean.replace(/\[BUTTON:.*?\|.*?\]/g, "");
  };

  const extractProductIds = (text: string): number[] => {
    const regex = /\[PRODUCT:(\d+)\]/g;
    const ids: number[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      ids.push(parseInt(match[1], 10));
    }
    return ids;
  };

  const uploadImageToCloudinary = async (file: File): Promise<string> => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
    const apiSecret = process.env.NEXT_PUBLIC_CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret || cloudName === "YOUR_CLOUD_NAME") {
      return `https://picsum.photos/400/300?random=${Math.floor(Math.random() * 1000)}`;
    }

    const timestamp = Math.round(new Date().getTime() / 1000).toString();
    const stringToSign = `timestamp=${timestamp}${apiSecret}`;
    const buffer = new TextEncoder().encode(stringToSign);
    const hash = await crypto.subtle.digest("SHA-1", buffer);
    const signature = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp);
    formData.append("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Tải ảnh thất bại");
    const resData = await response.json();
    return resData.secure_url;
  };

  const handleAttachImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !activeConversationId) return;
    try {
      setUploadingImage(true);
      const url = await uploadImageToCloudinary(files[0]);
      await sendMessage(url, "IMAGE");
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!mounted) return null;

  const totalUnreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const renderList = () => (
    <div className="flex-1 overflow-y-auto bg-zinc-50 flex flex-col">
      <div className="p-4 border-b border-zinc-200 bg-white shadow-sm flex justify-between items-center z-10 sticky top-0">
        <h2 className="font-bold text-sm text-zinc-800 uppercase tracking-wider">Tin nhắn & Trợ lý</h2>
        <button onClick={() => { setIsOpen(false); closeChat(); }} className="text-zinc-400 hover:text-zinc-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-2 space-y-1 overflow-y-auto flex-1">
        <button
          onClick={() => { selectConversation(null as any); setActiveTab("chat"); }}
          className="w-full p-3 bg-white hover:bg-violet-50 rounded-xl border border-zinc-100 flex items-center gap-3 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-linear-to-tr from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0">
            AI
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-zinc-800">Trợ lý RentHub AI</h3>
            <p className="text-xs text-zinc-500 truncate">Hỏi tôi bất cứ điều gì!</p>
          </div>
        </button>
        {conversations.map((c) => (
          <button
            key={c.conversationId}
            onClick={() => { selectConversation(c.conversationId); setActiveTab("chat"); }}
            className="w-full p-3 bg-white hover:bg-zinc-50 rounded-xl border border-zinc-100 flex items-center gap-3 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center font-bold text-zinc-600 shrink-0">
              {c.otherUser.fullName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-0.5">
                <h3 className="font-bold text-sm text-zinc-800 truncate">{c.otherUser.fullName}</h3>
                <span className="text-[10px] text-zinc-400 font-medium">
                  {c.lastMessageTime ? new Date(c.lastMessageTime).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : ""}
                </span>
              </div>
              <p className="text-xs text-zinc-500 truncate">
                {c.lastMessageType === "PRODUCT" ? "📦 [Sản phẩm]" : c.lastMessageType === "IMAGE" ? "📷 [Hình ảnh]" : c.lastMessage || "Chưa có tin nhắn"}
              </p>
            </div>
            {c.unreadCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {c.unreadCount}
              </span>
            )}
          </button>
        ))}
        {conversations.length === 0 && (
          <div className="text-center py-8 text-xs text-zinc-400">Không có đoạn chat nào.</div>
        )}
      </div>
    </div>
  );

  const renderAiChat = () => (
    <div className="flex flex-col h-full bg-zinc-50">
      <div className="flex items-center justify-between bg-linear-to-r from-violet-700 to-indigo-900 text-white px-4 py-3 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveTab("list")} className="p-1 hover:bg-white/20 rounded cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm text-white">AI</div>
            <div>
              <h3 className="font-bold text-xs">Trợ lý RentHub AI</h3>
            </div>
          </div>
        </div>
        <button onClick={() => { setIsOpen(false); closeChat(); }} className="text-white hover:text-zinc-200">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {aiMessages.map((msg, i) => {
          const productIds = extractProductIds(msg.text);
          const buttons = extractButtons(msg.text);
          const cleanedText = cleanMessageText(msg.text);
          return (
            <div key={i} className={`flex gap-2 max-w-[85%] ${msg.sender === "user" ? "ml-auto flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${msg.sender === "user" ? "bg-violet-600 text-white" : "bg-white text-violet-600 shadow-sm"}`}>
                {msg.sender === "user" ? "👤" : "🧡"}
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-xs ${msg.sender === "user" ? "bg-violet-100 rounded-tr-none text-zinc-900" : "bg-white rounded-tl-none border border-zinc-100"}`}>
                  <MarkdownRenderer text={cleanedText} />
                  {buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-zinc-100">
                      {buttons.map((btn, bIdx) => (
                        <button key={bIdx} onClick={() => handleSendAiMessage(btn.query)} className="px-2 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded text-[10px] font-bold">
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {productIds.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {productIds.map((pId) => {
                      const matchedProduct = availableProducts.find((p) => p.id === pId);
                      if (!matchedProduct) return null;
                      return <ChatProductCard key={pId} prod={matchedProduct} rentalDays={2} onHeartClick={(e, id) => toggleFavorite(id)} />;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isAiTyping && (
          <div className="flex gap-2 max-w-[80%]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white text-violet-600 shadow-sm font-bold text-xs">🧡</div>
            <div className="p-3 bg-white rounded-2xl rounded-tl-none shadow-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-100" />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-200" />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-300" />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 bg-white border-t border-zinc-200 shadow-lg">
        <form onSubmit={(e) => { e.preventDefault(); handleSendAiMessage(); }} className="flex gap-2 items-center bg-zinc-100 rounded-full p-1 pr-2">
          <input
            type="text"
            value={aiInputValue}
            onChange={(e) => setAiInputValue(e.target.value)}
            placeholder="Hỏi AI điều gì đó..."
            className="flex-1 bg-transparent border-none outline-none px-3 text-sm"
          />
          <button type="submit" className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </form>
      </div>
    </div>
  );

  const renderUserChat = () => {
    const activeConv = conversations.find(c => c.conversationId === activeConversationId);
    if (!activeConv) return null;
    return (
      <div className="flex flex-col h-full bg-zinc-50">
        <div className="flex items-center justify-between bg-white px-4 py-3 shrink-0 shadow-sm border-b border-zinc-200 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveTab("list")} className="p-1 hover:bg-zinc-100 rounded cursor-pointer text-zinc-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center font-bold text-sm text-zinc-600">
                {activeConv.otherUser.fullName.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-xs text-zinc-800">{activeConv.otherUser.fullName}</h3>
                <span className="text-[10px] text-green-500 font-bold">Trực tuyến</span>
              </div>
            </div>
          </div>
          <button onClick={() => { setIsOpen(false); closeChat(); }} className="text-zinc-400 hover:text-zinc-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatContainerRef}>
          {userMessages.map(msg => {
            const isMe = msg.sender.id === (user as any)?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] flex flex-col space-y-1`}>
                  <div className={`p-3 rounded-2xl text-xs leading-relaxed ${isMe ? "bg-violet-600 text-white rounded-tr-none" : "bg-white text-zinc-800 rounded-tl-none border border-zinc-200 shadow-sm"}`}>
                    {msg.messageType === "PRODUCT" && msg.referencedProduct && (
                      <Link href={`/products/${msg.referencedProduct.id}`} className={`block p-2 mb-2 rounded-lg border ${isMe ? "bg-white/20 border-white/20" : "bg-zinc-50 border-zinc-200"} flex items-center gap-2`}>
                        <img src={msg.referencedProduct.primaryImage || "https://placehold.co/100x100"} alt="" className="w-10 h-10 rounded object-cover" />
                        <div>
                          <p className="font-bold text-[10px] truncate w-32">{msg.referencedProduct.name}</p>
                          <p className="text-[9px] mt-0.5">{msg.referencedProduct.pricePerDay.toLocaleString()}đ/ngày</p>
                        </div>
                      </Link>
                    )}
                    {msg.messageType === "IMAGE" ? (
                      <img src={msg.content} alt="" className="max-w-[150px] rounded-lg cursor-pointer" onClick={() => window.open(msg.content)} />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  <span className={`text-[9px] text-zinc-400 ${isMe ? "text-right" : "text-left"}`}>
                    {new Date(msg.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={userMessageEndRef} />
        </div>

        {activeReferencedProduct && (
          <div className="p-3 bg-zinc-100 border-t border-zinc-200 flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <img src={activeReferencedProduct.primaryImage || "https://placehold.co/100"} alt="" className="w-8 h-8 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-zinc-800 truncate">{activeReferencedProduct.name}</p>
                <p className="text-[10px] text-violet-600">{activeReferencedProduct.pricePerDay.toLocaleString()}đ</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { sendMessage("Tôi quan tâm sản phẩm này", "PRODUCT", activeReferencedProduct.id); setActiveReferencedProduct(null); }} className="px-2 py-1 bg-violet-600 text-white rounded font-bold">Gửi</button>
              <button onClick={() => setActiveReferencedProduct(null)} className="px-2 py-1 bg-zinc-200 text-zinc-600 rounded">Hủy</button>
            </div>
          </div>
        )}

        <div className="p-3 bg-white border-t border-zinc-200">
          <form onSubmit={handleSendUserMessage} className="flex items-end gap-2">
            <input type="file" ref={fileInputRef} onChange={handleAttachImage} className="hidden" accept="image/*" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 bg-zinc-100 text-zinc-500 rounded-lg hover:bg-zinc-200 transition-colors shrink-0">
              {uploadingImage ? <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
            </button>
            <textarea
              rows={1}
              value={typedMessage}
              onChange={(e) => setTypedMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn..."
              className="flex-1 bg-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
            />
            <button type="submit" disabled={!typedMessage.trim() || uploadingImage} className="p-2 bg-violet-600 text-white rounded-lg disabled:opacity-50 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end animate-bounce-in">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 ${isOpen ? "bg-zinc-800 text-white rotate-90" : "bg-linear-to-r from-violet-600 to-indigo-600 text-white"}`}
        >
          {isOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <div className="relative">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              {totalUnreadCount > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white animate-pulse">
                  {totalUnreadCount}
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] h-[520px] bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col font-sans animate-fade-in">
          {activeTab === "list" && renderList()}
          {activeTab === "chat" && (!activeConversationId ? renderAiChat() : renderUserChat())}
        </div>
      )}
    </>
  );
}
