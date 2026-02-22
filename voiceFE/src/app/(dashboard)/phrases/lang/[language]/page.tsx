'use client'

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { phraseService } from "@/services";
import { Language, Phrase } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DataTableControls } from "@/components/common/data-table-controls";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

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
};

export default function VoicePhrasesPage({ params }: { params: Promise<{ language: string }> }) {
  const { language: languageParam } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingPhraseId, setUploadingPhraseId] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [queueLimit, setQueueLimit] = useState(20);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueTotalPages, setQueueTotalPages] = useState(1);
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionLimit, setSubmissionLimit] = useState(20);
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [submissionTotalPages, setSubmissionTotalPages] = useState(1);

  const isValidLanguageParam = isLanguage(languageParam);
  const language: Language = isValidLanguageParam ? languageParam : "yoruba";

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [queueData, submissionData] = await Promise.all([
        phraseService.getQueuePage({
          q: queueSearch || undefined,
          page: queuePage,
          limit: queueLimit
        }),
        phraseService.listMySubmissionsPage({
          q: submissionSearch || undefined,
          page: submissionPage,
          limit: submissionLimit
        })
      ]);
      setQueue(queueData.items);
      setSubmissions(submissionData.items);
      setQueueTotal(queueData.total);
      setQueueTotalPages(queueData.pagination.totalPages);
      setSubmissionTotal(submissionData.total);
      setSubmissionTotalPages(submissionData.pagination.totalPages);
    } catch {
      toast.error("Failed to load phrases/audio submissions");
    } finally {
      setIsLoading(false);
    }
  }, [queuePage, queueSearch, queueLimit, submissionPage, submissionSearch, submissionLimit]);

  useEffect(() => {
    if (!isValidLanguageParam) return;
    fetchData();
  }, [fetchData, isValidLanguageParam]);

  useEffect(() => {
    setQueuePage(1);
  }, [queueSearch, language]);

  useEffect(() => {
    setSubmissionPage(1);
  }, [submissionSearch, language]);

  useEffect(() => {
    const qq = searchParams.get("qq") || "";
    const qp = Number(searchParams.get("qp") || "1");
    const ql = Number(searchParams.get("ql") || "20");
    const sq = searchParams.get("sq") || "";
    const sp = Number(searchParams.get("sp") || "1");
    const sl = Number(searchParams.get("sl") || "20");
    setQueueSearch(qq);
    setQueuePage(Number.isInteger(qp) && qp > 0 ? qp : 1);
    setQueueLimit([10, 20, 50].includes(ql) ? ql : 20);
    setSubmissionSearch(sq);
    setSubmissionPage(Number.isInteger(sp) && sp > 0 ? sp : 1);
    setSubmissionLimit([10, 20, 50].includes(sl) ? sl : 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (queueSearch) params.set("qq", queueSearch);
    else params.delete("qq");
    params.set("qp", String(queuePage));
    params.set("ql", String(queueLimit));
    if (submissionSearch) params.set("sq", submissionSearch);
    else params.delete("sq");
    params.set("sp", String(submissionPage));
    params.set("sl", String(submissionLimit));
    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) return;
    router.replace(`${pathname}?${nextQuery}`);
  }, [
    queueSearch,
    queuePage,
    queueLimit,
    submissionSearch,
    submissionPage,
    submissionLimit,
    pathname,
    router,
    searchParams
  ]);

  const scopedQueue = useMemo(
    () => queue.filter((item) => item.phrase.language === language),
    [queue, language]
  );

  const scopedSubmissions = useMemo(
    () => submissions.filter((item) => item.phrase?.language === language),
    [submissions, language]
  );

  async function handleUpload(phraseId: string, file: File) {
    try {
      setUploadingPhraseId(phraseId);
      const base64 = await fileToBase64(file);
      await phraseService.createSubmission(phraseId, {
        base64,
        mimeType: file.type || "audio/mpeg"
      });
      toast.success("Audio submitted for review");
      await fetchData();
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Upload failed";
      toast.error(message);
    } finally {
      setUploadingPhraseId(null);
    }
  }

  if (!isValidLanguageParam) return <div>Invalid language</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
            {LANGUAGE_LABELS[language]} Audio Queue
          </h1>
          <p className="text-muted-foreground font-medium">
            Record and submit phrase audio. Admin will accept or reject with feedback.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 py-4 border-b font-bold">Phrases Without Audio</div>
        <div className="px-6 pt-4">
          <DataTableControls
            search={queueSearch}
            onSearchChange={setQueueSearch}
            page={queuePage}
            limit={queueLimit}
            onLimitChange={(value) => {
              setQueueLimit(value);
              setQueuePage(1);
            }}
            totalPages={queueTotalPages}
            total={queueTotal}
            label="Search queue"
            onPrev={() => setQueuePage((prev) => Math.max(1, prev - 1))}
            onNext={() => setQueuePage((prev) => Math.min(queueTotalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phrase</TableHead>
              <TableHead>Translation</TableHead>
              <TableHead>Last Submission</TableHead>
              <TableHead className="text-right">Upload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : scopedQueue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  No pending phrases in your language.
                </TableCell>
              </TableRow>
            ) : (
              scopedQueue.map((item) => (
                <TableRow key={item.phrase._id}>
                  <TableCell className="font-semibold">{item.phrase.text}</TableCell>
                  <TableCell>{item.phrase.translation}</TableCell>
                  <TableCell>
                    {item.latestSubmission ? (
                      <Badge
                        className={
                          item.latestSubmission.status === "accepted"
                            ? "bg-green-500"
                            : item.latestSubmission.status === "rejected"
                              ? "bg-red-500"
                              : "bg-amber-500"
                        }
                      >
                        {item.latestSubmission.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">none</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            handleUpload(item.phrase._id, file);
                          }
                          event.target.value = "";
                        }}
                        disabled={uploadingPhraseId === item.phrase._id}
                      />
                      <Button type="button" variant="outline" disabled={uploadingPhraseId === item.phrase._id}>
                        {uploadingPhraseId === item.phrase._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        Upload Audio
                      </Button>
                    </label>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 py-4 border-b font-bold">My Submissions</div>
        <div className="px-6 pt-4">
          <DataTableControls
            search={submissionSearch}
            onSearchChange={setSubmissionSearch}
            page={submissionPage}
            limit={submissionLimit}
            onLimitChange={(value) => {
              setSubmissionLimit(value);
              setSubmissionPage(1);
            }}
            totalPages={submissionTotalPages}
            total={submissionTotal}
            label="Search submissions"
            onPrev={() => setSubmissionPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setSubmissionPage((prev) => Math.min(submissionTotalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phrase</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Rejection Reason</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : scopedSubmissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  No submissions yet.
                </TableCell>
              </TableRow>
            ) : (
              scopedSubmissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-semibold">{submission.phrase?.text || "-"}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        submission.status === "accepted"
                          ? "bg-green-500"
                          : submission.status === "rejected"
                            ? "bg-red-500"
                            : "bg-amber-500"
                      }
                    >
                      {submission.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{submission.rejectionReason || "-"}</TableCell>
                  <TableCell>{new Date(submission.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
