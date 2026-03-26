'use client'

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { aiService } from "@/services";
import { CurriculumBuildArtifact, CurriculumBuildJob } from "@/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CurriculumJobDetails } from "@/components/curriculum/CurriculumJobDetails";

export default function CurriculumJobDetailPage() {
  const params = useParams<{ id: string }>();
  const jobId = typeof params?.id === "string" ? params.id : "";
  const [job, setJob] = useState<CurriculumBuildJob | null>(null);
  const [artifacts, setArtifacts] = useState<CurriculumBuildArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isArtifactsLoading, setIsArtifactsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const loadJob = useCallback(async (quiet = false) => {
    if (!jobId) return;
    try {
      if (quiet) setIsRefreshing(true);
      else setIsLoading(true);
      setIsArtifactsLoading(true);
      const [nextJob, nextArtifacts] = await Promise.all([
        aiService.getCurriculumBuildJob(jobId),
        aiService.listCurriculumBuildArtifacts(jobId)
      ]);
      setJob(nextJob);
      setArtifacts(nextArtifacts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load curriculum job.");
    } finally {
      setIsLoading(false);
      setIsArtifactsLoading(false);
      setIsRefreshing(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  async function handleResume() {
    if (!jobId) return;
    try {
      setIsResuming(true);
      const nextJob = await aiService.resumeCurriculumBuildJob(jobId);
      setJob(nextJob);
      toast.success("Curriculum build job resumed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resume curriculum job.");
    } finally {
      setIsResuming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Curriculum Job</h1>
          <p className="font-medium text-muted-foreground">Inspect one curriculum build job in full.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/curriculum-jobs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Link>
        </Button>
      </div>

      {isLoading ? (
      <div className="text-sm text-muted-foreground">Loading curriculum job…</div>
      ) : (
        <CurriculumJobDetails
          job={job}
          artifacts={artifacts}
          artifactsLoading={isArtifactsLoading}
          isRefreshing={isRefreshing}
          isResuming={isResuming}
          onRefresh={() => loadJob(true)}
          onResume={handleResume}
        />
      )}
    </div>
  );
}
