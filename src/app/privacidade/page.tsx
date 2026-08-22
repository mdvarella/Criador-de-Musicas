import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { brand } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como tratamos os dados pessoais e as histórias enviadas.',
};

/**
 * Política de privacidade — base para conformidade com a LGPD.
 *
 * Este texto é um ponto de partida operacional e honesto sobre o que o sistema
 * realmente faz. Antes do lançamento comercial, deve ser revisado por um
 * profissional jurídico e ter o controlador identificado (razão social e CNPJ).
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="agosto de 2026">
      <p>
        Esta política explica quais dados a <strong>{brand.name}</strong> coleta, por que coleta e
        o que você pode fazer a respeito. Ela segue a Lei Geral de Proteção de Dados Pessoais (Lei
        nº 13.709/2018).
      </p>

      <h2>Quais dados coletamos</h2>
      <ul>
        <li>
          <strong>Dados de contato:</strong> primeiro nome, e-mail e número de WhatsApp, usados para
          identificar seu pedido e avisar quando a música ficar pronta.
        </li>
        <li>
          <strong>A história que você conta:</strong> o texto e os detalhes que você envia no
          formulário, usados exclusivamente para criar a sua música.
        </li>
        <li>
          <strong>Dados do pedido:</strong> ocasião, destinatário, estilo, status e valor.
        </li>
        <li>
          <strong>Dados de navegação e campanha:</strong> parâmetros de origem (UTM) e eventos de
          uso do site, usados para entender de onde vêm nossos clientes.
        </li>
      </ul>

      <h2>O que não coletamos</h2>
      <p>
        <strong>Não armazenamos dados de cartão de crédito.</strong> Número, validade e código de
        segurança são digitados no ambiente do processador de pagamentos e nunca passam pelos
        nossos servidores.
      </p>

      <h2>Como usamos a sua história</h2>
      <p>
        A história enviada é usada apenas para criar a sua música. Para isso, ela é processada por
        serviços especializados de criação de letra e de áudio contratados por nós, sob obrigação
        contratual de confidencialidade.
      </p>
      <p>
        <strong>
          Não publicamos, não divulgamos e não usamos a sua história ou a sua música em anúncios ou
          redes sociais sem a sua autorização explícita e específica.
        </strong>
      </p>

      <h2>Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados do pedido e da música: enquanto sua conta de pedido estiver ativa e pelo prazo
          legal de guarda fiscal.</li>
        <li>Dados de navegação: até 24 meses.</li>
      </ul>

      <h2>Seus direitos</h2>
      <p>
        Você pode solicitar a qualquer momento: confirmação de tratamento, acesso aos seus dados,
        correção, portabilidade, revogação de consentimento e{' '}
        <strong>exclusão dos seus dados e da sua história</strong>. Para exercer qualquer um deles,
        escreva para {brand.supportEmail || 'nosso canal de contato'}.
      </p>
      <p>
        Atendemos a solicitação em até 15 dias. A exclusão remove sua história, seus dados de
        contato e os arquivos de áudio; registros fiscais obrigatórios são mantidos pelo prazo
        exigido por lei.
      </p>

      <h2>Compartilhamento</h2>
      <p>
        Compartilhamos dados apenas com os fornecedores necessários para operar o serviço:
        hospedagem, banco de dados, processamento de pagamento, criação de letra e criação de
        áudio. Nenhum deles recebe autorização para usar seus dados para finalidades próprias.
      </p>

      <h2>Segurança</h2>
      <p>
        Os arquivos de áudio ficam em armazenamento privado e são acessados por links temporários e
        assinados. Chaves de integração ficam apenas no servidor. O acesso administrativo é
        autenticado e restrito.
      </p>

      <h2>Contato</h2>
      <p>
        Dúvidas sobre esta política ou sobre seus dados:{' '}
        {brand.supportEmail || 'entre em contato pelo nosso site'}.
      </p>
    </LegalPage>
  );
}
