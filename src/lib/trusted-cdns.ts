/**
 * CDNs genéricos de infraestrutura (não são "provedores de conteúdo"
 * trocáveis, então não ficam na tabela `providers`) que os players de
 * terceiros costumam usar para carregar bibliotecas (hls.js, etc.) e
 * segmentos de vídeo. Compartilhado entre o proxy de assets (fetch direto)
 * e o proxy de embed (allowlist do Content-Security-Policy).
 */
export const TRUSTED_CDN_DOMAINS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'akamaihd.net',
  'cloudfront.net',
  'fastly.net',
];
