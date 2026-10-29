import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/*
 * Background uploads. A job keeps running while you browse other pages (the provider lives above the
 * router outlet), shows progress in the upload tray, and tells the rest of the app when it finishes.
 * Closing or reloading the tab stops it, so the browser asks for confirmation while something uploads.
 */
const UploadContext = createContext({ jobs: [], start: () => {}, retry: () => {}, dismiss: () => {} });

let seq = 0;

export function UploadProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const registry = useRef(new Map()); // id -> job (with its run function) for retries

  const patch = useCallback((id, p) => setJobs((list) => list.map((j) => (j.id === id ? { ...j, ...p } : j))), []);
  const dismiss = useCallback((id) => {
    registry.current.delete(id);
    setJobs((list) => list.filter((j) => j.id !== id));
  }, []);

  const execute = useCallback(
    async (job) => {
      patch(job.id, { status: 'uploading', progress: 0, error: '' });
      try {
        const item = await job.run((p) => patch(job.id, { progress: p, status: p >= 1 ? 'processing' : 'uploading' }));
        patch(job.id, { status: 'done', progress: 1, item });
        if (job.kind === 'story') window.dispatchEvent(new CustomEvent('lumora:story-created'));
        else window.dispatchEvent(new CustomEvent('lumora:post-created', { detail: item })); // posts and reels
        setTimeout(() => dismiss(job.id), 9000);
      } catch (e) {
        patch(job.id, { status: 'error', error: e.message || 'Upload failed' });
      }
    },
    [patch, dismiss]
  );

  /** job = { kind: 'post' | 'story' | 'reel', label, run(onProgress) -> Promise<item> } */
  const start = useCallback(
    (job) => {
      seq += 1;
      const full = { ...job, id: `up${seq}` };
      registry.current.set(full.id, full);
      setJobs((list) => [...list, { id: full.id, kind: full.kind, label: full.label, status: 'uploading', progress: 0, error: '' }]);
      execute(full);
    },
    [execute]
  );

  const retry = useCallback(
    (id) => {
      const job = registry.current.get(id);
      if (job) execute(job);
    },
    [execute]
  );

  const busy = jobs.some((j) => j.status === 'uploading' || j.status === 'processing');
  useEffect(() => {
    if (!busy) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  return <UploadContext.Provider value={{ jobs, start, retry, dismiss }}>{children}</UploadContext.Provider>;
}

export const useUploads = () => useContext(UploadContext);