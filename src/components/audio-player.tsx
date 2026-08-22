'use client';

import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import type { FunnelEvent } from '@/services/analytics-service';

type Props = {
  src: string;
  title: string;
  subtitle?: string;
  /** Evento disparado no primeiro play. */
  playEvent?: FunnelEvent;
  orderToken?: string;
};

/**
 * Player enxuto e controlado.
 *
 * `controlsList="nodownload"` e a ausência de link direto para o arquivo
 * reduzem o caminho óbvio de download da prévia. A proteção real está no
 * servidor: a URL é assinada, expira e o arquivo é diferente do da música
 * completa.
 */
export function AudioPlayer({ src, title, subtitle, playEvent, orderToken }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const trackedPlay = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setProgress(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);
    const onEnded = () => setPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      await audio.play();
      setPlaying(true);
      if (playEvent && !trackedPlay.current) {
        trackedPlay.current = true;
        track(playEvent, { title }, orderToken);
      }
    } catch {
      setPlaying(false);
    }
  }

  const percent = duration > 0 ? Math.min((progress / duration) * 100, 100) : 0;

  return (
    <div className="card flex items-center gap-4 p-4 sm:p-5">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar' : 'Ouvir'}
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-wine-600 text-2xl text-white shadow-lg transition hover:bg-wine-700"
      >
        <span aria-hidden>{playing ? '❚❚' : '▶'}</span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{title}</p>
        {subtitle ? (
          <p className="truncate text-sm text-ink-soft">{subtitle}</p>
        ) : null}

        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cream-deep"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div
            className="h-full rounded-full bg-wine-500 transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" controlsList="nodownload" />
    </div>
  );
}
