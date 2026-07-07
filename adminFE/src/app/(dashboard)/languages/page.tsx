'use client'

import { useEffect, useMemo, useState } from "react";
import { adminLanguageService } from "@/services";
import type { LanguageStatus, PublicLanguage } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { toast } from "sonner";

const STATUS_OPTIONS: Array<LanguageStatus | "all"> = ["all", "active", "hidden", "archived"];

const STATUS_BADGE_CLASS: Record<LanguageStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  hidden: "border-amber-200 bg-amber-50 text-amber-700",
  archived: "border-slate-200 bg-slate-100 text-slate-700"
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

export default function LanguagesPage() {
  const [languages, setLanguages] = useState<PublicLanguage[]>([]);
  const [statusFilter, setStatusFilter] = useState<LanguageStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<PublicLanguage | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    nativeName: "",
    status: "active" as LanguageStatus,
    orderIndex: "0",
    locale: "",
    region: ""
  });

  useEffect(() => {
    void loadLanguages(statusFilter);
  }, [statusFilter]);

  async function loadLanguages(status: LanguageStatus | "all") {
    setIsLoading(true);
    try {
      const result = await adminLanguageService.listLanguages(status);
      setLanguages(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load languages.");
    } finally {
      setIsLoading(false);
    }
  }

  function openEditor(language: PublicLanguage) {
    setEditing(language);
    setFormData({
      name: language.name,
      nativeName: language.nativeName,
      status: language.status,
      orderIndex: String(language.orderIndex),
      locale: language.locale,
      region: language.region
    });
  }

  async function handleSave() {
    if (!editing) return;

    const payload = {
      name: formData.name.trim(),
      nativeName: formData.nativeName.trim(),
      status: formData.status,
      orderIndex: Number(formData.orderIndex),
      locale: formData.locale.trim(),
      region: formData.region.trim()
    };

    if (!payload.name || !payload.nativeName || Number.isNaN(payload.orderIndex)) {
      toast.error("Provide a valid name, native name, and order index.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await adminLanguageService.updateLanguage(editing.id, payload);
      setLanguages((current) =>
        current
          .map((language) => (language.id === updated.id ? updated : language))
          .sort((a, b) => a.orderIndex - b.orderIndex)
      );
      setEditing(null);
      toast.success("Language updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update language.");
    } finally {
      setIsSaving(false);
    }
  }

  const visibleLanguages = useMemo(
    () => [...languages].sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name)),
    [languages]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Languages</h1>
          <p className="mt-2 text-muted-foreground">
            Manage language visibility and metadata. Hidden languages still appear in admin and tutor flows, while learner surfaces can stay active-only.
          </p>
        </div>

        <div className="w-full max-w-[220px] space-y-2">
          <Label htmlFor="language-status-filter">Status</Label>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as LanguageStatus | "all") }>
            <SelectTrigger id="language-status-filter">
              <SelectValue placeholder="Filter languages" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === "all" ? "All statuses" : status.charAt(0).toUpperCase() + status.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Locale</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  Loading languages...
                </TableCell>
              </TableRow>
            ) : visibleLanguages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No languages found.
                </TableCell>
              </TableRow>
            ) : (
              visibleLanguages.map((language) => (
                <TableRow key={language.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{language.name}</div>
                    <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{language.nativeName}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {language.code}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE_CLASS[language.status]}>
                      {language.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{language.orderIndex}</TableCell>
                  <TableCell>{language.locale || "-"}</TableCell>
                  <TableCell>{language.region || "-"}</TableCell>
                  <TableCell>{formatDate(language.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEditor(language)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && !isSaving && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Language</DialogTitle>
            <DialogDescription>
              Update top-level language metadata and visibility.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="language-name">Name</Label>
              <Input
                id="language-name"
                value={formData.name}
                onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="language-native-name">Native Name</Label>
              <Input
                id="language-native-name"
                value={formData.nativeName}
                onChange={(event) => setFormData((current) => ({ ...current, nativeName: event.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="language-status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData((current) => ({ ...current, status: value as LanguageStatus }))}>
                  <SelectTrigger id="language-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.filter((status) => status !== "all").map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="language-order-index">Order Index</Label>
                <Input
                  id="language-order-index"
                  inputMode="numeric"
                  value={formData.orderIndex}
                  onChange={(event) => setFormData((current) => ({ ...current, orderIndex: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="language-locale">Locale</Label>
                <Input
                  id="language-locale"
                  value={formData.locale}
                  onChange={(event) => setFormData((current) => ({ ...current, locale: event.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="language-region">Region</Label>
                <Input
                  id="language-region"
                  value={formData.region}
                  onChange={(event) => setFormData((current) => ({ ...current, region: event.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
