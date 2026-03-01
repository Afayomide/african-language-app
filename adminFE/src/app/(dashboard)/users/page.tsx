'use client'

import { useEffect, useState } from "react"
import { userService } from "@/services"
import type { AdminUserRecord, Language, UserRole } from "@/types"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { DataTableControls } from "@/components/common/data-table-controls"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { activeStatusBadgeClass } from "@/lib/status-badge"

type RoleFilter = "all" | UserRole

type ModalState = {
  open: boolean
  mode: "assign" | "activate" | "deactivate"
  userId: string
  role: UserRole
  language: Language
}

function getRoleStatus(user: AdminUserRecord, role: UserRole) {
  if (role === "tutor") {
    if (!user.roles.includes("tutor")) return "inactive"
    return user.tutorProfile?.isActive ? "active" : "pending"
  }
  if (role === "voice_artist") {
    if (!user.roles.includes("voice_artist")) return "inactive"
    return user.voiceArtistProfile?.isActive ? "active" : "pending"
  }
  return user.roles.includes(role) ? "active" : "inactive"
}

export default function UsersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [filter, setFilter] = useState<RoleFilter>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [modal, setModal] = useState<ModalState>({
    open: false,
    mode: "assign",
    userId: "",
    role: "admin",
    language: "yoruba"
  })

  useEffect(() => {
    fetchUsers()
  }, [filter, page, limit, search])

  useEffect(() => {
    const q = searchParams.get("q") || ""
    const qPage = Number(searchParams.get("page") || "1")
    const qLimit = Number(searchParams.get("limit") || "20")
    const qRole = searchParams.get("role")
    setSearch(q)
    setPage(Number.isInteger(qPage) && qPage > 0 ? qPage : 1)
    setLimit([10, 20, 50].includes(qLimit) ? qLimit : 20)
    if (qRole === "all" || qRole === "admin" || qRole === "learner" || qRole === "tutor" || qRole === "voice_artist") {
      setFilter(qRole)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("role", filter)
    if (search) params.set("q", search)
    else params.delete("q")
    params.set("page", String(page))
    params.set("limit", String(limit))
    const nextQuery = params.toString()
    if (nextQuery === searchParams.toString()) return
    router.replace(`${pathname}?${nextQuery}`)
  }, [filter, search, page, limit, pathname, router, searchParams])

  async function fetchUsers() {
    setIsLoading(true)
    try {
      const data = await userService.listUsersPage({
        role: filter,
        q: search || undefined,
        page,
        limit
      })
      setUsers(data.items)
      setTotal(data.total)
      setTotalPages(data.pagination.totalPages)
    } catch {
      toast.error("Failed to fetch users")
    } finally {
      setIsLoading(false)
    }
  }

  function openModal(mode: ModalState["mode"], user: AdminUserRecord) {
    setModal({
      open: true,
      mode,
      userId: user.id,
      role: user.roles.includes("tutor") ? "tutor" : "admin",
      language: user.tutorProfile?.language || user.voiceArtistProfile?.language || "yoruba"
    })
  }

  async function submitModal() {
    try {
      if (modal.mode === "assign") {
        await userService.assignUserRole(modal.userId, {
          role: modal.role,
          language: modal.role === "tutor" || modal.role === "voice_artist" ? modal.language : undefined
        })
        toast.success(`Assigned role: ${modal.role}`)
      } else if (modal.mode === "activate") {
        await userService.activateUser(modal.userId, {
          role: modal.role,
          language: modal.role === "tutor" || modal.role === "voice_artist" ? modal.language : undefined
        })
        toast.success(`Activated as ${modal.role}`)
      } else {
        await userService.deactivateUser(modal.userId, { role: modal.role })
        toast.success(`Deactivated as ${modal.role}`)
      }
      setModal((prev) => ({ ...prev, open: false }))
      fetchUsers()
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response!.data!.error!
          : "Request failed"
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">Manage roles and role-based activation from one page.</p>
        </div>
        <div className="w-[220px]">
          <Select value={filter} onValueChange={(v) => {
            setFilter(v as RoleFilter)
            setPage(1)
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Filter role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="learner">Learner</SelectItem>
              <SelectItem value="tutor">Tutor</SelectItem>
              <SelectItem value="voice_artist">Voice Artist</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 pt-6">
          <DataTableControls
            search={search}
            onSearchChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
            page={page}
            limit={limit}
            onLimitChange={(value) => {
              setLimit(value)
              setPage(1)
            }}
            totalPages={totalPages}
            total={total}
            label="Search users by email"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary pl-8">Email</TableHead>
              <TableHead className="font-bold text-primary">Roles</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="font-bold text-primary">Created</TableHead>
              <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">No users found.</TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} className="group transition-colors hover:bg-secondary/30">
                  <TableCell className="pl-8 font-bold text-foreground">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {user.roles.map((role) => (
                        <Badge key={`${user.id}-${role}`} variant="secondary">{role}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge className={activeStatusBadgeClass(getRoleStatus(user, "admin"))}>
                        admin: {getRoleStatus(user, "admin")}
                      </Badge>
                      <Badge className={activeStatusBadgeClass(getRoleStatus(user, "learner"))}>
                        learner: {getRoleStatus(user, "learner")}
                      </Badge>
                      <Badge className={activeStatusBadgeClass(getRoleStatus(user, "tutor"))}>
                        tutor: {getRoleStatus(user, "tutor")}
                      </Badge>
                      <Badge className={activeStatusBadgeClass(getRoleStatus(user, "voice_artist"))}>
                        voice artist: {getRoleStatus(user, "voice_artist")}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openModal("assign", user)}>
                        Assign Role
                      </Button>
                      <Button size="sm" onClick={() => openModal("activate", user)}>
                        Activate Role
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => openModal("deactivate", user)}>
                        Deactivate Role
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modal.open} onOpenChange={(open) => setModal((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal.mode === "assign" ? "Assign Role" : modal.mode === "activate" ? "Activate Role" : "Deactivate Role"}
            </DialogTitle>
            <DialogDescription>
              Choose a role and save this action.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <div className="mb-1 text-sm text-muted-foreground">Role</div>
              <Select value={modal.role} onValueChange={(value) => setModal((prev) => ({ ...prev, role: value as UserRole }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="learner">Learner</SelectItem>
                  <SelectItem value="tutor">Tutor</SelectItem>
                  <SelectItem value="voice_artist">Voice Artist</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(modal.role === "tutor" || modal.role === "voice_artist") && (
              <div>
                <div className="mb-1 text-sm text-muted-foreground">Language</div>
                <Select value={modal.language} onValueChange={(value) => setModal((prev) => ({ ...prev, language: value as Language }))}>
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
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModal((prev) => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button onClick={submitModal}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
