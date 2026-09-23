import React, { createContext, useContext, useCallback, useMemo, useRef, useState } from "react";

export type UploadTaskStatus = "uploading" | "processing" | "done" | "error";

export type UploadTask = {
  id: string;
  label: string;
  progress: number;
  status: UploadTaskStatus;
};

export type UploadHandle = {
  id: string;
  update: (progress: number) => void;
  setProcessing: (label?: string) => void;
  finish: () => void;
  fail: () => void;
};

type UploadContextValue = {
  tasks: UploadTask[];
  track: (label: string) => UploadHandle;
  dismiss: (id: string) => void;
};

const UploadContext = createContext<UploadContextValue>({
  tasks: [],
  track: () => ({ id: "", update: () => {}, setProcessing: () => {}, finish: () => {}, fail: () => {} }),
  dismiss: () => {},
});

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleRemoval = useCallback((id: string) => {
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => {
      removeTask(id);
      delete timersRef.current[id];
    }, 4000);
  }, [removeTask]);

  const patchTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const track = useCallback((label: string): UploadHandle => {
    const id = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setTasks((prev) => [...prev, { id, label, progress: 0, status: "uploading" }]);
    return {
      id,
      update: (progress: number) => {
        if (timersRef.current[id]) return; // finished already
        patchTask(id, { progress: Math.max(0, Math.min(100, Math.round(progress))) });
      },
      setProcessing: (newLabel?: string) => {
        if (timersRef.current[id]) return;
        patchTask(id, { status: "processing", progress: 100, ...(newLabel ? { label: newLabel } : {}) });
      },
      finish: () => {
        if (timersRef.current[id]) return;
        patchTask(id, { status: "done", progress: 100 });
        scheduleRemoval(id);
      },
      fail: () => {
        if (timersRef.current[id]) return;
        patchTask(id, { status: "error", progress: 100 });
        scheduleRemoval(id);
      },
    };
  }, [patchTask, scheduleRemoval]);

  const dismiss = useCallback((id: string) => {
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    removeTask(id);
  }, [removeTask]);

  const value = useMemo(() => ({ tasks, track, dismiss }), [tasks, track, dismiss]);

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export const useUploads = () => useContext(UploadContext);
