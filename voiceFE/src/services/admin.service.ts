import api from "@/lib/api";
import { feVoiceRoutes } from "@/lib/apiRoutes";
import { ContentType, VoiceQueueItem, VoiceSubmissionItem } from "@/types";

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
  analysis?: {
    durationMs?: number;
    sampleRate?: number;
    channelCount?: number;
    peak?: number;
    rms?: number;
    waveformPeaks?: number[];
    pitchContour?: Array<{ timeMs: number; hz: number; midi?: number; confidence?: number }>;
    spectrogram?: Array<{ timeMs: number; bins: Array<{ hz: number; amplitude: number }> }>;
  };
};

export const lessonService = {
  async listLessons() {
    return [];
  }
};

export const contentAudioService = {

  async getQueue() {
    const response = await api.get<{ queue: VoiceQueueItem[] }>(feVoiceRoutes.queue());
    return response.data.queue;
  },

  async getQueuePage(params?: { q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ queue: VoiceQueueItem[]; total: number; pagination?: PaginationMeta }>(
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
    } satisfies PaginatedResult<VoiceQueueItem>;
  },

  async createSubmission(contentType: ContentType, contentId: string, audioUpload: AudioUploadPayload) {
    const response = await api.post<{ submission: unknown }>(
      feVoiceRoutes.createSubmission(contentType, contentId),
      { audioUpload }
    );
    return response.data.submission;
  },

  async listMySubmissions(status?: "pending" | "accepted" | "rejected") {
    const response = await api.get<{ submissions: VoiceSubmissionItem[] }>(feVoiceRoutes.submissions(), {
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
    const response = await api.get<{ submissions: VoiceSubmissionItem[]; total: number; pagination?: PaginationMeta }>(
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
    } satisfies PaginatedResult<VoiceSubmissionItem>;
  }
};

export const expressionService = contentAudioService;

export const questionService = {
  async listQuestions() {
    return [];
  }
};

