export type WorkflowStatus = "draft" | "finished" | "published"
export type ReviewStatus = "pending" | "accepted" | "rejected"
export type ActiveStatus = "active" | "inactive"

export function workflowStatusBadgeClass(status: string) {
  if (status === "published") return "bg-green-500 text-white hover:bg-green-600"
  if (status === "finished") return "bg-amber-500 text-white hover:bg-amber-600"
  return "bg-zinc-400 text-white hover:bg-zinc-500"
}

export function reviewStatusBadgeClass(status: string) {
  if (status === "accepted") return "bg-green-500 text-white hover:bg-green-600"
  if (status === "rejected") return "bg-red-500 text-white hover:bg-red-600"
  return "bg-amber-500 text-white hover:bg-amber-600"
}

export function activeStatusBadgeClass(status: string) {
  if (status === "active") return "bg-green-500 text-white hover:bg-green-600"
  return "bg-zinc-400 text-white hover:bg-zinc-500"
}
