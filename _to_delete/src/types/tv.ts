export interface Channel {
  id: string;
  name: string;
  logo: string;
  country: string;
  category: string;
  url: string;
  /** Provedor (tabela `providers`) que originou este canal - usado para montar a URL do player. */
  providerId?: number;
  /** Base do player do provedor de origem (ex: https://www1.embedtv.best). */
  playerBaseUrl?: string;
}

export interface TVFilters {
  category: string;
  search: string;
  country?: string; // Mantido para compatibilidade
}

export interface TVState {
  channels: Channel[];
  filteredChannels: Channel[];
  currentChannel: Channel | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  filters: TVFilters;
}
