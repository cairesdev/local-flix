import { env } from '@/lib/env';

// TMDB API (lido de src/lib/env.ts - nunca hard-code aqui)
export const TMDB_API_KEY = env.tmdb.apiKey;
export const TMDB_BASE_URL = env.tmdb.baseUrl;
export const TMDB_IMAGE_BASE = env.tmdb.imageBaseUrl;

// Provedores de vídeo (filmes/séries e TV ao vivo) não são mais fixos no
// código-fonte: são gerenciados via painel administrativo (tabela
// `providers`, com fallback automático entre eles). Veja
// src/services/providers.ts. O antigo SUPERFLIX_API_URL fixo foi removido.

// Image sizes
export const IMAGE_SIZES = {
  poster: {
    small: 'w185',
    medium: 'w342',
    large: 'w500',
    original: 'original',
  },
  backdrop: {
    small: 'w300',
    medium: 'w780',
    large: 'w1280',
    original: 'original',
  },
  profile: {
    small: 'w45',
    medium: 'w185',
    large: 'h632',
    original: 'original',
  },
};

// Cache TTL (10 minutes)
export const CACHE_TTL = 10 * 60 * 1000;

// LocalStorage keys
export const STORAGE_KEYS = {
  token: 'superflix_token',
  user: 'superflix_user',
  theme: 'superflix_theme',
  history: 'superflix_history',
  continue: 'superflix_continue',
  favorites: 'superflix_favorites',
};

// Media types
export const MEDIA_TYPES = {
  movie: 'movie',
  tv: 'tv',
  anime: 'anime',
} as const;

// Categories
export const CATEGORIES = {
  trending: 'Em Alta',
  popularMovies: 'Filmes Populares',
  popularTv: 'Séries Populares',
  topRated: 'Mais Bem Avaliados',
  anime: 'Animes',
} as const;

// Genres (TMDB IDs)
export const GENRES = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  sciFi: 878,
  tvMovie: 10770,
  thriller: 53,
  war: 10752,
  western: 37,
} as const;

// TV Genres
export const TV_GENRES = {
  actionAdventure: 10759,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  kids: 10762,
  mystery: 9648,
  news: 10763,
  reality: 10764,
  sciFiFantasy: 10765,
  soap: 10766,
  talk: 10767,
  warPolitics: 10768,
  western: 37,
} as const;
