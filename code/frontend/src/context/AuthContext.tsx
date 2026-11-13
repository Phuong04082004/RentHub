"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { UserResponse, userService } from "@/services/user-service";

interface AuthContextType {
  token: string | null;
  user: UserResponse | null;
  role: "ROLE_USER" | "ROLE_ADMIN" | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: UserResponse) => void;
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [role, setRole] = useState<"ROLE_USER" | "ROLE_ADMIN" | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // LOGOUT FUNCTION
  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("user");
    localStorage.removeItem("fullName");
    setToken(null);
    setUser(null);
    setRole(null);
    setIsAuthenticated(false);
    setIsLoading(false);
  }, []);

  // REFRESH PROFILE FUNCTION
  const refreshProfile = useCallback(async () => {
    try {
      const profile = await userService.getMyProfile();
      setUser(profile);
      const userRole = profile.role as "ROLE_USER" | "ROLE_ADMIN";
      setRole(userRole);
      localStorage.setItem("user", JSON.stringify(profile));
      localStorage.setItem("role", userRole);
      localStorage.setItem("fullName", profile.fullName);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Lỗi đồng bộ hồ sơ cá nhân:", error);
      logout();
    }
  }, [logout]);

  // LOGIN SUCCESS ACTION
  const login = useCallback((newToken: string, newUser: UserResponse) => {
    localStorage.setItem("token", newToken);
    const userRole = newUser.role as "ROLE_USER" | "ROLE_ADMIN";
    localStorage.setItem("role", userRole);
    localStorage.setItem("user", JSON.stringify(newUser));
    localStorage.setItem("fullName", newUser.fullName);

    setToken(newToken);
    setUser(newUser);
    setRole(userRole);
    setIsAuthenticated(true);
    setIsLoading(false);
  }, []);

  // INITIAL STATE SYNC ON MOUNT / REFRESH
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("token");
      const storedRole = localStorage.getItem("role") as "ROLE_USER" | "ROLE_ADMIN" | null;
      const storedUser = localStorage.getItem("user");

      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      // Sync initial local storage values to state to prevent page blink
      setToken(storedToken);
      if (storedRole) setRole(storedRole);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
          setIsAuthenticated(true);
        } catch {
          // ignore
        }
      }

      // Fetch fresh profile data to verify token and sync latest role
      try {
        const profile = await userService.getMyProfile();
        setUser(profile);
        const userRole = profile.role as "ROLE_USER" | "ROLE_ADMIN";
        setRole(userRole);
        localStorage.setItem("user", JSON.stringify(profile));
        localStorage.setItem("role", userRole);
        localStorage.setItem("fullName", profile.fullName);
        setIsAuthenticated(true);
      } catch (error: unknown) {
        // Bắt cả 401 (token hết hạn) và 403 (token không hợp lệ/bị revoke)
        const axiosError = error as { response?: { status?: number } };
        const status = axiosError?.response?.status;
        if (status === 401 || status === 403) {
          console.warn(`Token không hợp lệ (HTTP ${status}), tự động đăng xuất.`);
        } else {
          console.error("Lỗi khi xác thực token khởi động:", error);
        }
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth phải được sử dụng trong AuthProvider");
  }
  return context;
}
