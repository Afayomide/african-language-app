import api from "@/lib/api";
import { feTutorRoutes } from "@/lib/apiRoutes";
import type { PublicLanguage } from "@/types";

export const languageService = {
  async listLanguages(_status: "active" | "hidden" | "archived" | "all" = "all") {
    const response = await api.get<{ languages: PublicLanguage[] }>(feTutorRoutes.languages());
    return response.data.languages || [];
  }
};
