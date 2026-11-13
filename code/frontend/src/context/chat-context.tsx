"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { chatService, ConversationSummaryResponse, MessageResponse, MessageType } from "@/services/chat-service";

interface ChatContextType {
  isOpen: boolean;
  activeConversationId: number | null;
  conversations: ConversationSummaryResponse[];
  openChat: (recipientId?: number) => Promise<void>;
  closeChat: () => void;
  selectConversation: (id: number) => Promise<void>;
  sendMessage: (content: string, type?: MessageType, referencedProductId?: number) => Promise<void>;
  messages: MessageResponse[];
  loadingMessages: boolean;
  unreadTotal: number;
  refreshConversations: () => Promise<ConversationSummaryResponse[]>;
  loadMoreMessages: () => Promise<void>;
  activeReferencedProduct: any | null;
  setActiveReferencedProduct: (product: any | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ConversationSummaryResponse[]>([]);
  const [messages, setMessages] = useState<MessageResponse[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [activeReferencedProduct, setActiveReferencedProduct] = useState<any | null>(null);

  // Clear state when user logs out
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setConversations([]);
      setMessages([]);
      setActiveConversationId(null);
      setIsOpen(false);
      setActiveReferencedProduct(null);
    }
  }, [isAuthenticated, user]);

  const refreshConversations = async (): Promise<ConversationSummaryResponse[]> => {
    if (isLoading || !isAuthenticated || !user) return [];
    try {
      const data = await chatService.getMyConversations();
      if (data) {
        const uniqueData = Array.from(new Map(data.map(c => [c.conversationId, c])).values());
        setConversations(uniqueData);
        return uniqueData;
      } else {
        setConversations([]);
        return [];
      }
    } catch (err) {
      console.error("Lỗi lấy hộp thoại chat:", err);
      return [];
    }
  };

  // WebSocket STOMP integration
  const stompClientRef = useRef<any>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    refreshConversations();

    const connectStomp = async () => {
      const { Client } = await import('@stomp/stompjs');
      const SockJS = (await import('sockjs-client')).default;
      
      const token = localStorage.getItem("accessToken") || localStorage.getItem("token");
      
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, "/ws") : "http://localhost:8080/ws");
      
      const client = new Client({
        webSocketFactory: () => new SockJS(wsUrl),
        connectHeaders: {
          Authorization: token ? `Bearer ${token}` : "",
        },
        debug: (str) => console.log('STOMP: ' + str),
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      client.onConnect = () => {
        console.log("Connected to Chat WebSocket");
      };

      client.onStompError = (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
      };

      client.activate();
      stompClientRef.current = client;
    };

    connectStomp();

    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
    };
  }, [user, isLoading, isAuthenticated]);

  // Subscribe to active conversations dynamically
  const subscriptionsRef = useRef<{ [key: number]: any }>({});
  const activeConversationIdRef = useRef(activeConversationId);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    const client = stompClientRef.current;
    if (!client || !client.connected || conversations.length === 0) return;

    // Remove old subscriptions
    Object.values(subscriptionsRef.current).forEach(sub => sub.unsubscribe());
    subscriptionsRef.current = {};

    // Subscribe to all conversations the user is part of
    conversations.forEach(conv => {
      subscriptionsRef.current[conv.conversationId] = client.subscribe(
        `/topic/chat/${conv.conversationId}`,
        (message: any) => {
          const newMsg = JSON.parse(message.body);
          
          if (activeConversationIdRef.current === conv.conversationId) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            chatService.markAsRead(conv.conversationId);
          }
          refreshConversations();
        }
      );
    });

    return () => {
      Object.values(subscriptionsRef.current).forEach(sub => sub.unsubscribe());
      subscriptionsRef.current = {};
    };
  }, [conversations.map(c => c.conversationId).join(','), stompClientRef.current?.connected]);

  const selectConversation = async (id: number) => {
    setActiveConversationId(id);
    if (id === null || id === undefined) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    setPage(0);
    setHasMore(true);
    try {
      const res = await chatService.getMessages(id, 0, 20);
      // Reverse messages since page content comes in desc order (newest first)
      const sorted = (res.content || []).reverse();
      setMessages(sorted);
      
      // Mark as read in backend
      await chatService.markAsRead(id);
      
      // Update local conversation list read status
      setConversations(prev =>
        prev.map(c => (c.conversationId === id ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err: any) {
      console.error("Lỗi tải tin nhắn:", err);
      if (err.response?.status === 403) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!activeConversationId || !hasMore || loadingMessages) return;
    const nextPage = page + 1;
    try {
      const res = await chatService.getMessages(activeConversationId, nextPage, 20);
      if (res.content.length === 0) {
        setHasMore(false);
        return;
      }
      const sortedNew = (res.content || []).reverse();
      setMessages(prev => [...sortedNew, ...prev]);
      setPage(nextPage);
    } catch (err) {
      console.error("Lỗi tải tin nhắn cũ:", err);
    }
  };

  const openChat = async (recipientId?: number) => {
    setIsOpen(true);
    if (!user) return;

    const freshList = await refreshConversations();
    const currentList = freshList.length > 0 ? freshList : conversations;

    if (recipientId) {
      try {
        const conv = await chatService.getOrCreateConversation(recipientId);
        // Add to list if not already there
        setConversations(prev => {
          if (prev.some(c => c.conversationId === conv.conversationId)) return prev;
          return [conv, ...prev];
        });
        await selectConversation(conv.conversationId);
      } catch (err) {
        console.error("Lỗi tạo/lấy hội thoại:", err);
      }
    } else if (currentList.length > 0 && !activeConversationId) {
      // Open the first conversation in the list by default
      await selectConversation(currentList[0].conversationId);
    }
  };

  const closeChat = () => {
    setIsOpen(false);
    setActiveReferencedProduct(null); // Clear active product context on close
  };

  const sendMessage = async (content: string, type: MessageType = "TEXT", referencedProductId?: number) => {
    if (!activeConversationId) return;
    try {
      const msg = await chatService.sendMessage({
        conversationId: activeConversationId,
        content,
        messageType: type,
        referencedProductId,
      });
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      await refreshConversations();
    } catch (err) {
      console.error("Lỗi gửi tin nhắn:", err);
    }
  };

  // Custom global event listener for details page
  useEffect(() => {
    const handleOpenChatEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const recipientId = customEvent.detail?.recipientId;
      const productInfo = customEvent.detail?.productId ? {
        id: customEvent.detail.productId,
        name: customEvent.detail.productName,
        pricePerDay: customEvent.detail.productPrice,
        primaryImage: customEvent.detail.productImage,
      } : null;

      setActiveReferencedProduct(productInfo);
      openChat(recipientId);
    };

    window.addEventListener("open-chat-drawer", handleOpenChatEvent);
    return () => {
      window.removeEventListener("open-chat-drawer", handleOpenChatEvent);
    };
  }, [conversations]);

  const unreadTotal = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        activeConversationId,
        conversations,
        openChat,
        closeChat,
        selectConversation,
        sendMessage,
        messages,
        loadingMessages,
        unreadTotal,
        refreshConversations,
        loadMoreMessages,
        activeReferencedProduct,
        setActiveReferencedProduct,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
