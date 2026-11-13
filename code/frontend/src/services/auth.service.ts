import api from "../lib/axios";
import axios from "axios";
import { LoginInput, RegisterInput } from "../schemas/auth.schema";


export interface AuthResponse {
  token: string;
  email: string;
  fullName: string;
}

export const authService = {
  login: async (data: LoginInput): Promise<AuthResponse> => {
    const res = await api.post("/v1/auth/login", data);
    return res.data;
  },

  register: async (data: RegisterInput): Promise<{ message: string }> => {
    const res = await api.post("/v1/auth/register", data);
    return res.data;
  },

  verifyRegisterOtp: async (data: { email: string; otp: string }): Promise<AuthResponse> => {
    const res = await api.post("/v1/auth/verify-register-otp", data);
    return res.data;
  },

  resendRegisterOtp: async (data: { email: string }): Promise<{ message: string }> => {
    const res = await api.post("/v1/auth/resend-register-otp", data);
    return res.data;
  },

  getRegistrationStatus: async (email: string) => {
    const res = await api.get(`/v1/auth/registration-status?email=${encodeURIComponent(email)}`);
    return res.data;
  },
};
