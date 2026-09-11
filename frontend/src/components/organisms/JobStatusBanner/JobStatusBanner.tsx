import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import styles from './JobStatusBanner.module.css';

const WORKER = 'https://gap-analyzer-worker.agrolepra.workers.dev';
// Polling adaptativo. Con 5s fijos, una sola pestaña abierta generaba ~34.500
// requests por día (el preflight CORS duplica cada consulta) y el plan gratuito de
// Workers permite 100.000 diarios — al agotarse, Cloudflare deja de ejecutar el
// Worker, cron incluido, y el pipeline se congela hasta el reset del día siguiente.
// La mayor parte del tiempo no hay ningún job corriendo, así que no tiene sentido
// preguntar cada 5 segundos: se consulta seguido solo mientras hay trabajo en curso.
const POLL_MS_ACTIVE = 5000;
const POLL_MS_IDLE = 60000;

interface Job {
  id: number;
  type: 'backfill' | 'daily_update';
  tickers: string;
  status: string;
  total_batches: number;
  completed_batches: number;
  error_message?: string | null;
}

interface JobsResponse {
  running: Job | null;
  queued: Job[];
  lastCompleted: Job | null;
}

function jobLabel(job: Job): string {
  if (job.type === 'daily_update') return 'Actualización diaria en curso';
  const tickers = job.tickers.split(',');
  const label = tickers.length === 1 ? tickers[0] : `${tickers.length} tickers`;
  return `Cargando histórico de ${label}`;
}

export const JobStatusBanner: React.FC = () => {
  const { authFetch, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<JobsResponse | null>(null);
  const lastSeenCompletedId = useRef<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;

    // Devuelve true si hay un job en curso o encolado (define el ritmo del próximo poll).
    const poll = async (): Promise<boolean> => {
      try {
        const res = await authFetch(`${WORKER}/jobs/active`);
        if (!res.ok) return false;
        const json: JobsResponse = await res.json();
        if (cancelled) return false;
        setData(json);

        const completed = json.lastCompleted;
        if (completed) {
          if (!initialized.current) {
            // Primer poll de la sesión: solo memorizar, no toastear trabajos viejos
            lastSeenCompletedId.current = completed.id;
          } else if (completed.id !== lastSeenCompletedId.current) {
            lastSeenCompletedId.current = completed.id;
            if (completed.status === 'done') {
              showToast(
                completed.type === 'daily_update'
                  ? 'Actualización diaria completada'
                  : `Carga histórica de ${completed.tickers} completada`,
                'success'
              );
            } else if (completed.status === 'error') {
              showToast(`Error al cargar ${completed.tickers}: ${completed.error_message || 'error desconocido'}`, 'error');
            }
          }
        }
        initialized.current = true;
        return !!json.running || json.queued.length > 0;
      } catch {
        // silencioso: el banner simplemente no se actualiza este tick
        return false;
      }
    };

    // Se reprograma con setTimeout (no setInterval) para poder ajustar el ritmo
    // según haya o no un job en curso.
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const hasActiveJob = await poll();
      if (cancelled) return;
      timer = setTimeout(loop, hasActiveJob ? POLL_MS_ACTIVE : POLL_MS_IDLE);
    };
    loop();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [authFetch, isAuthenticated, showToast]);

  if (!data || (!data.running && data.queued.length === 0)) return null;

  const activeJob = data.running || data.queued[0];
  const isRunning = !!data.running;
  const progress = activeJob.total_batches > 0
    ? Math.min(100, Math.round((activeJob.completed_batches / activeJob.total_batches) * 100))
    : 0;

  return (
    <div className={styles.banner}>
      {isRunning ? <Loader2 size={16} className={styles.spinner} /> : <Clock size={16} />}
      <span className={styles.label}>
        {isRunning ? jobLabel(activeJob) : `En cola: ${jobLabel(activeJob)}`}
      </span>
      {isRunning && (
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      )}
      {isRunning && activeJob.total_batches > 0 && (
        <span className={styles.progressText}>{activeJob.completed_batches}/{activeJob.total_batches}</span>
      )}
      {data.queued.length > (isRunning ? 0 : 1) && (
        <span className={styles.queueCount}>+{data.queued.length - (isRunning ? 0 : 1)} en cola</span>
      )}
    </div>
  );
};
