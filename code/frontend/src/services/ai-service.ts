import api from "@/lib/axios";

export interface AiChatRequest {
  content: string;
  conversationId?: number | null;
}

export interface AiChatResponse {
  response: string;
  conversationId: number | null;
  conversationTitle: string;
}

export interface AiConversationResponse {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiMessageResponse {
  id: number;
  role: string;
  content: string;
  createdAt: string;
}

export const aiService = {
  chat: async (request: AiChatRequest): Promise<AiChatResponse> => {
    const res = await api.post("/ai/chat", request);
    return res.data;
  },

  getConversations: async (): Promise<AiConversationResponse[]> => {
    const res = await api.get("/ai/conversations");
    return res.data;
  },

  getConversation: async (id: number): Promise<AiConversationResponse> => {
    const res = await api.get(`/ai/conversations/${id}`);
    return res.data;
  },

  getMessages: async (id: number): Promise<AiMessageResponse[]> => {
    const res = await api.get(`/ai/conversations/${id}/messages`);
    return res.data;
  },

  archiveConversation: async (id: number): Promise<void> => {
    const res = await api.post(`/ai/conversations/${id}/archive`);
    return res.data;
  },

  restoreConversation: async (id: number): Promise<void> => {
    const res = await api.post(`/ai/conversations/${id}/restore`);
    return res.data;
  },

  deleteConversation: async (id: number): Promise<void> => {
    const res = await api.delete(`/ai/conversations/${id}`);
    return res.data;
  }
};
