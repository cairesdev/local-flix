export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface ApiError {
  error: string;
  status: number;
  details?: unknown;
}

// Admin types
export interface AdminDashboard {
  totalUsers: number;
  activeUsers: number;
  newUsersLast7Days: number;
  watchesToday: number;
}

/** Configurações do sistema, sempre em formato "achatado" (key -> string). */
export interface AdminSettings {
  site_name: string;
  site_description: string;
  maintenance_mode: string; // 'true' | 'false'
  allow_registration: string; // 'true' | 'false'
  [key: string]: string;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  status: string;
  last_login: string | null;
  created_at: string;
}

export type ProviderType = 'vod' | 'tv';
export type ProviderHealth = 'unknown' | 'healthy' | 'degraded' | 'down';

export interface AdminProvider {
  id: number;
  type: ProviderType;
  name: string;
  base_url: string;
  movie_path_template: string;
  series_path_template: string;
  channels_url: string | null;
  player_base_url: string | null;
  priority: number;
  is_active: boolean;
  health_status: ProviderHealth;
  last_checked_at: string | null;
  failure_count: number;
  notes: string | null;
}

export interface AdminLog {
  id: number;
  admin_id: number;
  admin_email?: string;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface SystemSetting {
  key: string;
  value: string | null;
  description: string | null;
  updated_at: string;
  updated_by: number | null;
}

// Request/Response types
export interface HistoryRequest {
  tmdb_id: number;
  imdb_id?: string;
  title: string;
  poster_path?: string;
  media_type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  progress?: number;
}

export interface FavoriteRequest {
  tmdb_id: number;
  title: string;
  poster_path?: string;
  media_type: 'movie' | 'tv';
}

export interface SyncHistoryRequest {
  items: HistoryRequest[];
}
