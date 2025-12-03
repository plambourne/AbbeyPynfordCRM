import { useEffect, useState } from "react";

export function useMonthlyTargets(fyYearStart: string) {
  const [targets, setTargets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fyYearStart) return;

    const load = async () => {
      setLoading(true);
      const res = await fetch(`/api/targets/get?fy=${fyYearStart}`);
      const json = await res.json();
      setTargets(json);
      setLoading(false);
    };

    load();
  }, [fyYearStart]);

  return { targets, loading, setTargets };
}
