import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAILS_RAW =
  Deno.env.get("ADMIN_EMAILS") ?? Deno.env.get("VITE_ADMIN_EMAILS") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeRole = (value: unknown) => {
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  if (
    normalized === "admin" ||
    normalized === "administrator" ||
    normalized === "administrador" ||
    normalized === "superadmin" ||
    normalized === "super_admin"
  ) {
    return "admin";
  }
  return "usuario";
};

const ADMIN_EMAILS = new Set(
  ADMIN_EMAILS_RAW.split(",")
    .map((value) => normalizeText(value))
    .filter(Boolean)
);

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
  );
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const getBearerToken = (req: Request) => {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return "";
  return header.replace(/^Bearer\s+/i, "").trim();
};

const requireAdminUser = async (req: Request) => {
  const token = getBearerToken(req);
  if (!token) {
    throw new ApiError(401, "Authentication token is required.");
  }

  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new ApiError(401, "Invalid authentication token.");
  }

  const user = data.user;
  const role = normalizeRole(user.app_metadata?.role || user.user_metadata?.role);
  const email = normalizeText(user.email);
  const isAdmin = role === "admin" || ADMIN_EMAILS.has(email);
  if (!isAdmin) {
    throw new ApiError(403, "Only admin users can manage accounts.");
  }

  return user;
};

const mapManagedUser = (user: any) => {
  const bannedUntil = user?.banned_until ? String(user.banned_until) : null;
  const isActive = !bannedUntil || Number.isNaN(Date.parse(bannedUntil)) || Date.parse(bannedUntil) <= Date.now();
  return {
    id: String(user?.id || ""),
    email: String(user?.email || ""),
    full_name: String(
      user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email ||
        ""
    ),
    role: normalizeRole(user?.app_metadata?.role || user?.user_metadata?.role),
    is_active: isActive,
    created_at: user?.created_at || null,
    last_sign_in_at: user?.last_sign_in_at || null,
    email_confirmed_at: user?.email_confirmed_at || null,
    banned_until: bannedUntil,
  };
};

const listUsers = async () => {
  const users: any[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const chunk = data?.users || [];
    users.push(...chunk);
    if (chunk.length < perPage) break;
    page += 1;
  }

  const mapped = users
    .map(mapManagedUser)
    .sort((a, b) => Date.parse(String(b.created_at || "")) - Date.parse(String(a.created_at || "")));

  return { users: mapped };
};

const setRole = async (actingUserId: string, payload: Record<string, unknown>) => {
  const userId = String(payload.user_id || "").trim();
  const nextRole = normalizeRole(payload.role);
  if (!userId) throw new ApiError(400, "user_id is required.");
  if (userId === actingUserId && nextRole !== "admin") {
    throw new ApiError(400, "You cannot remove your own admin role.");
  }

  const { data: currentData, error: currentError } =
    await adminClient.auth.admin.getUserById(userId);
  if (currentError || !currentData?.user) {
    throw new ApiError(404, "User not found.");
  }

  const currentAppMetadata = currentData.user.app_metadata || {};
  const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...currentAppMetadata,
      role: nextRole,
    },
  });
  if (error || !data?.user) {
    throw error || new ApiError(500, "Could not update user role.");
  }

  return { user: mapManagedUser(data.user) };
};

const setActive = async (actingUserId: string, payload: Record<string, unknown>) => {
  const userId = String(payload.user_id || "").trim();
  const active = Boolean(payload.active);
  if (!userId) throw new ApiError(400, "user_id is required.");
  if (userId === actingUserId && !active) {
    throw new ApiError(400, "You cannot deactivate your own account.");
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (error) {
    throw error;
  }

  const { data: refreshed, error: refreshError } =
    await adminClient.auth.admin.getUserById(userId);
  if (refreshError || !refreshed?.user) {
    throw new ApiError(500, "Could not read updated user.");
  }

  return { user: mapManagedUser(refreshed.user) };
};

const inviteUser = async (payload: Record<string, unknown>) => {
  const email = normalizeText(payload.email);
  const fullName = String(payload.full_name || "").trim();
  const role = normalizeRole(payload.role);
  if (!email) throw new ApiError(400, "email is required.");

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: fullName
      ? {
          full_name: fullName,
          name: fullName,
        }
      : undefined,
  });
  if (error) throw error;

  let user = data?.user || null;
  if (user?.id) {
    const appMetadata = user.app_metadata || {};
    const { data: roleData, error: roleError } =
      await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...appMetadata,
          role,
        },
      });
    if (roleError) throw roleError;
    user = roleData?.user || user;
  }

  return {
    user: user ? mapManagedUser(user) : null,
  };
};

const createUser = async (payload: Record<string, unknown>) => {
  const email = normalizeText(payload.email);
  const password = String(payload.password || "");
  const fullName = String(payload.full_name || "").trim();
  const role = normalizeRole(payload.role);
  const emailConfirm = Boolean(payload.email_confirm);

  if (!email) throw new ApiError(400, "email is required.");
  if (!password || password.length < 6) {
    throw new ApiError(400, "password must be at least 6 characters.");
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: emailConfirm,
    user_metadata: fullName
      ? {
          full_name: fullName,
          name: fullName,
        }
      : {},
    app_metadata: {
      role,
    },
  });
  if (error || !data?.user) {
    throw error || new ApiError(500, "Could not create user.");
  }

  return { user: mapManagedUser(data.user) };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const actingUser = await requireAdminUser(req);
    const payload = await req.json();
    const action = String(payload?.action || "").trim().toLowerCase();

    if (action === "list_users") {
      return jsonResponse(200, await listUsers());
    }
    if (action === "invite_user") {
      return jsonResponse(200, await inviteUser(payload));
    }
    if (action === "create_user") {
      return jsonResponse(200, await createUser(payload));
    }
    if (action === "set_role") {
      return jsonResponse(200, await setRole(String(actingUser.id), payload));
    }
    if (action === "set_active") {
      return jsonResponse(200, await setActive(String(actingUser.id), payload));
    }

    return jsonResponse(400, { error: "Unknown action." });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse(error.status, { error: error.message });
    }
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unexpected error.",
    });
  }
});
