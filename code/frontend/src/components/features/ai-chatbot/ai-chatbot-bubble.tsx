"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { productService } from "@/services/product-service";
import { useWishlist } from "@/context/wishlist-context";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { aiService } from "@/services/ai-service";

// Unified product type that works for both mock catalog & backend public search response
interface UnifiedProduct {
  id: number;
  name: string;
  pricePerDay: number;
  categoryName: string;
  primaryImageUrl: string | null;
  similarityScore?: number;
}

// Map any product representation to a UnifiedProduct
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

// --- Custom Markdown Renderer ---
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
                if (trimmed === "") {
                  return <div key={lIdx} className="h-0.5" />;
                }

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

// --- Product Card Component for Chat Bubbles ---
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

// --- Main Chatbot Component ---
export function AiChatbotBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Array<{ sender: "user" | "assistant"; text: string }>>([
    {
      sender: "assistant",
      text: "Xin chào! Tôi là Trợ lý AI thông minh của RentHub. Bạn đang tìm thuê đồ đi phượt, đồ công nghệ hay muốn tôi gợi ý sản phẩm phù hợp nào?"
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { toggleFavorite } = useWishlist();
  const { triggerToast } = useToast();
  const { user } = useAuth();

  const [availableProducts, setAvailableProducts] = useState<UnifiedProduct[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>(undefined);

  // Rental calculator states
  const [calcExpanded, setCalcExpanded] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split("T")[0];
  });
  const [rentalDays, setRentalDays] = useState(2);

  // Floating Hearts Animation State
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  const [suggestionChips, setSuggestionChips] = useState([
    "📷 Thuê Máy ảnh & Flycam",
    "🎵 Thuê Loa Bluetooth",
    "🏕️ Đồ dùng cắm trại"
  ]);

  useEffect(() => {
    setMounted(true);
    // Fetch a base pool of popular products
    productService.getPublicProducts({ size: 20 })
      .then(res => {
        if (res && res.content) {
          setAvailableProducts(res.content.map(mapToUnifiedProduct));
        }
      })
      .catch(console.error);
  }, []);

  // Reset AI chat when user changes
  useEffect(() => {
    setConversationId(undefined);
    setMessages([
      {
        sender: "assistant",
        text: "Xin chào! Tôi là Trợ lý AI thông minh của RentHub. Bạn đang tìm thuê đồ đi phượt, đồ công nghệ hay muốn tôi gợi ý sản phẩm phù hợp nào?"
      }
    ]);
  }, [user?.id]);

  useEffect(() => {
    if (user && isOpen && !conversationId) {
      aiService.getConversations().then(res => {
        if (res && res.length > 0) {
          // Assume the first one is the most recent active conversation
          const lastConv = res[0];
          setConversationId(lastConv.id);
          aiService.getMessages(lastConv.id).then(msgs => {
            if (msgs && msgs.length > 0) {
              const formattedMsgs = msgs.map(m => ({
                sender: m.role === "model" ? "assistant" : "user",
                text: m.content
              })) as Array<{ sender: "user" | "assistant"; text: string }>;
              setMessages(formattedMsgs);
            }
          }).catch(console.error);
        }
      }).catch(console.error);
    }
  }, [user, isOpen, conversationId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    setRentalDays(diffDays > 0 ? diffDays : 1);
  }, [startDate, endDate]);

  const handleWishlistToggle = (e: React.MouseEvent, id: number, name: string) => {
    e.stopPropagation();
    toggleFavorite(id);
    const rect = (e.target as Element).getBoundingClientRect();
    const newHeart = { id: Date.now(), x: rect.left + rect.width / 2, y: rect.top };
    setHearts((prev) => [...prev, newHeart]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
    }, 1000);
  };

  const toggleSpeechListening = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      triggerToast("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      handleSendMessage(transcript);
    };
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
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

  const cleanMessageText = (text: string): string => {
    let clean = text.replace(/\[PRODUCT:\d+\]/g, "");
    return clean.replace(/\[BUTTON:.*?\|.*?\]/g, "");
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

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputValue.trim();
    if (!text) return;

    if (!textToSend) setInputValue("");
    setMessages((prev) => [...prev, { sender: "user", text }]);
    setIsTyping(true);

    try {
      const response = await aiService.chat({
        content: text,
        conversationId: conversationId
      });
      
      setConversationId(response.conversationId ?? undefined);
      
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: response.response
        }
      ]);

      // If response has new product IDs, fetch them
      const newIds = extractProductIds(response.response);
      for (const id of newIds) {
        if (!availableProducts.find(p => p.id === id)) {
          productService.getPublicProductDetail(id).then(prod => {
            setAvailableProducts(prev => [...prev, mapToUnifiedProduct(prod)]);
          }).catch(console.error);
        }
      }
    } catch (err: any) {
      console.error("AI Error:", err);
      triggerToast(err.message || "Lỗi kết nối đến AI. Vui lòng thử lại sau.");
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: "Hệ thống AI hiện đang bận hoặc gặp lỗi, vui lòng thử lại sau."
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Floating Particles Overlay */}
      {hearts.map((h) => (
        <span
          key={h.id}
          className="fixed text-xl pointer-events-none select-none z-55"
          style={{
            left: h.x,
            top: h.y,
            transform: "translate(-50%, -50%)",
            animation: "floatUp 1s ease-out forwards"
          }}
        >
          ❤️
        </span>
      ))}

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes floatUp {
            0% { transform: translate(-50%, -50%) translateY(0) scale(1); opacity: 1; }
            100% { transform: translate(-50%, -50%) translateY(-60px) scale(1.6); opacity: 0; }
          }
        `
      }} />

      {/* Floating Bubble Button */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setCalcExpanded(false);
          }}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform cursor-pointer hover:scale-105 active:scale-95 relative ${
            isOpen
              ? "bg-zinc-800 text-white rotate-90"
              : "bg-linear-to-r from-violet-600 to-indigo-700 text-white"
          }`}
          title="Trợ lý RentHub AI"
        >
          {isOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <div className="relative">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500"></span>
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Expandable Chat Card Widget */}
      {isOpen && (
        <div className="fixed bottom-22 right-6 z-40 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-[360px] sm:w-[380px] h-[520px] shadow-2xl flex flex-col overflow-hidden animate-slideUp font-sans">
          
          {/* Header Panel */}
          <div className="flex items-center justify-between bg-linear-to-r from-violet-700 to-indigo-900 text-white px-4 py-3 shrink-0 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-black border border-white/20">
                AI
              </div>
              <div>
                <h3 className="font-extrabold text-xs">Trợ lý RentHub AI</h3>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-white transition-colors text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Message Stream */}
          <div ref={chatContainerRef} className="flex-1 bg-white dark:bg-zinc-950 p-3 overflow-y-auto space-y-3 shadow-inner">
            {messages.map((msg, i) => {
              const productIds = extractProductIds(msg.text);
              const buttons = extractButtons(msg.text);
              const cleanedText = cleanMessageText(msg.text);

              return (
                <div
                  key={i}
                  className={`flex gap-2.5 max-w-[85%] animate-fadeIn ${
                    msg.sender === "user" ? "ml-auto flex-row-reverse" : ""
                  }`}
                >
                  <div
                    className={`w-7.5 h-7.5 rounded-full flex items-center justify-center shrink-0 font-bold shadow-sm text-xs ${
                      msg.sender === "user"
                        ? "bg-violet-600 text-white"
                        : "bg-zinc-100 dark:bg-zinc-800 text-violet-600 dark:text-violet-400 border border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    {msg.sender === "user" ? "👤" : "🧡"}
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div
                      className={`py-2 px-3 rounded-xl border text-xs leading-normal shadow-xs relative ${
                        msg.sender === "user"
                          ? "bg-violet-50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900 rounded-tr-none text-zinc-900 dark:text-zinc-100"
                          : "bg-zinc-50/50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-tl-none border-l-4 border-l-orange-500"
                      }`}
                    >
                      <MarkdownRenderer text={cleanedText} />
                      
                      {/* Interactive Buttons */}
                      {buttons.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-zinc-150 dark:border-zinc-800/60">
                          {buttons.map((btn, bIdx) => (
                            <button
                              key={bIdx}
                              onClick={() => handleSendMessage(btn.query)}
                              className="px-2 py-0.5 bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white dark:bg-violet-950/30 dark:hover:bg-violet-500 rounded border border-violet-200/50 dark:border-violet-850 text-[9px] font-bold cursor-pointer transition-all"
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Inline product recommendations cards grid */}
                    {productIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {productIds.map((pId) => {
                          const matchedProduct = availableProducts.find((p) => p.id === pId);
                          if (!matchedProduct) return null;

                          return (
                            <ChatProductCard
                              key={pId}
                              prod={matchedProduct}
                              rentalDays={rentalDays}
                              onHeartClick={handleWishlistToggle}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="flex gap-2 max-w-[80%]">
                <div className="w-7.5 h-7.5 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-violet-600 shrink-0 font-bold shadow-xs">
                  🧡
                </div>
                <div className="py-2 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-850 bg-zinc-50/50 dark:bg-zinc-900 rounded-tl-none flex items-center gap-1">
                  <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce delay-100" />
                  <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce delay-200" />
                  <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce delay-300" />
                </div>
              </div>
            )}
          </div>

          {/* Interactive Rental Date Cost Calculator Bar */}
          <div className="bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-150 dark:border-zinc-800 px-3 py-1.5 shrink-0 select-none">
            <div className="flex justify-between items-center text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
              <span className="flex items-center gap-1">📅 Bộ tính giá thuê: <span className="text-violet-600 font-extrabold">{rentalDays} ngày</span></span>
              <button
                onClick={() => setCalcExpanded(!calcExpanded)}
                className="text-[9px] text-violet-600 hover:underline cursor-pointer"
              >
                {calcExpanded ? "Ẩn chọn ngày" : "Chọn ngày nhận/trả"}
              </button>
            </div>
            {calcExpanded && (
              <div className="grid grid-cols-2 gap-2 mt-1.5 text-[9px] animate-slideDown">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] font-bold text-zinc-400 uppercase">Ngày nhận</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded text-[10px] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[8px] font-bold text-zinc-400 uppercase">Ngày trả</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded text-[10px] outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Input Panel */}
          <div className="bg-white dark:bg-zinc-900 border-t border-zinc-150 dark:border-zinc-800 p-3 shadow-md shrink-0">
            <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
              {suggestionChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(chip.slice(2).trim())} // strip emoji
                  className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-400 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap cursor-pointer transition-colors"
                >
                  {chip}
             </button>
              ))}
            </div>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex gap-1.5 items-center"
            >
              {/* Voice wave visualizer */}
              {isListening ? (
                <div className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-violet-500 rounded-lg px-3 py-1.5 flex items-center justify-between text-[10px] text-violet-600 font-bold animate-pulse">
                  <span>🎤 Đang lắng nghe...</span>
                  <div className="flex items-center gap-0.5 h-4">
                    <span className="w-0.5 h-2.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <span className="w-0.5 h-3.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                    <span className="w-0.5 h-2.5 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: "0.5s" }} />
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Hỏi thuê món đồ gì hôm nay?..."
                  className="flex-1 bg-zinc-55 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              )}

              {/* Mic Speech recognition */}
              <button
                type="button"
                onClick={toggleSpeechListening}
                className={`rounded-lg p-2 cursor-pointer shadow-xs transition-all flex items-center justify-center shrink-0 border text-xs ${
                  isListening
                    ? "bg-red-500 border-red-500 text-white animate-pulse"
                    : "bg-zinc-100 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 text-zinc-600 hover:bg-zinc-200"
                }`}
                title={isListening ? "Dừng thu âm" : "Nói giọng nói"}
              >
                🎤
              </button>

              <button
                type="submit"
                disabled={isListening}
                className="bg-violet-600 hover:bg-violet-750 disabled:bg-zinc-300 text-white rounded-lg p-2 cursor-pointer shadow-xs transition-all flex items-center justify-center shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
