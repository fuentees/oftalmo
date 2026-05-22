const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

let gisReady = false;
let gisLoading = false;
const pendingResolvers = [];

function loadGIS() {
  if (gisReady) return Promise.resolve();
  if (gisLoading) return new Promise((resolve) => pendingResolvers.push(resolve));

  gisLoading = true;
  return new Promise((resolve) => {
    pendingResolvers.push(resolve);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      gisReady = true;
      gisLoading = false;
      pendingResolvers.forEach((cb) => cb());
      pendingResolvers.length = 0;
    };
    document.head.appendChild(script);
  });
}

let tokenClient = null;

async function getTokenClient() {
  await loadGIS();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {},
    });
  }
  return tokenClient;
}

async function requestToken(options = {}) {
  const client = await getTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      resolve(response.access_token);
    };
    client.requestAccessToken(options);
  });
}

// Abre popup para o usuário autorizar (primeira vez)
export async function connectGoogleCalendar() {
  return requestToken({ prompt: "consent" });
}

// Tenta obter token sem mostrar popup (usa sessão existente do Google)
export async function silentGoogleToken() {
  return requestToken({ prompt: "" });
}
