const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function generateCodeVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function connectGoogleCalendar() {
  const redirectUri = window.location.origin;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  const popup = window.open(authUrl, "google-auth", "width=500,height=650,left=200,top=100");

  if (!popup) {
    throw new Error("Popup bloqueado. Permita popups para este site e tente novamente.");
  }

  return new Promise((resolve, reject) => {
    const handler = async (e) => {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== "google_oauth") return;

      window.removeEventListener("message", handler);
      clearInterval(checkClosed);

      if (e.data.error) {
        reject(new Error(e.data.error));
        return;
      }

      try {
        const res = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: CLIENT_ID,
            code: e.data.code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            code_verifier: codeVerifier,
          }),
        });
        const tokens = await res.json();
        if (tokens.error) throw new Error(tokens.error_description || tokens.error);
        resolve(tokens);
      } catch (err) {
        reject(err);
      }
    };

    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", handler);
        reject(new Error("cancelled"));
      }
    }, 500);

    window.addEventListener("message", handler);
  });
}

export async function refreshGoogleToken(refreshToken) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await res.json();
  if (tokens.error) throw new Error(tokens.error_description || tokens.error);
  return tokens.access_token;
}
