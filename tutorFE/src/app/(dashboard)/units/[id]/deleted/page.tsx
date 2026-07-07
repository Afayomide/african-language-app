'use client'

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { unitService } from "@/services";
import type { Expression, Lesson, Proverb, Sentence, Unit, Word } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TABLE_ACTION_ICON_CLASS } from "@/lib/tableActionStyles";

type DeletedContentKind = "word" | "expression" | "sentence" | "proverb";
type DeletedContent = Word | Expression | Sentence | Proverb;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function renderBlockSummary(lesson: Lesson) {
  return lesson.stages.reduce((count, stage) => count + stage.blocks.length, 0);
}

function getId(item: { _id?: string; id?: string }) {
  return String(item._id || item.id || "");
}

function getMeaning(item: DeletedContent) {
  if ("translations" in item) return item.translations.join(", ") || "—";
  return item.translation || "—";
}

function getSearchText(item: DeletedContent) {
  const values = [
    item.text,
    getMeaning(item),
    "explanation" in item ? item.explanation : "",
    "contextNote" in item ? item.contextNote : "",
    "literalTranslation" in item ? item.literalTranslation : "",
    "usageNotes" in item ? item.usageNotes : ""
  ];
  return values.join(" ").toLowerCase();
}

function getLinkedLessonCount(item: DeletedContent) {
  return Array.isArray(item.lessonIds) ? item.lessonIds.length : 0;
}

function getKindLabel(kind: DeletedContentKind) {
  if (kind === "word") return "Word";
  if (kind === "expression") return "Expression";
  if (kind === "sentence") return "Sentence";
  return "Proverb";
}

