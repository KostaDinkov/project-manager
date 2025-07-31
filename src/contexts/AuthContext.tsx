import React, { createContext, useContext, useState, useEffect } from 'react';
import { GitHubService } from '../services/github';

interface User {
  id: string;
  login: string;
  avatar_url: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  githubService: GitHubService | null;
  isAuthenticated: boolean;
  login: (token: string, userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [githubService, setGithubService] = useState<GitHubService | null>(null);

  useEffect(() => {
    // For development: use env token
    const envToken = import.meta.env.VITE_GITHUB_TOKEN;
    
    if (envToken) {
      // Auto-login with env token for development
      const mockUser: User = {
        id: 'dev',
        login: 'developer',
        name: 'Development User',
        avatar_url: 'https://github.com/github.png'
      };
      setToken(envToken);
      setUser(mockUser);
      setGithubService(new GitHubService(envToken));
      return;
    }

    // Check for stored auth data on app load
    const storedToken = localStorage.getItem('github_token');
    const storedUser = localStorage.getItem('user_data');
    
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      setGithubService(new GitHubService(storedToken));
    }
  }, []);

  const login = (authToken: string, userData: User) => {
    setToken(authToken);
    setUser(userData);
    setGithubService(new GitHubService(authToken));
    localStorage.setItem('github_token', authToken);
    localStorage.setItem('user_data', JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setGithubService(null);
    localStorage.removeItem('github_token');
    localStorage.removeItem('user_data');
  };

  const value: AuthContextType = {
    user,
    token,
    githubService,
    isAuthenticated: !!token && !!user,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
