import { useEffect, useState } from "react";

export function useDeleteConfirmation(targetKey: string, unavailable: unknown) {
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  useEffect(() => { setArmedDelete(null); }, [targetKey, unavailable]);
  useEffect(() => {
    if (armedDelete === null) return;
    const timer = setTimeout(() => setArmedDelete(null), 5000);
    return () => clearTimeout(timer);
  }, [armedDelete]);
  return [armedDelete, setArmedDelete] as const;
}