'use client'

import { useEffect, useState } from "react"
import { tutorService } from "@/services"
import { Tutor } from "@/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle, ShieldX, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DataTableControls } from "@/components/common/data-table-controls"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

type TutorStatusFilter = "all" | "active" | "pending"

export default function TutorsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [tutors, setTutors] = useState<Tutor[]>([])
  const [filter, setFilter] = useState<TutorStatusFilter>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchTutors(filter)
  }, [filter, page, search])

  useEffect(() => {
    setPage(1)
  }, [filter, search])

  useEffect(() => {
    const q = searchParams.get("q") || ""
    const qPage = Number(searchParams.get("page") || "1")
    const qLimit = Number(searchParams.get("limit") || "20")
    const qStatus = searchParams.get("status")
    setSearch(q)
    setPage(Number.isInteger(qPage) && qPage > 0 ? qPage : 1)
    setLimit([10, 20, 50].includes(qLimit) ? qLimit : 20)
    if (qStatus === "all" || qStatus === "active" || qStatus === "pending") {
      setFilter(qStatus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("status", filter)
    if (search) params.set("q", search)
    else params.delete("q")
    params.set("page", String(page))
    params.set("limit", String(limit))
    const nextQuery = params.toString()
    if (nextQuery === searchParams.toString()) return
    router.replace(`${pathname}?${nextQuery}`)
  }, [filter, search, page, limit, pathname, router, searchParams])

  async function fetchTutors(status: TutorStatusFilter) {
    setIsLoading(true)
    try {
      const data = await tutorService.listTutorsPage({
        status,
        q: search || undefined,
        page,
        limit
      })
      setTutors(data.items)
      setTotal(data.total)
      setTotalPages(data.pagination.totalPages)
    } catch {
      toast.error("Failed to fetch tutors")
    } finally {
      setIsLoading(false)
    }
  }

  async function handleActivate(id: string) {
    try {
      await tutorService.activateTutor(id)
      toast.success("Tutor activated")
      fetchTutors(filter)
    } catch {
      toast.error("Failed to activate tutor")
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await tutorService.deactivateTutor(id)
      toast.success("Tutor deactivated")
      fetchTutors(filter)
    } catch {
      toast.error("Failed to deactivate tutor")
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tutor account permanently?")) return

    try {
      await tutorService.deleteTutor(id)
      toast.success("Tutor deleted")
      fetchTutors(filter)
    } catch {
      toast.error("Failed to delete tutor")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tutors</h1>
          <p className="text-sm text-muted-foreground">Approve, suspend, and manage tutor accounts.</p>
        </div>
        <div className="w-[220px]">
          <Select value={filter} onValueChange={(v) => setFilter(v as TutorStatusFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tutors</SelectItem>
              <SelectItem value="pending">Pending Activation</SelectItem>
              <SelectItem value="active">Active</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-white">
        <div className="px-6 pt-6">
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
            label="Search tutors"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : tutors.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">No tutors found.</TableCell>
              </TableRow>
            ) : (
              tutors.map((tutor) => (
                <TableRow key={tutor.id}>
                  <TableCell className="font-medium">{tutor.email}</TableCell>
                  <TableCell>{tutor.displayName || "-"}</TableCell>
                  <TableCell className="capitalize">{tutor.language}</TableCell>
                  <TableCell>
                    <Badge variant={tutor.isActive ? "default" : "secondary"}>
                      {tutor.isActive ? "active" : "pending"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tutor.createdAt ? new Date(tutor.createdAt).toLocaleDateString() : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {tutor.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Deactivate tutor"
                          onClick={() => handleDeactivate(tutor.id)}
                        >
                          <ShieldX className="h-4 w-4 text-amber-600" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Activate tutor"
                          onClick={() => handleActivate(tutor.id)}
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete tutor"
                        onClick={() => handleDelete(tutor.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
