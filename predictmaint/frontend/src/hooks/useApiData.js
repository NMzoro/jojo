import { useCallback, useEffect, useRef, useState } from "react";

/** Chargement API avec rechargement manuel, sans boucle d'effet. */
export function useApiData(loader, deps = []) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loaderRef.current();
      setData(result);
      setError(null);
      return result;
    } catch (exc) {
      setError(exc instanceof Error ? exc : new Error(String(exc)));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loaderRef
      .current()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((exc) => {
        if (!active) return;
        setError(exc instanceof Error ? exc : new Error(String(exc)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}
