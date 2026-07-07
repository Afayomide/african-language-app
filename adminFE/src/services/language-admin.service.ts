import api from "@/lib/api";
import { feAdminRoutes } from "@/lib/apiRoutes";
import type { LanguageStatus, PublicLanguage } from "@/types";

export const adminLanguageService = {
  async listLanguages(status: LanguageStatus | "all" = "all") {
    const response = await api.get<{ languages: PublicLanguage[] }>(feAdminRoutes.languages(), {
      params: { status }
    });
    return response.data.languages || [];
  },

  async updateLanguage(
    id: string,
    input: Partial<Pick<PublicLanguage, "name" | "nativeName" | "status" | "orderIndex" | "locale" | "region">>
  ) {
    const response = await api.put<{ language: PublicLanguage }>(feAdminRoutes.language(id), input);
    return response.data.language;
  }
};
