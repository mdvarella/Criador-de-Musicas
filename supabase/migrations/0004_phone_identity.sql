-- =============================================================================
-- Minha Musica IA - WhatsApp como identidade do cliente
-- =============================================================================
-- Boa parte do publico-alvo nao usa e-mail. Exigi-lo no formulario custava
-- conversao e excluia gente que compraria.
--
-- O e-mail passa a ser OPCIONAL e o WhatsApp vira a chave de identidade: e o
-- numero que o cliente sempre tem, sempre lembra e onde ele quer ser avisado.
--
-- Migration aditiva e reversivel: nenhuma coluna e removida e nenhum dado e
-- apagado. Cadastros existentes continuam validos, com e-mail preenchido.
-- =============================================================================

-- 1. E-mail deixa de ser obrigatorio.
alter table customers alter column email drop not null;

-- 2. A restricao de formato so vale quando ha e-mail.
alter table customers drop constraint if exists customers_email_check;
alter table customers add constraint customers_email_check
  check (email is null or position('@' in email) > 1);

-- 3. O indice unico de e-mail passa a ignorar os nulos: continua impedindo dois
--    cadastros com o mesmo e-mail, mas permite varios sem e-mail nenhum.
drop index if exists customers_email_key;
create unique index customers_email_key
  on customers (lower(email))
  where email is not null;

-- 4. Telefone vira a identidade. O indice unico so e criado se os dados atuais
--    permitirem — nunca falhamos a migration nem apagamos cadastro de ninguem.
do $$
begin
  if exists (
    select 1 from customers group by phone having count(*) > 1
  ) then
    raise notice
      'AVISO: existem telefones duplicados em customers. O indice unico NAO foi criado. '
      'Unifique os cadastros duplicados e rode: '
      'create unique index customers_phone_key on customers (phone);';
  else
    drop index if exists customers_phone_idx;
    create unique index if not exists customers_phone_key on customers (phone);
  end if;
end $$;

-- 5. Busca do cliente pelo nome do destinatario na pagina de recuperacao.
create index if not exists orders_recipient_name_idx on orders (lower(recipient_name));
