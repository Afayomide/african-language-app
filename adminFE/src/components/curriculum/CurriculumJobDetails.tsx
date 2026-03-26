'use client'

import { AlertTriangle, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CurriculumBuildArtifact, CurriculumBuildJob, CurriculumBuildJobStatus } from "@/types";

function statusBadgeClass(status: CurriculumBuildJobStatus) {
  if (status === "completed") return "bg-green-600 text-white hover:bg-green-700";
  if (status === "running" || status === "planned") return "bg-blue-600 text-white hover:bg-blue-700";
  if (status === "failed") return "bg-red-600 text-white hover:bg-red-700";
  if (status === "cancelled") return "bg-zinc-600 text-white hover:bg-zinc-700";
  return "bg-amber-500 text-white hover:bg-amber-600";
}

function stepStatusToJobStatus(status: "pending" | "running" | "completed" | "failed" | "skipped"): CurriculumBuildJobStatus {
  if (status === "pending") return "queued";
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "cancelled";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function CurriculumJobDetails({
  job,
  artifacts = [],
  artifactsLoading = false,
  isRefreshing,
  isResuming,
  onRefresh,
  onResume
}: {
  job: CurriculumBuildJob | null;
  artifacts?: CurriculumBuildArtifact[];
  artifactsLoading?: boolean;
  isRefreshing?: boolean;
  isResuming?: boolean;
  onRefresh?: () => void | Promise<void>;
  onResume?: () => void | Promise<void>;
}) {
  if (!job) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>Select a curriculum job to inspect its artifacts.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const createdChapterCount = job.artifacts.chapterPlan.filter((item) => item.status === "created").length;
  const createdUnitCount = job.artifacts.unitPlan.filter((item) => item.status === "created").length;
  const createdLessonCount = job.artifacts.lessonPlan.filter((item) => item.status === "created").length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>Inspect generated artifacts and step-level outcomes for the selected job.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRefresh} disabled={isRefreshing || !onRefresh}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshing && "animate-spin")} />
            Refresh Job
          </Button>
          <Button
            variant={job.status === "failed" ? "destructive" : "outline"}
            onClick={onResume}
            disabled={!onResume || isResuming || job.status === "completed" || job.status === "cancelled"}
          >
            <Play className="mr-2 h-4 w-4" />
            Resume
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chapters</div>
              <div className="mt-2 text-2xl font-bold">{createdChapterCount}</div>
              <div className="text-xs text-muted-foreground">of {job.artifacts.chapterPlan.length} planned</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Units</div>
              <div className="mt-2 text-2xl font-bold">{createdUnitCount}</div>
              <div className="text-xs text-muted-foreground">of {job.artifacts.unitPlan.length} planned</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lessons</div>
              <div className="mt-2 text-2xl font-bold">{createdLessonCount}</div>
              <div className="text-xs text-muted-foreground">of {job.artifacts.lessonPlan.length} planned</div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Status</div>
              <div className="mt-2">
                <Badge className={statusBadgeClass(job.status)}>{job.status}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Step: {job.currentStepKey}</div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4 rounded-xl border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Step Timeline</h3>
              <div className="space-y-3">
                {job.steps.map((step) => (
                  <div key={step.key} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium capitalize">{step.key}</div>
                      <Badge className={statusBadgeClass(stepStatusToJobStatus(step.status))}>{step.status}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{step.message || "No message."}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Attempts: {step.attempts} · Started: {formatDate(step.startedAt)} · Completed: {formatDate(step.completedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-xl border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Architect Memory</h3>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {job.artifacts.memorySummary || "No curriculum memory summary stored."}
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">Architect Notes</div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {job.artifacts.architectNotes.length === 0 ? (
                    <li>None.</li>
                  ) : (
                    job.artifacts.architectNotes.map((note, index) => <li key={`${index}-${note}`}>• {note}</li>)
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-xl border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Chapter Plan</h3>
              <div className="space-y-3">
                {job.artifacts.chapterPlan.map((item) => (
                  <div key={`${item.orderIndex}-${item.title}`} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">{item.orderIndex + 1}. {item.title}</div>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Unit Plan</h3>
              <div className="space-y-3">
                {job.artifacts.unitPlan.map((item) => (
                  <div key={`${item.chapterId}-${item.orderIndex}-${item.title}`} className="rounded-lg border p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.chapterTitle}</div>
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <div className="font-medium">{item.orderIndex + 1}. {item.title}</div>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lesson Plan</h3>
              <div className="space-y-3">
                {job.artifacts.lessonPlan.map((item) => (
                  <div key={`${item.unitId}-${item.orderIndex}-${item.title}`} className="rounded-lg border p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.unitTitle}</div>
                    <div className="mt-1 flex items-start justify-between gap-3">
                      <div className="font-medium">{item.orderIndex + 1}. {item.title}</div>
                      <Badge variant="outline">{item.status}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{item.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Critic Summary</h3>
              <p className="text-sm text-muted-foreground">{job.artifacts.criticSummary || "No critic summary recorded yet."}</p>
              {job.artifacts.criticIssues.length > 0 ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Critic Issues
                  </div>
                  <ul className="space-y-2">
                    {job.artifacts.criticIssues.map((issue, index) => <li key={`${index}-${issue}`}>• {issue}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Refiner Summary</h3>
              <p className="text-sm text-muted-foreground">{job.artifacts.refinerSummary || "No refiner summary recorded yet."}</p>
              {job.errors.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <div className="text-sm font-medium">Errors</div>
                  {job.errors.map((error, index) => (
                    <div key={`${index}-${error.createdAt}`} className="rounded-lg border p-3 text-sm">
                      <div className="font-medium">{error.stepKey || "job"}</div>
                      <div className="mt-1 text-muted-foreground">{error.message}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDate(error.createdAt)}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Artifact Snapshots</h3>
              <div className="text-xs text-muted-foreground">
                {artifactsLoading ? "Loading…" : `${artifacts.length} snapshot${artifacts.length === 1 ? "" : "s"}`}
              </div>
            </div>

            {artifactsLoading ? (
              <div className="text-sm text-muted-foreground">Loading artifact snapshots…</div>
            ) : artifacts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No persisted artifact snapshots found for this job.</div>
            ) : (
              <div className="space-y-3">
                {artifacts.map((artifact) => (
                  <div key={artifact._id || `${artifact.phaseKey}-${artifact.scopeId || "job"}-${artifact.createdAt}`} className="rounded-lg border p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{artifact.phaseKey}</Badge>
                          <Badge className={statusBadgeClass(stepStatusToJobStatus(
                            artifact.status === "accepted" || artifact.status === "applied"
                              ? "completed"
                              : artifact.status === "draft"
                                ? "pending"
                                : "failed"
                          ))}>
                            {artifact.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {artifact.scopeType}
                            {artifact.scopeTitle ? ` · ${artifact.scopeTitle}` : ""}
                          </span>
                        </div>
                        <div className="text-sm font-medium">{artifact.summary}</div>
                        <div className="text-xs text-muted-foreground">
                          Attempt {artifact.attempt} · {formatDate(artifact.createdAt)}
                        </div>
                      </div>
                    </div>

                    {artifact.critic ? (
                      <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Critic</div>
                        <div className="mt-1 text-sm">{artifact.critic.summary}</div>
                        {artifact.critic.issues.length > 0 ? (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {artifact.critic.issues.map((issue, index) => <li key={`${artifact._id}-critic-${index}`}>• {issue}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                    {artifact.refiner ? (
                      <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refiner</div>
                        <div className="mt-1 text-sm">{artifact.refiner.summary}</div>
                        {artifact.refiner.fixesApplied.length > 0 ? (
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {artifact.refiner.fixesApplied.map((fix, index) => <li key={`${artifact._id}-fix-${index}`}>• {fix}</li>)}
                          </ul>
                        ) : null}
                        {artifact.refiner.unresolvedIssues.length > 0 ? (
                          <ul className="mt-2 space-y-1 text-sm text-red-700">
                            {artifact.refiner.unresolvedIssues.map((issue, index) => <li key={`${artifact._id}-unresolved-${index}`}>• {issue}</li>)}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
