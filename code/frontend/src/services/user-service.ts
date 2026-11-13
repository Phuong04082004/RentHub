import api from "../lib/axios";

export interface UserResponse {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  role: string;
  status: string;
  bankAccountNumber?: string;
  bankCode?: string;
  bankAccountHolderName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserUpdateRequest {
  fullName: string;
  phone: string;
  avatarUrl?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  bankAccountNumber?: string;
  bankCode?: string;
  bankAccountHolderName?: string;
}

const PROFILE_API_URL = "/users/profile";

export interface PublicOwnerResponse {
  id: number;
  fullName: string;
  avatarUrl: string | null;
}

export const userService = {
  getMyProfile: async (): Promise<UserResponse> => {
    const res = await api.get(PROFILE_API_URL);
    return res.data;
  },

  updateMyProfile: async (data: UserUpdateRequest): Promise<UserResponse> => {
    const res = await api.put(PROFILE_API_URL, data);
    return res.data;
  },

  getPublicProfile: async (id: number): Promise<PublicOwnerResponse> => {
    const res = await api.get(`/users/${id}/public`);
    return res.data;
  }
};