export default function UnitDeletedEntriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [proverbs, setProverbs] = useState<Proverb[]>([]);
  const [lessonSearch, setLessonSearch] = useState("");
  const [contentSearch, setContentSearch] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedContent, setSelectedContent] = useState<{ kind: DeletedContentKind; item: DeletedContent } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringLessonId, setRestoringLessonId] = useState<string | null>(null);
  const [restoringContentKey, setRestoringContentKey] = useState<string | null>(null);

  async function loadPage() {
    setIsLoading(true);
    try {
      const [unitData, deletedEntries] = await Promise.all([
        unitService.getUnit(id),
        unitService.getDeletedEntries(id)
      ]);
      setUnit(unitData);
      setLessons(deletedEntries.lessons || []);
      setWords(deletedEntries.words || []);
      setExpressions(deletedEntries.expressions || []);
      setSentences(deletedEntries.sentences || []);
      setProverbs(deletedEntries.proverbs || []);
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

  const filteredContent = useMemo(() => {
    const query = contentSearch.trim().toLowerCase();
    const filter = <T extends DeletedContent>(items: T[]) =>
      query ? items.filter((item) => getSearchText(item).includes(query)) : items;

    return {
      words: filter(words),
      expressions: filter(expressions),
      sentences: filter(sentences),
      proverbs: filter(proverbs)
    };
  }, [words, expressions, sentences, proverbs, contentSearch]);

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

  async function handleRestoreContent(kind: DeletedContentKind, contentId: string) {
    const key = `${kind}:${contentId}`;
    try {
      setRestoringContentKey(key);
      if (kind === "word") await unitService.restoreDeletedWord(id, contentId);
      if (kind === "expression") await unitService.restoreDeletedExpression(id, contentId);
      if (kind === "sentence") await unitService.restoreDeletedSentence(id, contentId);
      if (kind === "proverb") await unitService.restoreDeletedProverb(id, contentId);
      toast.success(`${getKindLabel(kind)} restored.`);
      await loadPage();
    } catch {
      toast.error(`Failed to restore ${kind}.`);
    } finally {
      setRestoringContentKey(null);
    }
  }

  function renderContentTable(kind: DeletedContentKind, title: string, items: DeletedContent[]) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{title}</CardTitle>
            <Badge variant="secondary">{items.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
              No deleted {kind}s found for this unit.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Text</TableHead>
                  <TableHead>Meaning</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Linked Lessons</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const itemId = getId(item);
                  const restoreKey = `${kind}:${itemId}`;
                  return (
                    <TableRow key={itemId}>
                      <TableCell className="font-medium">{item.text}</TableCell>
                      <TableCell>{getMeaning(item)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
                      <TableCell>{getLinkedLessonCount(item)}</TableCell>
                      <TableCell>{formatDate(item.deletedAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className={TABLE_ACTION_ICON_CLASS.view}
                            onClick={() => setSelectedContent({ kind, item })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className={TABLE_ACTION_ICON_CLASS.finish}
                            disabled={restoringContentKey === restoreKey}
                            onClick={() => void handleRestoreContent(kind, itemId)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
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
              Review and recover deleted lessons and content for {unit?.title || "this unit"}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{lessons.length} lessons</Badge>
          <Badge variant="secondary">{words.length} words</Badge>
          <Badge variant="secondary">{expressions.length} expressions</Badge>
          <Badge variant="secondary">{sentences.length} sentences</Badge>
          <Badge variant="secondary">{proverbs.length} proverbs</Badge>
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

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Deleted Content</h2>
            <p className="text-sm text-muted-foreground">Words, expressions, sentences, and proverbs referenced by this unit.</p>
          </div>
          <Input
            value={contentSearch}
            onChange={(event) => setContentSearch(event.target.value)}
            placeholder="Search deleted content"
            className="max-w-sm"
          />
        </div>
        {renderContentTable("word", "Deleted Words", filteredContent.words)}
        {renderContentTable("expression", "Deleted Expressions", filteredContent.expressions)}
        {renderContentTable("sentence", "Deleted Sentences", filteredContent.sentences)}
        {renderContentTable("proverb", "Deleted Proverbs", filteredContent.proverbs)}
      </div>

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

      <Dialog open={Boolean(selectedContent)} onOpenChange={(open) => !open && setSelectedContent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedContent ? `${getKindLabel(selectedContent.kind)}: ${selectedContent.item.text}` : "Content"}</DialogTitle>
          </DialogHeader>
          {selectedContent ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Meaning</p>
                <p>{getMeaning(selectedContent.item)}</p>
              </div>
              {"pronunciation" in selectedContent.item ? (
                <div>
                  <p className="text-muted-foreground">Pronunciation</p>
                  <p>{selectedContent.item.pronunciation || "—"}</p>
                </div>
              ) : null}
              {"explanation" in selectedContent.item ? (
                <div>
                  <p className="text-muted-foreground">Explanation</p>
                  <p>{selectedContent.item.explanation || "—"}</p>
                </div>
              ) : null}
              {"literalTranslation" in selectedContent.item ? (
                <div>
                  <p className="text-muted-foreground">Literal Translation</p>
                  <p>{selectedContent.item.literalTranslation || "—"}</p>
                </div>
              ) : null}
              {"usageNotes" in selectedContent.item ? (
                <div>
                  <p className="text-muted-foreground">Usage Notes</p>
                  <p>{selectedContent.item.usageNotes || "—"}</p>
                </div>
              ) : null}
              {"contextNote" in selectedContent.item ? (
                <div>
                  <p className="text-muted-foreground">Context Note</p>
                  <p>{selectedContent.item.contextNote || "—"}</p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Linked lessons</p>
                  <p>{getLinkedLessonCount(selectedContent.item)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Deleted</p>
                  <p>{formatDate(selectedContent.item.deletedAt)}</p>
                </div>
                {"audio" in selectedContent.item ? (
                  <div>
                    <p className="text-muted-foreground">Audio</p>
                    <p>{selectedContent.item.audio.url ? "Available" : "Missing"}</p>
                  </div>
                ) : null}
                {"components" in selectedContent.item ? (
                  <div>
                    <p className="text-muted-foreground">Components</p>
                    <p>{selectedContent.item.components?.length || 0}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
