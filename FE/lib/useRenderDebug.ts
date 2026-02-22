import { useEffect, useRef } from "react";

export function useRenderDebug(name: string) {
  const countRef = useRef(0);
  countRef.current += 1;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.debug(`[render] ${name} #${countRef.current}`);
  });
}
