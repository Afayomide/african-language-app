'use client'

import { useEffect, useState } from "react"
import { tutorVoiceAudioService } from "@/services"
import { VoiceAudioSubmission } from "@/types"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTableControls } from "@/components/common/data-table-controls"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export default function TutorVoiceAudioPage() {
  const [items, setItems] = useState<VoiceAudioSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "accepted" | "rejected">("pending")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  async function fetchSubmissions() {
    setIsLoading(true)
    try {
      const data = await tutorVoiceAudioService.listSubmissions({
        status: statusFilter === "all" ? undefined : statusFilter,
        q: search || undefined,
        page,
        limit
      })
      setItems(data.items)
      setTotal(data.total)
      setTotalPages(data.pagination.totalPages)
    } catch {
      toast.error("Failed to load submissions")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSubmissions()
  }, [statusFilter, search, page, limit])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, search])

  async function handleAccept(id: string) {
    try {
      await tutorVoiceAudioService.acceptSubmission(id)
      toast.success("Submission accepted")
      fetchSubmissions()
    } catch {
      toast.error("Failed to accept submission")
    }
  }

  async function submitReject() {
    if (!rejectingId) return
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required")
      return
    }

    try {
      await tutorVoiceAudioService.rejectSubmission(rejectingId, rejectReason.trim())
      toast.success("Submission rejected")
      setRejectingId(null)
      setRejectReason("")
      fetchSubmissions()
    } catch {
      toast.error("Failed to reject submission")
    }
  }

  function playAudio(url: string) {
    const audio = new Audio(url)
    void audio.play().catch(() => toast.error("Unable to play audio"))
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-black">Voice Audio Review</h1>

      <Card>
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-3">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "pending" | "accepted" | "rejected")}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTableControls
            search={search}
            onSearchChange={setSearch}
            page={page}
            limit={limit}
            onLimitChange={(value) => {
              setLimit(value)
              setPage(1)
            }}
            totalPages={totalPages}
            total={total}
            label="Search submissions"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phrase</TableHead>
                <TableHead>Meaning</TableHead>
                <TableHead>Voice Artist</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>Loading...</TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>No submissions found.</TableCell>
                </TableRow>
              ) : (
                items.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>{submission.phrase?.text || "-"}</TableCell>
                    <TableCell>{submission.phrase?.translation || "-"}</TableCell>
                    <TableCell>{submission.voiceArtist?.email || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={submission.status === "accepted" ? "default" : submission.status === "rejected" ? "destructive" : "secondary"}>
                        {submission.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(submission.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => playAudio(submission.audio.url)}>
                        Play
                      </Button>
                      {submission.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => handleAccept(submission.id)}>
                            Accept
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setRejectingId(submission.id)
                              setRejectReason("")
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(rejectingId)} onOpenChange={(open) => {
        if (!open) {
          setRejectingId(null)
          setRejectReason("")
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
            <DialogDescription>Provide feedback for the voice artist.</DialogDescription>
          </DialogHeader>
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={submitReject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
