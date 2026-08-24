"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  fetchEmbedTVChannels,
  getEmbedPlayerUrl,
  clearEmbedTVCache,
} from "@/services/embedtv";
import { cn } from "@/lib/utils";
import {
  Search,
  Heart,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  ArrowLeft,
  Tv,
  Maximize,
  Minimize,
  History,
} from "lucide-react";
import {
  initTVService,
  isFavorite,
  getFavoriteIds,
  toggleFavorite as toggleFavoriteService,
  addToHistory,
  getHistory,
  getFavorites,
  loadLocalFavorites,
  loadLocalHistory,
} from "@/services/tvProgress";
import { useAuth } from "@/context/AuthContext";
import type { Channel } from "@/types/tv";

type TabType = "channels" | "favorites" | "recent" | "schedule";

export default function TVPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [activeTab, setActiveTab] = useState<TabType>("channels");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [, forceUpdate] = useState({});

  // Resetar estado do player quando mudar de canal
  const selectChannel = (channel: Channel | null) => {
    setIsPlayerReady(false);
    if (channel) {
      // Salvar no historico
      addToHistory(channel);
    }
    setSelectedChannel(channel);
  };

  // Detectar mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Inicializar servico de TV e carregar favoritos
  useEffect(() => {
    initTVService();
    loadLocalFavorites();
    loadLocalHistory();
    setFavorites(getFavoriteIds());
  }, []);

  // Atualizar favoritos quando usuario logar
  useEffect(() => {
    if (user) {
      // Recarregar favoritos do servidor
      const timer = setTimeout(() => {
        setFavorites(getFavoriteIds());
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [user]);

  // Alternar favorito
  const handleToggleFavorite = async (channel: Channel) => {
    await toggleFavoriteService(channel);
    setFavorites(getFavoriteIds());
    forceUpdate({}); // Forcar re-render
  };

  // Wrapper para toggle favorito por ID (usado em componentes filhos)
  const toggleFavoriteById = (channelId: string) => {
    const channel = channels.find((ch) => ch.id === channelId);
    if (channel) {
      handleToggleFavorite(channel);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);

    try {
      if (forceRefresh) clearEmbedTVCache();
      const data = await fetchEmbedTVChannels();
      setChannels(data.channels);
      setCategories(["Todos", ...data.categories]);
    } catch (err) {
      console.error("Error loading channels:", err);
      setError("Erro ao carregar canais");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar canais
  const filteredChannels = useMemo(() => {
    let result = channels;

    // Filtrar por favoritos
    if (activeTab === "favorites") {
      const favIds = getFavoriteIds();
      result = result.filter((ch) => favIds.includes(ch.id));
    }

    // Filtrar por recentes
    if (activeTab === "recent") {
      const history = getHistory();
      const historyIds = history.map((h) => h.channel_id);
      result = result.filter((ch) => historyIds.includes(ch.id));
      // Ordenar por ordem do historico
      result.sort((a, b) => {
        const aIndex = historyIds.indexOf(a.id);
        const bIndex = historyIds.indexOf(b.id);
        return aIndex - bIndex;
      });
    }

    // Filtrar por busca
    if (searchQuery) {
      result = result.filter((ch) =>
        ch.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Filtrar por categoria
    if (activeCategory !== "Todos" && activeTab === "channels") {
      result = result.filter((ch) => ch.category === activeCategory);
    }

    return result;
  }, [channels, searchQuery, activeCategory, activeTab, favorites]);

  // Agrupar por categoria para desktop
  const channelsByCategory = useMemo(() => {
    const grouped: Record<string, Channel[]> = {};
    filteredChannels.forEach((ch) => {
      const cat = ch.category || "Outros";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(ch);
    });
    return grouped;
  }, [filteredChannels]);

  // Se um canal esta selecionado, mostrar o player
  if (selectedChannel) {
    return (
      <TVPlayer
        channel={selectedChannel}
        isPlayerReady={isPlayerReady}
        onClose={() => selectChannel(null)}
        onPlayerReady={() => setIsPlayerReady(true)}
      />
    );
  }

  // Página de listagem de canais
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pt-[var(--header-height)]">
      {/* Header Mobile - fica abaixo do header global fixo (sticky com offset,
          em vez de um segundo cabeçalho sobrepondo o principal) */}
      {isMobile && (
        <div className="sticky top-[var(--header-height)] z-40 bg-[var(--bg-primary)]/95 backdrop-blur-md border-b border-[var(--border-color)]">
          {/* Tabs */}
          <div className="flex border-b border-[var(--border-color)]">
            <button
              onClick={() => setActiveTab("channels")}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === "channels"
                  ? "text-[var(--text-primary)] border-b-2 border-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)]",
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <Tv size={16} />
                Canais
              </div>
            </button>
            <button
              onClick={() => setActiveTab("favorites")}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === "favorites"
                  ? "text-[var(--text-primary)] border-b-2 border-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)]",
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <Heart size={16} />
                Favoritos
              </div>
            </button>
            <button
              onClick={() => setActiveTab("recent")}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === "recent"
                  ? "text-[var(--text-primary)] border-b-2 border-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)]",
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <History size={16} />
                Recentes
              </div>
            </button>
            <button
              onClick={() => setActiveTab("schedule")}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === "schedule"
                  ? "text-[var(--text-primary)] border-b-2 border-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)]",
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <Calendar size={16} />
                Programação
              </div>
            </button>
          </div>

          {/* Busca + Atualizar */}
          <div className="flex items-center gap-2 p-4">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                type="text"
                placeholder="Buscar canal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <button
              onClick={() => loadChannels(true)}
              className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Atualizar canais"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          {/* Filtros de Categoria */}
          <div className="px-4 pb-4 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                    activeCategory === cat
                      ? "bg-[var(--accent-primary)] text-white"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/70",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Header Desktop */}
      {!isMobile && (
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-display text-[var(--text-primary)]">
              TV Ao Vivo
            </h1>
            <button
              onClick={() => loadChannels(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/70 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <RefreshCw size={18} />
              Atualizar
            </button>
          </div>
          <p className="text-body text-[var(--text-secondary)]">
            Esportes, Notícias e seus canais favoritos em tempo real.
          </p>

          {/* Busca Desktop */}
          <div className="mt-6 max-w-md">
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                type="text"
                placeholder="Buscar canal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className={cn(isMobile ? "px-4 pb-8" : "px-8 pb-20")}>
        {/* Contador de canais - substitui a antiga barra fixa no rodapé
            (que sobrepunha a navegação mobile fixa embaixo) */}
        {!isLoading && !error && activeTab !== "schedule" && (
          <p className="text-caption text-[var(--text-tertiary)] mb-4 pt-4">
            {filteredChannels.length} canais disponíveis
            {favorites.length > 0 && ` • ${favorites.length} favoritos`}
          </p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-[3px] border-[var(--text-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-[var(--live-accent)] mb-4">{error}</p>
            <button onClick={() => loadChannels()} className="btn-primary">
              Tentar novamente
            </button>
          </div>
        ) : activeTab === "schedule" ? (
          <div className="text-center py-20">
            <Calendar
              size={48}
              className="mx-auto mb-4 text-[var(--text-tertiary)]"
            />
            <h2 className="text-title text-[var(--text-primary)] mb-2">
              Em breve
            </h2>
            <p className="text-[var(--text-secondary)]">
              A programação estará disponível em breve.
            </p>
          </div>
        ) : isMobile ? (
          /* Grid Mobile 2x2 */
          <div className="grid grid-cols-2 gap-3">
            {filteredChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isFavorite={favorites.includes(channel.id)}
                onSelect={() => selectChannel(channel)}
                onToggleFavorite={() => toggleFavoriteById(channel.id)}
              />
            ))}
          </div>
        ) : (
          /* Carrosséis Desktop por Categoria */
          <div className="space-y-10">
            {searchQuery ? (
              /* Resultados de busca */
              <div>
                <h2 className="text-title text-[var(--text-primary)] mb-4">
                  Resultados para &quot;{searchQuery}&quot;
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredChannels.map((channel) => (
                    <ChannelCard
                      key={channel.id}
                      channel={channel}
                      isFavorite={favorites.includes(channel.id)}
                      onSelect={() => selectChannel(channel)}
                      onToggleFavorite={() => toggleFavoriteById(channel.id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Por categoria */
              Object.entries(channelsByCategory).map(
                ([category, categoryChannels]) => (
                  <CategoryRow
                    key={category}
                    title={category}
                    channels={categoryChannels}
                    favorites={favorites}
                    onSelectChannel={selectChannel}
                    onToggleFavorite={toggleFavoriteById}
                  />
                ),
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Componente de Card do Canal
function ChannelCard({
  channel,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: {
  channel: Channel;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className="w-full bg-[var(--bg-secondary)] rounded-xl overflow-hidden transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-[var(--shadow-md)]"
      >
        {/* Badge LIVE */}
        <div className="absolute top-2 left-2 z-10">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-[var(--live-accent)] text-white text-[10px] font-bold rounded">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </span>
        </div>

        {/* Logo - fundo escuro dedicado (não segue o tema claro): a maioria
            dos logos de canal é PNG branco pensado pra fundo escuro */}
        <div className="aspect-video flex items-center justify-center p-4 bg-gradient-to-br from-[var(--tv-tile-bg-alt)] to-[var(--tv-tile-bg)]">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt={channel.name}
              className="max-w-full max-h-full object-contain filter brightness-0 invert"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Tv size={32} className="text-[var(--text-tertiary)]" />
          )}
        </div>

        {/* Nome */}
        <div className="p-3">
          <p className="text-[var(--text-primary)] text-sm font-medium truncate">
            {channel.name}
          </p>
        </div>
      </button>

      {/* Botão Favorito */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
      >
        <Heart
          size={16}
          className={cn(
            "transition-colors",
            isFavorite
              ? "fill-[var(--live-accent)] text-[var(--live-accent)]"
              : "text-white",
          )}
        />
      </button>
    </div>
  );
}

// Componente de Linha de Categoria (Desktop)
function CategoryRow({
  title,
  channels,
  favorites,
  onSelectChannel,
  onToggleFavorite,
}: {
  title: string;
  channels: Channel[];
  favorites: string[];
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -400 : 400;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div>
      <h2 className="text-title text-[var(--text-primary)] mb-4">{title}</h2>
      <div className="relative group/row">
        {/* Botao Scroll Esquerda */}
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-[var(--bg-elevated)] shadow-[var(--shadow-md)] border border-[var(--border-color)] rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-[var(--bg-tertiary)]"
        >
          <ChevronLeft size={24} className="text-[var(--text-primary)]" />
        </button>

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-2"
        >
          {channels.map((channel) => (
            <div key={channel.id} className="flex-shrink-0 w-48">
              <ChannelCard
                channel={channel}
                isFavorite={favorites.includes(channel.id)}
                onSelect={() => onSelectChannel(channel)}
                onToggleFavorite={() => onToggleFavorite(channel.id)}
              />
            </div>
          ))}
        </div>

        {/* Botao Scroll Direita */}
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 bg-[var(--bg-elevated)] shadow-[var(--shadow-md)] border border-[var(--border-color)] rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-[var(--bg-tertiary)]"
        >
          <ChevronRight size={24} className="text-[var(--text-primary)]" />
        </button>
      </div>
    </div>
  );
}

// Componente do Player de TV
function TVPlayer({
  channel,
  isPlayerReady,
  onClose,
  onPlayerReady,
}: {
  channel: Channel;
  isPlayerReady: boolean;
  onClose: () => void;
  onPlayerReady: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const playerUrl = getEmbedPlayerUrl(channel);

  // ------------------------------------------------------------------
  // Defesa contra REDIRECT de anúncio (não popup - esse já é bloqueado no
  // interceptor do proxy). Sem "sandbox" no iframe (necessário pra
  // embedtv.lat/live não mostrar a tela de bloqueio), um script dentro do
  // player consegue navegar a aba inteira pra fora do site ou trocar só o
  // conteúdo do iframe por uma página de anúncio - nenhum dos dois passa
  // pelas camadas de fetch/XHR/click já interceptadas. Mesma dupla defesa
  // usada no player de VOD (VideoPlayer.tsx).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    const resolvedUrl = new URL(playerUrl, window.location.origin).href;

    const watchdog = setInterval(() => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        void win.location.href;
      } catch {
        try {
          win.location.replace(resolvedUrl);
        } catch {
          // Sem sorte - o usuário ainda pode voltar manualmente (Voltar/Esc).
        }
      }
    }, 1500);

    return () => clearInterval(watchdog);
  }, [playerUrl]);

  // Esconder controles apos 3 segundos de inatividade
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    hideControlsTimeout.current = setTimeout(() => {
      if (isPlayerReady) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlayerReady]);

  // Detectar movimento do mouse
  useEffect(() => {
    const handleMouseMove = () => resetHideTimer();
    const handleTouchStart = () => resetHideTimer();

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchstart", handleTouchStart);

    // Iniciar timer
    resetHideTimer();

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchstart", handleTouchStart);
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [resetHideTimer]);

  // Detectar mudanca de fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Erro ao alternar tela cheia:", err);
    }
  };

  // Teclas de atalho
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) {
        onClose();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black"
      onClick={resetHideTimer}
    >
      <iframe
        ref={iframeRef}
        src={playerUrl}
        className="absolute inset-0 w-full h-full border-0"
        allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *; clipboard-write *; accelerometer *; gyroscope *"
        style={{ border: "none", background: "black" }}
        onLoad={() => {
          setTimeout(() => onPlayerReady(), 1500);
        }}
      />

      {/* Loading overlay */}
      {!isPlayerReady && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black">
          <div className="w-16 h-16 border-4 border-[var(--text-primary)] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[var(--text-primary)] text-lg font-medium">
            {channel.name}
          </p>
          <p className="text-[var(--text-tertiary)] text-sm mt-2">
            Carregando transmissão...
          </p>
        </div>
      )}

      {/* Controles - aparecem/somem */}
      <div
        className={cn(
          "absolute inset-0 z-30 pointer-events-none transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        {/* Header com botao voltar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 pointer-events-auto">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-white hover:opacity-70 transition-opacity"
            >
              <ArrowLeft size={24} />
              <span className="font-medium hidden sm:inline">Voltar</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-3 py-1 bg-[var(--live-accent)] text-white text-sm font-bold rounded">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                AO VIVO
              </span>
            </div>
          </div>
        </div>

        {/* Footer com info do canal e botao fullscreen */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pointer-events-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {channel.logo && (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-contain bg-white/10 p-1"
                />
              )}
              <div>
                <h2 className="text-white text-base sm:text-lg font-semibold">
                  {channel.name}
                </h2>
                {channel.category && (
                  <p className="text-[var(--text-secondary)] text-xs sm:text-sm">
                    {channel.category}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={toggleFullscreen}
              className="btn-icon"
              title={isFullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"}
            >
              {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Hint de controles - aparece ao mover o mouse quando controles estao escondidos */}
      {!showControls && isPlayerReady && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 opacity-0 hover:opacity-100 transition-opacity">
          <p className="text-white/50 text-xs">
            Mova o mouse para mostrar controles
          </p>
        </div>
      )}
    </div>
  );
}
