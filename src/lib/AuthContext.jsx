import React, { createContext, useState, useContext, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { mapSupabaseUser } from "@/api/dataClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isAdmin = user?.role === "admin";
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const setAuthStateFromUser = (sessionUser) => {
    setUser(sessionUser);
    setIsAuthenticated(!!sessionUser);
    setAuthError(
      sessionUser
        ? null
        : { type: "auth_required", message: "Authentication required" }
    );
  };

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      setIsLoadingAuth(true);
      setIsLoadingPublicSettings(true);

      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (error) {
        setAuthError({ type: "auth_error", message: error.message });
        setUser(null);
        setIsAuthenticated(false);
      } else {
        const sessionUser = data?.session?.user
          ? mapSupabaseUser(data.session.user)
          : null;
        setAuthStateFromUser(sessionUser);
      }

      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    };

    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const sessionUser = session?.user
          ? mapSupabaseUser(session.user)
          : null;
        setAuthStateFromUser(sessionUser);
        setIsLoadingAuth(false);
        setIsLoadingPublicSettings(false);
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      supabase.auth.signOut().finally(() => {
        window.location.href = "/login";
      });
    } else {
      supabase.auth.signOut();
    }
  };

  const navigateToLogin = () => {
    window.location.href = "/login";
  };

  const refreshUser = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    const sessionUser = data?.user ? mapSupabaseUser(data.user) : null;
    setAuthStateFromUser(sessionUser);
    return sessionUser;
  };

  const updateProfile = async ({ fullName, email, password }) => {
    const payload = {};
    const normalizedName = String(fullName ?? "").trim();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "").trim();
    const currentName = String(user?.full_name ?? "").trim();
    const currentEmail = String(user?.email ?? "").trim().toLowerCase();

    if (normalizedName && normalizedName !== currentName) {
      payload.data = {
        full_name: normalizedName,
        name: normalizedName,
      };
    }
    if (normalizedEmail && normalizedEmail !== currentEmail) {
      payload.email = normalizedEmail;
    }
    if (normalizedPassword) {
      payload.password = normalizedPassword;
    }

    if (Object.keys(payload).length === 0) {
      return {
        user,
        updated: false,
        emailChangeRequested: false,
      };
    }

    const { data, error } = await supabase.auth.updateUser(payload);
    if (error) throw error;

    const updatedUser = data?.user ? mapSupabaseUser(data.user) : await refreshUser();
    setAuthStateFromUser(updatedUser);

    return {
      user: updatedUser,
      updated: true,
      emailChangeRequested: Boolean(payload.email),
    };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isAdmin,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        logout,
        navigateToLogin,
        refreshUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
