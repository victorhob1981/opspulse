export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function humanUnit(msAbs: number) {
  const sec = Math.round(msAbs / 1000);
  if (sec < 60) return { n: sec, unit: sec === 1 ? "seg" : "seg" };

  const min = Math.round(sec / 60);
  if (min < 60) return { n: min, unit: "min" };

  const h = Math.round(min / 60);
  if (h < 24) return { n: h, unit: h === 1 ? "hora" : "horas" };

  const d = Math.round(h / 24);
  return { n: d, unit: d === 1 ? "dia" : "dias" };
}

/**
 * Retorna "em 5 min" (futuro) ou "há 5 min" (passado)
 */
export function relativeTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const { n, unit } = humanUnit(abs);

  if (diff >= 0) return `em ${n} ${unit}`;
  return `há ${n} ${unit}`;
}

/**
 * Para next_run_at: se já passou, mostra "atrasada há X"; senão "em X".
 */
export function dueLabel(nextIso: string | null | undefined) {
  if (!nextIso) return "—";
  const d = new Date(nextIso);
  if (Number.isNaN(d.getTime())) return "—";

  if (d.getTime() <= Date.now()) return `atrasada ${relativeTime(nextIso)}`;
  return relativeTime(nextIso);
}

export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = (ms / 1000).toFixed(ms < 10000 ? 2 : 1);
  return `${s} s`;
}
