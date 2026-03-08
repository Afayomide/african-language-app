export const TABLE_ACTION_ICON_CLASS = {
  edit: "rounded-full transition-colors hover:bg-primary/10 hover:text-primary",
  view: "rounded-full transition-colors hover:bg-slate-100 hover:text-slate-700",
  play: "rounded-full transition-colors hover:bg-blue-100 hover:text-blue-600",
  finish: "rounded-full transition-colors hover:bg-amber-100 hover:text-amber-600",
  publish: "rounded-full transition-colors hover:bg-green-100 hover:text-green-600",
  delete: "rounded-full transition-colors hover:bg-red-100 hover:text-red-600",
  sendBack: "rounded-full transition-colors hover:bg-amber-100 hover:text-amber-600"
} as const;

export const TABLE_BULK_BUTTON_CLASS = {
  delete: "h-11 rounded-xl border-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700",
  finish: "h-11 rounded-xl border-2 border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-700",
  publish: "h-11 rounded-xl border-2 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-700"
} as const;
