'use client'

import { useEffect, useState } from "react";
import { voiceArtistService, voiceAudioService } from "@/services";
import type { VoiceArtist, VoiceAudioSubmission } from "@/types";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { DataTableControls } from "@/components/common/data-table-controls";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { activeStatusBadgeClass, reviewStatusBadgeClass } from "@/lib/status-badge";

export default function VoiceArtistsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [voiceArtists, setVoiceArtists] = useState<VoiceArtist[]>([]);
  const [submissions, setSubmissions] = useState<VoiceAudioSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [artistSearch, setArtistSearch] = useState("");
  const [artistPage, setArtistPage] = useState(1);
  const [artistLimit, setArtistLimit] = useState(20);
  const [artistTotal, setArtistTotal] = useState(0);
  const [artistTotalPages, setArtistTotalPages] = useState(1);
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionLimit, setSubmissionLimit] = useState(20);
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [submissionTotalPages, setSubmissionTotalPages] = useState(1);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [artistsData, submissionsData] = await Promise.all([
        voiceArtistService.listVoiceArtistsPage({
          status: "all",
          q: artistSearch || undefined,
          page: artistPage,
          limit: artistLimit
        }),
        voiceAudioService.listSubmissionsPage({
          status: "pending",
          q: submissionSearch || undefined,
          page: submissionPage,
          limit: submissionLimit
        })
      ]);
      setVoiceArtists(artistsData.items);
      setSubmissions(submissionsData.items);
      setArtistTotal(artistsData.total);
      setArtistTotalPages(artistsData.pagination.totalPages);
      setSubmissionTotal(submissionsData.total);
      setSubmissionTotalPages(submissionsData.pagination.totalPages);
    } catch {
      toast.error("Failed to load voice artist data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [artistPage, artistSearch, submissionPage, submissionSearch]);

  useEffect(() => {
    setArtistPage(1);
  }, [artistSearch]);

  useEffect(() => {
    setSubmissionPage(1);
  }, [submissionSearch]);

  useEffect(() => {
    const aq = searchParams.get("aq") || "";
    const ap = Number(searchParams.get("ap") || "1");
    const al = Number(searchParams.get("al") || "20");
    const sq = searchParams.get("sq") || "";
    const sp = Number(searchParams.get("sp") || "1");
    const sl = Number(searchParams.get("sl") || "20");
    setArtistSearch(aq);
    setArtistPage(Number.isInteger(ap) && ap > 0 ? ap : 1);
    setArtistLimit([10, 20, 50].includes(al) ? al : 20);
    setSubmissionSearch(sq);
    setSubmissionPage(Number.isInteger(sp) && sp > 0 ? sp : 1);
    setSubmissionLimit([10, 20, 50].includes(sl) ? sl : 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (artistSearch) params.set("aq", artistSearch);
    else params.delete("aq");
    params.set("ap", String(artistPage));
    params.set("al", String(artistLimit));
    if (submissionSearch) params.set("sq", submissionSearch);
    else params.delete("sq");
    params.set("sp", String(submissionPage));
    params.set("sl", String(submissionLimit));
    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) return;
    router.replace(`${pathname}?${nextQuery}`);
  }, [
    artistSearch,
    artistPage,
    artistLimit,
    submissionSearch,
    submissionPage,
    submissionLimit,
    pathname,
    router,
    searchParams
  ]);

  async function handleActivate(id: string) {
    try {
      await voiceArtistService.activateVoiceArtist(id);
      toast.success("Voice artist activated");
      fetchData();
    } catch {
      toast.error("Failed to activate voice artist");
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await voiceArtistService.deactivateVoiceArtist(id);
      toast.success("Voice artist deactivated");
      fetchData();
    } catch {
      toast.error("Failed to deactivate voice artist");
    }
  }

  async function handleDelete(id: string) {
    try {
      await voiceArtistService.deleteVoiceArtist(id);
      toast.success("Voice artist deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete voice artist");
    }
  }

  async function handleAccept(id: string) {
    try {
      await voiceAudioService.acceptSubmission(id);
      toast.success("Submission accepted");
      fetchData();
    } catch {
      toast.error("Failed to accept submission");
    }
  }

  async function handleReject(id: string) {
    const reason = rejectReasons[id]?.trim() || "";
    if (!reason) {
      toast.error("Rejection reason is required");
      return;
    }

    try {
      await voiceAudioService.rejectSubmission(id, reason);
      toast.success("Submission rejected");
      fetchData();
    } catch {
      toast.error("Failed to reject submission");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Voice Artists</h1>
        <p className="text-muted-foreground font-medium">Manage voice artist accounts and audio review workflow.</p>
      </div>

      <div className="rounded-2xl border p-4 bg-card">
        <p className="font-semibold">Pending Audio Reviews: {submissionTotal}</p>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 py-4 border-b font-bold">Voice Artist Accounts</div>
        <div className="px-6 pt-4">
          <DataTableControls
            search={artistSearch}
            onSearchChange={setArtistSearch}
            page={artistPage}
            limit={artistLimit}
            onLimitChange={(value) => {
              setArtistLimit(value);
              setArtistPage(1);
            }}
            totalPages={artistTotalPages}
            total={artistTotal}
            label="Search voice artists"
            onPrev={() => setArtistPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setArtistPage((prev) => Math.min(artistTotalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary pl-8">Email</TableHead>
              <TableHead className="font-bold text-primary">Display Name</TableHead>
              <TableHead className="font-bold text-primary">Language</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : voiceArtists.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">No voice artists found.</TableCell>
              </TableRow>
            ) : (
              voiceArtists.map((artist) => (
                <TableRow key={artist.id} className="group transition-colors hover:bg-secondary/30">
                  <TableCell className="pl-8 font-bold text-foreground">{artist.email}</TableCell>
                  <TableCell>{artist.displayName || "-"}</TableCell>
                  <TableCell className="capitalize">{artist.language}</TableCell>
                  <TableCell>
                    <Badge className={artist.isActive ? activeStatusBadgeClass("active") : reviewStatusBadgeClass("pending")}>
                      {artist.isActive ? "active" : "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-8 text-right space-x-2">
                    {artist.isActive ? (
                      <Button variant="outline" size="sm" onClick={() => handleDeactivate(artist.id)}>
                        Deactivate
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => handleActivate(artist.id)}>
                        Activate
                      </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(artist.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 py-4 border-b font-bold">Pending Audio Submissions</div>
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
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary pl-8">Phrase</TableHead>
              <TableHead className="font-bold text-primary">Voice Artist</TableHead>
              <TableHead className="font-bold text-primary">Language</TableHead>
              <TableHead className="font-bold text-primary">Audio</TableHead>
              <TableHead className="font-bold text-primary">Reject Reason</TableHead>
              <TableHead className="text-right font-bold text-primary pr-8">Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : submissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">No pending submissions.</TableCell>
              </TableRow>
            ) : (
              submissions.map((submission) => (
                <TableRow key={submission.id} className="group transition-colors hover:bg-secondary/30">
                  <TableCell className="pl-8">
                    <div className="font-semibold">{submission.phrase?.text || "-"}</div>
                    <div className="text-xs text-muted-foreground">{submission.phrase?.translation || ""}</div>
                  </TableCell>
                  <TableCell>{submission.voiceArtist?.email || "-"}</TableCell>
                  <TableCell className="capitalize">{submission.language}</TableCell>
                  <TableCell>
                    <a className="text-primary underline" href={submission.audio?.url || "#"} target="_blank" rel="noreferrer">
                      Play
                    </a>
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Reason to retake"
                      value={rejectReasons[submission.id] || ""}
                      onChange={(event) =>
                        setRejectReasons((prev) => ({ ...prev, [submission.id]: event.target.value }))
                      }
                    />
                  </TableCell>
                  <TableCell className="pr-8 text-right space-x-2">
                    <Button size="sm" onClick={() => handleAccept(submission.id)}>Accept</Button>
                    <Button variant="destructive" size="sm" onClick={() => handleReject(submission.id)}>
                      Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
