import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Regras de uso do serviço de músicas personalizadas.',
};

/**
 * Termos de uso — ponto de partida operacional.
 * Deve ser revisado juridicamente e ter o fornecedor identificado (razão social
 * e CNPJ) antes do lançamento comercial.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="agosto de 2026">
      <p>
        Ao usar a <strong>{brand.name}</strong>, você concorda com as regras abaixo. Leia com
        atenção antes de fazer seu pedido.
      </p>

      <h2>O que oferecemos</h2>
      <p>
        Criamos uma música personalizada a partir da história que você envia. O resultado é uma obra
        original, criada especificamente para o seu pedido.
      </p>

      <h2>Sua responsabilidade sobre a história</h2>
      <ul>
        <li>Você declara que a história enviada é verdadeira e que pode compartilhá-la conosco.</li>
        <li>
          Não envie conteúdo ilegal, ofensivo, discriminatório ou que viole direitos de terceiros.
        </li>
        <li>
          Ao mencionar outra pessoa, você se responsabiliza por ter o cuidado necessário com a
          privacidade dela.
        </li>
      </ul>

      <h2>Como a música é criada</h2>
      <p>
        Usamos os detalhes que você fornece para escrever a letra e produzir o áudio. Não criamos
        imitações de artistas específicos e não reproduzimos músicas existentes.
      </p>

      <h2>Prévia e pagamento</h2>
      <ul>
        <li>A prévia é um trecho curto, oferecido para você conhecer o resultado antes de comprar.</li>
        <li>
          A música completa é produzida <strong>após a confirmação do pagamento</strong> pelo
          processador de pagamentos.
        </li>
        <li>O preço exibido no checkout é o preço final, sem cobranças adicionais.</li>
      </ul>

      <h2>Uso da música</h2>
      <p>
        A música criada é sua para uso <strong>pessoal e não comercial</strong>: ouvir, presentear,
        compartilhar com quem você quiser e usar em momentos particulares como festas e cerimônias.
      </p>
      <p>
        Uso comercial — publicidade, monetização em plataformas de streaming, revenda ou trilha de
        conteúdo comercial — precisa de autorização prévia por escrito.
      </p>

      <h2>Prazo de entrega</h2>
      <p>
        A produção costuma levar poucos minutos. Se algo der errado, tentamos novamente de forma
        automática e avisamos você. Em caso de impossibilidade de entrega, devolvemos o valor pago.
      </p>

      <h2>Reembolso e arrependimento</h2>
      <p>
        Por se tratar de um produto personalizado, criado exclusivamente a partir do seu pedido, o
        cancelamento após a produção da música completa é analisado caso a caso. Se a música não
        for entregue, o reembolso é integral. Fale com a gente
        {brand.supportEmail ? ` em ${brand.supportEmail}` : ''}.
      </p>

      <h2>Alterações</h2>
      <p>
        Podemos atualizar estes termos. Mudanças relevantes serão comunicadas pelos canais de
        contato informados no pedido.
      </p>
    </LegalPage>
  );
}
