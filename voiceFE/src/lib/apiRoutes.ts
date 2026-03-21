const BE_API_URL = process.env.BE_API_URL || process.env.NEXT_PUBLIC_BE_API_URL || "http://localhost:5000";

function buildBePath(path: string) {
  const base = BE_API_URL.replace(/\/+$/, "");
  if (base.endsWith("/api")) {
    return `${base}${path}`;
  }
  return `${base}/api${path}`;
}

export const beVoiceRoutes = {
  signup: () => buildBePath("/voice/auth/signup"),
  login: () => buildBePath("/voice/auth/login"),
  me: () => buildBePath("/voice/auth/me"),
  queue: () => buildBePath("/voice/content/queue"),
  submissions: () => buildBePath("/voice/content/submissions"),
  createSubmission: (contentType: string, contentId: string) =>
    buildBePath(`/voice/content/${contentType}/${contentId}/submissions`)
};

export const feVoiceRoutes = {
  signup: () => "/api/voice/auth/signup",
  login: () => "/api/voice/auth",
  me: () => "/api/voice/auth/me",
  queue: () => "/api/voice/content/queue",
  submissions: () => "/api/voice/content/submissions",
  createSubmission: (contentType: string, contentId: string) =>
    `/api/voice/content/${contentType}/${contentId}/submissions`
};
