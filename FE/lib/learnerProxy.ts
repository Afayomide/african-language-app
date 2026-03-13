export async function readJsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: "Unexpected server response.", raw };
  }
}
