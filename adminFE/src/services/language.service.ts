import api from "@/lib/api";
import { feAdminRoutes } from "@/lib/apiRoutes";
import type { PublicLanguage } from "@/types";

export const languageService = {
  async listLanguages(status: "active" | "hidden" | "archived" | "all" = "all") {
    const response = await api.get<{ languages: PublicLanguage[] }>(feAdminRoutes.languages(), {
      params: { status }
    });
    return response.data.languages || [];
  }
};
