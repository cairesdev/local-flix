import { redirect } from 'next/navigation';

/**
 * TV ao vivo é o produto principal da plataforma (decisão de arquitetura).
 * A raiz do site ("/") redireciona direto para "/tv" para que a experiência
 * de TV ao vivo seja o que o usuário encontra primeiro. O catálogo de
 * filmes/séries/animes continua disponível em "/catalogo".
 */
export default function HomePage() {
  redirect('/tv');
}
