'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, AlertCircle, Maximize, Minimize, SkipForward, RotateCw } from 'lucide-react';

interface VideoPlayerProps {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  imdbId?: string | null;
  season?: number;
  episode?: number;
  title?: string;
  onProgress?: (progress: number) => void;
  onEnded?: () => void;
  className?: string;
}

interface PlayerCandidate {
  providerId: number;
  name: string;
  directUrl: string;
  proxiedUrl: string;
}

function reportOutcome(providerId: number, success: boolean) {
  // Fire-and-forget: alimenta o health-check do provedor no admin.
  fetch('/api/vod/player-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, success }),
  }).catch(() => {});
}

export function VideoPlayer({
  mediaType,
  tmdbId,
  imdbId,
  season,
  episode,
  title,
  className,
}: VideoPlayerProps) {
  const [candidates, setCandidates] = useState<PlayerCandidate[] | null>(null);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [mode, setMode] = useState<'direct' | 'proxy'>('direct');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const reportedRef = useRef(false);

  const id = mediaType === 'movie' ? imdbId || String(tmdbId) : String(tmdbId);

  // Buscar candidatos de provedores (ordenados por prioridade/saúde)
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setCandidates(null);
    setCandidateIdx(0);
    setMode('direct');

    const params = new URLSearchParams({ mediaType, id });
    if (season) params.set('season', String(season));
    if (episode) params.set('episode', String(episode));

    fetch(`/api/vod/player-url?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.candidates || data.candidates.length === 0) {
          setError(data.error || 'Nenhum provedor de vídeo disponível.');
          setIsLoading(false);
          return;
        }
        setCandidates(data.candidates);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Erro ao consultar os provedores de vídeo.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, id, season, episode]);

  useEffect(() => {
    reportedRef.current = false;
  }, [candidateIdx, mode]);

  const current = candidates?.[candidateIdx];
  const playerUrl = current ? (mode === 'proxy' ? current.proxiedUrl : current.directUrl) : undefined;

  const handleLoad = () => {
    setIsLoading(false);
    if (current && !reportedRef.current) {
      reportedRef.current = true;
      reportOutcome(current.providerId, true);
    }
  };

  const goToNextProvider = useCallback(() => {
    if (current && !reportedRef.current) {
      reportedRef.current = true;
      reportOutcome(current.providerId, false);
    }
    if (candidates && candidateIdx < candidates.length - 1) {
      setCandidateIdx((i) => i + 1);
      setMode('direct');
      setIsLoading(true);
      setError(null);
    } else {
      setError('Não foi possível carregar o player em nenhum provedor disponível.');
      setIsLoading(false);
    }
  }, [candidates, candidateIdx, current]);

  const handleError = useCallback(() => {
    setIsLoading(false);
    if (mode === 'direct') {
      // Antes de descartar o provedor, tenta a rota via proxy (contorna
      // bloqueios de rede/CORS sem precisar trocar de provedor).
      setMode('proxy');
      setIsLoading(true);
      setError(null);
      return;
    }
    goToNextProvider();
  }, [mode, goToNextProvider]);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const hasMoreProviders = !!candidates && candidateIdx < candidates.length - 1;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative bg-black aspect-video w-full',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Loading State */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-[var(--accent-primary)] animate-spin mx-auto mb-4" />
            <p className="text-[var(--text-primary)]">Carregando player...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center max-w-sm px-4">
            <AlertCircle className="w-12 h-12 text-[#ff3b30] mx-auto mb-4" />
            <p className="text-[var(--text-primary)] mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              {hasMoreProviders && (
                <button
                  onClick={goToNextProvider}
                  className="btn-primary !px-4 !py-2 text-sm"
                >
                  <SkipForward size={16} />
                  Tentar outro servidor
                </button>
              )}
              <button
                onClick={() => {
                  setError(null);
                  setIsLoading(true);
                  setMode('direct');
                  setCandidateIdx(0);
                }}
                className="btn-secondary !px-4 !py-2 text-sm"
              >
                <RotateCw size={16} />
                Recarregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player iframe */}
      {playerUrl && (
        <iframe
          key={playerUrl}
          ref={iframeRef}
          src={playerUrl}
          className={cn(
            'absolute inset-0 w-full h-full',
            (isLoading || error) && 'invisible'
          )}
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          // Sem atributo "sandbox": vários players (ex.: superflixapi.pro)
          // detectam a simples presença do sandbox - mesmo com todas as
          // flags liberadas, `frameElement.sandbox.length > 0` já é
          // suficiente pra eles recusarem rodar. A documentação oficial
          // deles também usa iframe sem sandbox. A proteção contra
          // popup/redirect de anúncio deixa de ser nativa do navegador e
          // passa a depender só das camadas de JS: no modo "proxy" o
          // interceptor injetado sobrescreve window.open e intercepta
          // cliques em links de anúncio/tracking; no modo "direct" (domínio
          // real do provedor, sem nosso script) não há essa rede de
          // segurança - se voltar a aparecer popup/redirect nesse modo, dá
          // pra reavaliar.
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {/* Fullscreen Toggle Button */}
      {!isLoading && !error && (
        <button
          onClick={toggleFullscreen}
          className="absolute bottom-4 right-4 p-2 bg-black/50 rounded-lg text-white hover:bg-black/70 transition-colors z-10"
          aria-label={isFullscreen ? 'Sair do modo tela cheia' : 'Tela cheia'}
        >
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      )}

      {/* Title Overlay */}
      {title && !isLoading && !error && (
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent opacity-0 hover:opacity-100 transition-opacity">
          <h2 className="text-white font-semibold">
            {title}
            {mediaType === 'tv' && season && episode && (
              <span className="text-gray-300 font-normal ml-2">
                S{season}:E{episode}
              </span>
            )}
          </h2>
        </div>
      )}
    </div>
  );
}
