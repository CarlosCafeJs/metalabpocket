# InstaLab: MetaCoins, cobrança por intervalo e iluminação

## Implementado

- Publicações válidas: 20 MetaCoins por publicação, sem novo crédito ao editar ou repetir uma requisição. O controle por conteúdo/dia e o teto diário permanecem aplicados.
- Curtidas em publicação de outro aluno: 15 MetaCoins na primeira curtida daquela publicação pelo aluno. Remover e recolocar a curtida não reabre o crédito.
- Comentários em publicação de outro aluno: 15 MetaCoins, no máximo um crédito por aluno/publicação/dia. Texto igual normalizado na mesma publicação é tratado como duplicado.
- Créditos e débitos são calculados no servidor e escritos no extrato dentro da mesma transação PostgreSQL das operações correspondentes.
- Anúncios têm orçamento máximo, aguardam aprovação e só começam a consumir moedas quando o professor aprova. Cada intervalo pago dura 10 minutos; o custo por intervalo começa em 10 MetaCoins e pode ser alterado pelo professor administrador.
- Um job Node independente cobra o próximo intervalo antes do fim do tempo financiado. Campanhas sem orçamento restante ou sem saldo terminam e deixam de ser elegíveis. O feed verifica `paid_through > NOW()`, então uma indisponibilidade do agendador pode criar uma pausa, nunca veiculação gratuita.
- O aluno pode pausar ou encerrar uma campanha. Pausar encerra o intervalo financiado em curso; retomar pelo professor exige pagar um intervalo novo.
- O Estúdio 3D atualiza luzes existentes (Three.js vendorizado), sem recriar a cena. Inclui intensidade, direção, cor, luz ambiente, sombras e seis presets. A captura mantém a iluminação exibida e salva o preset/configuração junto da foto para consulta docente.
- Impressões contam alunos únicos por campanha e dia. Curtidas/comentários próprios do objeto “campanha” e acessos ao perfil ainda não são contabilizados; não são exibidos como métricas.

## Banco e execução segura

Foi criado `db/migrations/014_instalab_rewards_billing_and_lighting.sql`. **Não foi executado**. O projeto local contém migrations anteriores ainda pendentes; confira `metalab_schema_migrations` e faça backup/snapshot do Railway antes de aplicar a sequência pendente. Não aplique 014 isoladamente se migrations anteriores não estiverem marcadas como concluídas.

Depois do snapshot, rode a partir de um ambiente com Node/npm e `DATABASE_URL` apontando explicitamente para o banco desejado:

```sh
npm run db:migrate
```

Para a cobrança automática, configure no Railway um serviço agendado usando a mesma versão publicada e as mesmas variáveis de banco, com execução a cada minuto e comando:

```sh
npm run instalab:bill
```

O processo é de execução única e pode sobrepor instâncias; locks PostgreSQL, chave única por campanha/intervalo e transações evitam lançamentos duplicados. Não configure como `setInterval` do navegador nem como processo web permanente. Se o serviço agendado não estiver configurado, campanhas financiadas expiram no feed e não são cobradas até o job voltar.

## Validação

Rodados localmente: `npm run typecheck`, `npm test`, `node --check` nos scripts JS/MJS alterados e `git diff --check`. O build tentou usar `.next` e uma saída isolada `.next-validation`, mas ambos foram bloqueados com `EPERM` ao criar pastas dentro das rotas de API; portanto não houve resultado de build. Não foi possível consultar `origin/main` porque a rede deste ambiente não resolveu `github.com`. Não foi executada migration e não houve alteração no banco.
