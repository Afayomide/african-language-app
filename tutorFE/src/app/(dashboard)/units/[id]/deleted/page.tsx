'use client'

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { unitService } from "@/services";
import type { Expression, Lesson, Unit } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TABLE_ACTION_ICON_CLASS } from "@/lib/tableActionStyles";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function renderBlockSummary(lesson: Lesson) {
  return lesson.stages.reduce((count, stage) => count + stage.blocks.length, 0);
}

export default function UnitDeletedEntriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [lessonSearch, setLessonSearch] = useState("");
  const [expressionSearch, setExpressionSearch] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedExpression, setSelectedExpression] = useState<Expression | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringLessonId, setRestoringLessonId] = useState<string | null>(null);
  const [restoringExpressionId, setRestoringExpressionId] = useState<string | null>(null);

  async function loadPage() {
    setIsLoading(true);
    try {
      const [unitData, deletedEntries] = await Promise.all([
        unitService.getUnit(id),
        unitService.getDeletedEntries(id)
      ]);
      setUnit(unitData);
      setLessons(deletedEntries.lessons || []);
      setExpressions(deletedEntries.expressions || []);
    } catch {
      toast.error("Failed to load deleted entries.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, [id]);

  const filteredLessons = useMemo(() => {
    const query = lessonSearch.trim().toLowerCase();
    if (!query) return lessons;
    return lessons.filter((lesson) =>
      [lesson.title, lesson.description, ...(lesson.topics || [])].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [lessons, lessonSearch]);

  const filteredExpressions = useMemo(() => {
    const query = expressionSearch.trim().toLowerCase();
    if (!query) return expressions;
    return expressions.filter((expression) =>
      [expression.text, ...(expression.translations || [])].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [expressions, expressionSearch]);

  async function handleRestoreLesson(lessonId: string) {
    try {
      setRestoringLessonId(lessonId);
      await unitService.restoreDeletedLesson(id, lessonId);
      toast.success("Lesson restored.");
      await loadPage();
    } catch {
      toast.error("Failed to restore lesson.");
    } finally {
      setRestoringLessonId(null);
    }
  }

  async function handleRestoreExpression(expressionId: string) {
    try {
      setRestoringExpressionId(expressionId);
      await unitService.restoreDeletedExpression(id, expressionId);
      toast.success("Expression restored.");
      await loadPage();
    } catch {
      toast.error("Failed to restore expression.");
    } finally {
      setRestoringExpressionId(null);
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">Loading deleted entries...</div>;
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" className="px-0 text-muted-foreground hover:text-foreground">
            <Link href={`/units/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Unit
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Deleted Entries</h1>
            <p className="text-muted-foreground">
              Review and recover deleted lessons and expressions for {unit?.title || "this unit"}.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{lessons.length} deleted lessons</Badge>
          <Badge variant="secondary">{expressions.length} deleted expressions</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Deleted Lessons</CardTitle>
            <Input
              value={lessonSearch}
              onChange={(event) => setLessonSearch(event.target.value)}
              placeholder="Search deleted lessons"
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredLessons.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
              No deleted lessons found for this unit.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead>Blocks</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLessons.map((lesson) => (
                  <TableRow key={lesson._id}>
                    <TableCell className="font-medium">{lesson.title}</TableCell>
                    <TableCell>{lesson.stages.length}</TableCell>
                    <TableCell>{renderBlockSummary(lesson)}</TableCell>
                    <TableCell>{formatDate(lesson.deletedAt)}</TableCell>
                    <TableCell>{formatDate(lesson.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={TABLE_ACTION_ICON_CLASS.view}
                          onClick={() => setSelectedLesson(lesson)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={TABLE_ACTION_ICON_CLASS.finish}
                          disabled={restoringLessonId === lesson._id}
                          onClick={() => void handleRestoreLesson(lesson._id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Deleted Expressions</CardTitle>
            <Input
              value={expressionSearch}
              onChange={(event) => setExpressionSearch(event.target.value)}
              placeholder="Search deleted expressions"
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredExpressions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
              No deleted expressions found for this unit.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Text</TableHead>
                  <TableHead>Translations</TableHead>
                  <TableHead>Linked Lessons</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpressions.map((expression) => (
                  <TableRow key={expression._id}>
                    <TableCell className="font-medium">{expression.text}</TableCell>
                    <TableCell>{expression.translations.join(", ") || "—"}</TableCell>
                    <TableCell>{expression.lessonIds.length}</TableCell>
                    <TableCell>{formatDate(expression.deletedAt)}</TableCell>
                    <TableCell>{formatDate(expression.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={TABLE_ACTION_ICON_CLASS.view}
                          onClick={() => setSelectedExpression(expression)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className={TABLE_ACTION_ICON_CLASS.finish}
                          disabled={restoringExpressionId === expression._id}
                          onClick={() => void handleRestoreExpression(expression._id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedLesson)} onOpenChange={(open) => !open && setSelectedLesson(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedLesson?.title}</DialogTitle>
          </DialogHeader>
          {selectedLesson ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Description</p>
                <p>{selectedLesson.description || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Topics</p>
                <p>{selectedLesson.topics.length > 0 ? selectedLesson.topics.join(", ") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Stages</p>
                <div className="space-y-3">
                  {selectedLesson.stages.map((stage) => (
                    <div key={stage.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{stage.title || "Untitled Stage"}</p>
                        <Badge variant="secondary">{stage.blocks.length} blocks</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{stage.description || "No description."}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedExpression)} onOpenChange={(open) => !open && setSelectedExpression(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedExpression?.text}</DialogTitle>
          </DialogHeader>
          {selectedExpression ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Translations</p>
                <p>{selectedExpression.translations.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pronunciation</p>
                <p>{selectedExpression.pronunciation || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Explanation</p>
                <p>{selectedExpression.explanation || "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Linked lessons</p>
                  <p>{selectedExpression.lessonIds.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Audio</p>
                  <p>{selectedExpression.audio.url ? "Available" : "Missing"}</p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
