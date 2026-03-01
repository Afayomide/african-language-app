import api from "@/lib/api";
import { feVoiceRoutes } from "@/lib/apiRoutes";
import { Phrase } from "@/types";

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
};

type PaginatedResult<T> = {
  items: T[];
  total: number;
  pagination: PaginationMeta;
};

type AudioUploadPayload = {
  base64: string;
  mimeType?: string;
};

type QueueItem = {
  phrase: Phrase;
  latestSubmission: null | {
    id: string;
    status: "pending" | "accepted" | "rejected";
    rejectionReason: string;
    createdAt: string;
  };
};

type SubmissionItem = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  rejectionReason: string;
  createdAt: string;
  phrase: Phrase | null;
  audio: {
    url: string;
    format: string;
  };
};

export const lessonService = {
  async listLessons() {
    return [];
  }
};

export const phraseService = {
  async getQueue() {
    const response = await api.get<{ queue: QueueItem[] }>(feVoiceRoutes.queue());
    return response.data.queue;
  },

  async getQueuePage(params?: { q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ queue: QueueItem[]; total: number; pagination?: PaginationMeta }>(
      feVoiceRoutes.queue(),
      { params }
    );
    return {
      items: response.data.queue,
      total: response.data.total ?? response.data.queue.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.queue.length || 20,
        total: response.data.queue.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<QueueItem>;
  },

  async createSubmission(phraseId: string, audioUpload: AudioUploadPayload) {
    const response = await api.post<{ submission: unknown }>(
      feVoiceRoutes.createSubmission(phraseId),
      { audioUpload }
    );
    return response.data.submission;
  },

  async listMySubmissions(status?: "pending" | "accepted" | "rejected") {
    const response = await api.get<{ submissions: SubmissionItem[] }>(feVoiceRoutes.submissions(), {
      params: { status }
    });
    return response.data.submissions;
  },

  async listMySubmissionsPage(params?: {
    status?: "pending" | "accepted" | "rejected";
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ submissions: SubmissionItem[]; total: number; pagination?: PaginationMeta }>(
      feVoiceRoutes.submissions(),
      { params }
    );
    return {
      items: response.data.submissions,
      total: response.data.total ?? response.data.submissions.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.submissions.length || 20,
        total: response.data.submissions.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<SubmissionItem>;
  }
};

export const questionService = {
  async listQuestions() {
    return [];
  }
};
