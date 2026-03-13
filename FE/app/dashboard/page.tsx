'use client'

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Flame, Target, BookOpen, Settings, LogOut, Layers, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { learnerDashboardService } from "@/services";
import { useLearnerAuth } from "@/components/auth/learner-auth-provider";

type UnitLesson = {
  id: string;
  title: string;
  description: string;
  level: string;
  orderIndex: number;
  status: "not_started" | "in_progress" | "completed";
  progressPercent: number;
  currentStageIndex?: number;
  totalStages?: number;
};

type DashboardData = {
  stats: {
    currentLanguage: string;
    streakDays: number;
    totalXp: number;
    dailyGoalMinutes: number;
    todayMinutes: number;
  };
  nextLesson: {
    id: string;
    unitId?: string;
    unitTitle?: string;
    title: string;
    description: string;
    currentStageIndex?: number;
    totalStages?: number;
    progressPercent?: number;
  } | null;
  units?: Array<{
    id: string;
    title: string;
    description: string;
    level: string;
    orderIndex: number;
    progressPercent: number;
    completedLessons: number;
    totalLessons: number;
    lessons: UnitLesson[];
  }>;
  completedLessons: {
    id: string;
    unitId?: string;
    unitTitle?: string;
    title: string;
    description: string;
    level: string;
    completedAt: string | null;
  }[];
  weeklyOverview: { day: string; completed: boolean; minutes: number }[];
  achievements: string[];
};

