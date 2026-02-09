import React, { createContext, useState, useContext, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { mapSupabaseUser } from "@/api/dataClient";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);

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
        setUser(sessionUser);
        setIsAuthenticated(!!sessionUser);
        setAuthError(
          sessionUser
            ? null
            : { type: "auth_required", message: "Authentication required" }
        );
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
        setUser(sessionUser);
        setIsAuthenticated(!!sessionUser);
        setAuthError(
          sessionUser
            ? null
            : { type: "auth_required", message: "Authentication required" }
        );
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

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        logout,
        navigateToLogin,
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
