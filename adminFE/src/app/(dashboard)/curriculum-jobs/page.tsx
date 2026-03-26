'use client'

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { aiService } from "@/services";
import { CurriculumBuildArtifact, CurriculumBuildJob, CurriculumBuildJobStatus, Language, Level } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CurriculumJobDetails } from "@/components/curriculum/CurriculumJobDetails";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced"
};

const STATUS_LABELS: Record<CurriculumBuildJobStatus, string> = {
  queued: "Queued",
  running: "Running",
  planned: "Planned",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled"
};

function statusBadgeClass(status: CurriculumBuildJobStatus) {
  if (status === "completed") return "bg-green-600 text-white hover:bg-green-700";
  if (status === "running" || status === "planned") return "bg-blue-600 text-white hover:bg-blue-700";
  if (status === "failed") return "bg-red-600 text-white hover:bg-red-700";
  if (status === "cancelled") return "bg-zinc-600 text-white hover:bg-zinc-700";
  return "bg-amber-500 text-white hover:bg-amber-600";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function CurriculumJobsPage() {
  const [jobs, setJobs] = useState<CurriculumBuildJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedArtifacts, setSelectedArtifacts] = useState<CurriculumBuildArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isArtifactsLoading, setIsArtifactsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const [language, setLanguage] = useState<Language>("yoruba");
  const [level, setLevel] = useState<Level>("beginner");
  const [requestedChapterCount, setRequestedChapterCount] = useState("2");
  const [topic, setTopic] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");

  const selectedJob = useMemo(
    () => jobs.find((job) => job._id === selectedJobId || job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  const loadArtifacts = useCallback(async (jobId: string) => {
    setIsArtifactsLoading(true);
    try {
      const artifacts = await aiService.listCurriculumBuildArtifacts(jobId);
      setSelectedArtifacts(artifacts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load curriculum job artifacts.");
      setSelectedArtifacts([]);
    } finally {
      setIsArtifactsLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async (opts?: { quiet?: boolean; selectJobId?: string }) => {
    const quiet = opts?.quiet ?? false;
    try {
      if (quiet) setIsRefreshing(true);
      else setIsLoading(true);
      const data = await aiService.listCurriculumBuildJobs({ limit: 20 });
      setJobs(data);
      const nextSelectedId = opts?.selectJobId || selectedJobId;
      if (nextSelectedId) {
        const matching = data.find((job) => job._id === nextSelectedId || job.id === nextSelectedId);
        if (matching) {
          setSelectedJobId(matching._id);
          await loadArtifacts(matching._id);
        }
      } else if (data[0]) {
        setSelectedJobId(data[0]._id);
        await loadArtifacts(data[0]._id);
      } else {
        setSelectedArtifacts([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load curriculum jobs.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [loadArtifacts, selectedJobId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  async function handleStartJob() {
    const count = Number(requestedChapterCount);
    if (!Number.isInteger(count) || count < 1 || count > 30) {
      toast.error("Requested chapter count must be between 1 and 30.");
      return;
    }

    try {
      setIsStarting(true);
      const job = await aiService.startCurriculumBuildJob({
        language,
        level,
        requestedChapterCount: count,
        topic: topic.trim() || undefined,
        extraInstructions: extraInstructions.trim() || undefined
      });
      toast.success("Curriculum build job started.");
      await loadJobs({ selectJobId: job._id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start curriculum job.");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleRefreshSelected() {
    if (!selectedJobId) {
      await loadJobs({ quiet: true });
      return;
    }

    try {
      setIsRefreshing(true);
      const [selected, allJobs] = await Promise.all([
        aiService.getCurriculumBuildJob(selectedJobId),
        aiService.listCurriculumBuildJobs({ limit: 20 })
      ]);
      setJobs(allJobs.map((job) => (job._id === selected._id ? selected : job)));
      setSelectedJobId(selected._id);
      await loadArtifacts(selected._id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh curriculum job.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleResumeSelected() {
    if (!selectedJobId) return;

    try {
      setIsResuming(true);
      const job = await aiService.resumeCurriculumBuildJob(selectedJobId);
      toast.success("Curriculum build job resumed.");
      await loadJobs({ selectJobId: job._id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resume curriculum job.");
    } finally {
      setIsResuming(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Curriculum Jobs</h1>
          <p className="font-medium text-muted-foreground">
            Start bounded curriculum build jobs that plan chapters, create unit shells, create lesson shells, and run critic/refiner steps.
          </p>
        </div>
        <Button variant="outline" onClick={handleRefreshSelected} disabled={isRefreshing} className="h-11 rounded-xl px-5 font-semibold">
          <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Start Curriculum Build</CardTitle>
            <CardDescription>Architect the next chapter sequence, create draft chapter shells, unit shells, and lesson shells.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yoruba">Yoruba</SelectItem>
                    <SelectItem value="igbo">Igbo</SelectItem>
                    <SelectItem value="hausa">Hausa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={level} onValueChange={(value) => setLevel(value as Level)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Requested Chapters</Label>
              <Input value={requestedChapterCount} onChange={(event) => setRequestedChapterCount(event.target.value)} inputMode="numeric" />
            </div>

            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. greetings and introductions" />
            </div>

            <div className="space-y-2">
              <Label>Level Mapping</Label>
              <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Beginner = A1-A2, Intermediate = B1-B2, Advanced = C1-C2
              </div>
            </div>

            <div className="space-y-2">
              <Label>Extra Instructions</Label>
              <Textarea value={extraInstructions} onChange={(event) => setExtraInstructions(event.target.value)} placeholder="Optional steering for the architect and planners." rows={5} />
            </div>

            <Button onClick={handleStartJob} disabled={isStarting} className="h-11 w-full rounded-xl font-semibold">
              <Sparkles className="mr-2 h-4 w-4" />
              {isStarting ? "Starting…" : "Start Curriculum Job"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Jobs</CardTitle>
              <CardDescription>Jobs are stored with artifacts for architect, generator, critic, and refiner phases.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading curriculum jobs…</div>
              ) : jobs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No curriculum jobs yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Language</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Step</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => {
                      const isSelected = selectedJob?._id === job._id;
                      return (
                        <TableRow
                          key={job._id}
                          className={cn("cursor-pointer", isSelected && "bg-muted/50")}
                          onClick={() => {
                            setSelectedJobId(job._id);
                            void loadArtifacts(job._id);
                          }}
                        >
                          <TableCell>{LANGUAGE_LABELS[job.language]}</TableCell>
                          <TableCell>{LEVEL_LABELS[job.level]}</TableCell>
                          <TableCell>
                            <Badge className={statusBadgeClass(job.status)}>{STATUS_LABELS[job.status]}</Badge>
                          </TableCell>
                          <TableCell className="capitalize">{job.currentStepKey}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{job.topic || "—"}</TableCell>
                          <TableCell>{formatDate(job.updatedAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm" onClick={(event) => event.stopPropagation()}>
                              <Link href={`/curriculum-jobs/${job._id}`}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <CurriculumJobDetails
            job={selectedJob}
            artifacts={selectedArtifacts}
            artifactsLoading={isArtifactsLoading}
            isRefreshing={isRefreshing}
            isResuming={isResuming}
            onRefresh={handleRefreshSelected}
            onResume={handleResumeSelected}
          />
        </div>
      </div>
    </div>
  );
}