export default function DashboardScreen() {
  const { logout, isLoading: isAuthLoading, isAuthenticated, session } = useLearnerAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [expandedUnitId, setExpandedUnitId] = useState<string>("");

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || session?.requiresOnboarding) return;
    learnerDashboardService
      .getOverview()
      .then((payload) => setData(payload))
      .catch((error) => console.error("Failed to load dashboard", error));
  }, [isAuthLoading, isAuthenticated, session?.requiresOnboarding]);

  useEffect(() => {
    if (!data?.units || data.units.length === 0) return;
    if (expandedUnitId && data.units.some((unit) => unit.id === expandedUnitId)) return;
    setExpandedUnitId(data.units[0].id);
  }, [data?.units, expandedUnitId]);

  const dailyPercent = data
    ? Math.min(100, Math.round((data.stats.todayMinutes / Math.max(1, data.stats.dailyGoalMinutes)) * 100))
    : 0;

  const activeUnit = useMemo(() => {
    if (!data?.units?.length) return null;
    return data.units.find((unit) => unit.id === expandedUnitId) || data.units[0];
  }, [data?.units, expandedUnitId]);

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/20 bg-background/95 px-4 py-6 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground/60">Welcome back!</p>
              <h1 className="text-2xl font-bold text-foreground">Learning Dashboard</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => void logout()}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="px-4 py-8">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border border-border/50 p-6">
              <div className="space-y-2">
                <p className="text-sm text-foreground/60">Current Language</p>
                <h3 className="text-2xl font-bold text-foreground capitalize">{data?.stats.currentLanguage || "-"}</h3>
              </div>
            </Card>

            <Card className="border border-border/50 p-6">
              <div className="flex items-center gap-2 space-y-2">
                <Flame className="h-6 w-6 text-accent" />
                <div>
                  <p className="text-sm text-foreground/60">Streak</p>
                  <h3 className="text-2xl font-bold text-foreground">{data?.stats.streakDays || 0} Days</h3>
                </div>
              </div>
            </Card>

            <Card className="border border-border/50 p-6">
              <div className="space-y-2">
                <p className="text-sm text-foreground/60">Total XP</p>
                <h3 className="text-2xl font-bold text-primary">{data?.stats.totalXp || 0} XP</h3>
              </div>
            </Card>
          </div>

          <Card className="border border-border/50 p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-bold text-foreground">
                  <Target className="h-5 w-5 text-primary" />
                  Today&apos;s Goal
                </h3>
                <span className="text-sm text-foreground/60">
                  {data?.stats.todayMinutes || 0} min / {data?.stats.dailyGoalMinutes || 0} min
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${dailyPercent}%` }} />
                </div>
                <p className="text-xs text-foreground/60">Keep going. Your progress updates as you complete lessons.</p>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <h2 className="flex items-center gap-2 font-bold text-foreground">
              <Layers className="h-5 w-5 text-primary" />
              Unit Learning Path
            </h2>

            {data?.units && data.units.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {data.units.map((unit) => (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => setExpandedUnitId(unit.id)}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        activeUnit?.id === unit.id ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/40"
                      }`}
                    >
                      <p className="text-xs uppercase tracking-wide text-foreground/50">Unit {unit.orderIndex + 1}</p>
                      <h3 className="font-bold text-foreground">{unit.title}</h3>
                      <p className="text-xs text-foreground/60">{unit.completedLessons}/{unit.totalLessons} lessons completed</p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${unit.progressPercent}%` }} />
                      </div>
                    </button>
                  ))}
                </div>

                {activeUnit ? (
                  <Card className="border border-border/50 p-6">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-foreground/50">{activeUnit.level}</p>
                        <h3 className="text-xl font-bold text-foreground">{activeUnit.title}</h3>
                        <p className="text-sm text-foreground/70">{activeUnit.description || "Unit curriculum"}</p>
                      </div>
                      <BadgeProgress value={activeUnit.progressPercent} />
                    </div>

                    <div className="space-y-3">
                      {activeUnit.lessons.map((lesson) => (
                        <div key={lesson.id} className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{lesson.orderIndex + 1}. {lesson.title}</p>
                            <p className="text-xs text-foreground/60">{lesson.description || "Lesson"}</p>
                            {lesson.totalStages ? (
                              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/45">
                                {lesson.status === 'completed'
                                  ? `Completed ${lesson.totalStages}/${lesson.totalStages} stages`
                                  : lesson.status === 'in_progress'
                                    ? `Stage ${(lesson.currentStageIndex ?? 0) + 1} of ${lesson.totalStages}`
                                    : `${lesson.totalStages} stages`}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {lesson.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                            <Link href={`/lesson-overview?lessonId=${lesson.id}`}>
                              <Button size="sm" variant={lesson.status === "completed" ? "outline" : "default"}>
                                {lesson.status === "completed" ? "Review" : lesson.status === "in_progress" ? "Continue" : "Start"}
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : (
              <Card className="border border-border/50 p-6 text-sm text-foreground/70">
                No published units are available yet.
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="font-bold text-foreground">Continue Learning</h2>
            <Link href={data?.nextLesson ? `/lesson-overview?lessonId=${data.nextLesson.id}` : "/dashboard"}>
              <Card className="group cursor-pointer border border-border/50 p-6 transition-all hover:border-primary/50 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <span className="text-sm text-foreground/60">Next Lesson</span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{data?.nextLesson?.title || "No lesson available"}</h3>
                    <p className="text-sm text-foreground/70">{data?.nextLesson?.description || "You are up to date for now."}</p>
                    {data?.nextLesson?.totalStages ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary/70">
                        {data.nextLesson.progressPercent && data.nextLesson.progressPercent > 0
                          ? `Continue from stage ${(data.nextLesson.currentStageIndex ?? 0) + 1} of ${data.nextLesson.totalStages}`
                          : `${data.nextLesson.totalStages} stages`}
                      </p>
                    ) : null}
                    {data?.nextLesson?.unitTitle ? (
                      <p className="text-xs uppercase tracking-wide text-foreground/50">{data.nextLesson.unitTitle}</p>
                    ) : null}
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <ArrowRight className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </Card>
            </Link>
          </div>

          <div className="space-y-4">
            <h2 className="font-bold text-foreground">Weekly Overview</h2>
            <Card className="border border-border/50 p-6">
              <div className="space-y-4">
                {(data?.weeklyOverview || []).map((day) => (
                  <div key={day.day} className="flex items-center gap-3">
                    <div className="w-10 text-sm font-medium text-foreground">{day.day}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${day.completed ? "bg-primary" : "bg-muted"} transition-all`} style={{ width: day.completed ? "100%" : "0%" }} />
                    </div>
                    <span className="text-xs text-foreground/60">{day.completed ? `${day.minutes} min` : "-"}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

function BadgeProgress({ value }: { value: number }) {
  return (
    <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
      {value}% complete
    </div>
  );
}
