# PocoLord's Twinkles Road (PTR)

Site da liga **PocoLord's Twinkles Road**, uma liga de fãs de *Umamusume: Pretty Derby*. Ele reúne:

- a agenda das corridas da edição e o check-in;
- o sorteio das pistas;
- os resultados, com replay da corrida, gráficos de desempenho e análise de cada treinador;
- os rankings (geral e por personagem);
- o Jornal da PTR;
- o buscador de pistas com simulador de skills.

## Tecnologias

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [Firebase](https://firebase.google.com/): Firestore, Authentication e Hosting

## Rodando localmente

```bash
npm install
npm run dev      # servidor de desenvolvimento em http://localhost:5173
npm run build    # gera a versão de produção em dist/
npm run lint     # confere o código com o ESLint
```

O deploy é feito com o Firebase CLI (`firebase deploy`), publicando a pasta `dist/`.

## Créditos

O PTR usa o trabalho de várias pessoas da comunidade. A página **Créditos** do site traz a lista completa.

- **[Hakuraku](https://hakuraku.moe/)**, um fork do [Hakuraku original da SSHZ.ORG](https://github.com/SSHZ-ORG/hakuraku):
  - leitura do arquivo de corrida exportado do jogo;
  - telemetria dos resultados;
  - base do replay e dos traçados das pistas.

  O código adaptado fica em `src/utils/hakuraku/`, junto com a licença MIT original (`LICENSE-HAKURAKU.txt`).
- **[uma-skill-tools](https://github.com/alpha123/uma-skill-tools)** e **[uma-tools](https://github.com/alpha123/uma-tools)**, de alpha123:
  - motor do simulador de skills (`src/uma-skill-tools/`);
  - dados de pistas e skills;
  - ícones das roupas;
  - nomes das skills.
- **[GameTora](https://gametora.com/umamusume)**: chibis das personagens usados no replay.

## Licença

Por incluir o uma-skill-tools (GPL-3.0), o **código** deste projeto é distribuído sob a **GNU General Public License v3.0**. O texto completo está no arquivo [LICENSE](./LICENSE).

Os trechos derivados do Hakuraku mantêm o aviso de copyright da licença MIT original.

**As imagens, personagens, nomes e demais materiais do jogo** (pasta `public/assets` e afins) são **© Cygames, Inc.** e **não** fazem parte da licença do código. O PTR é um projeto de fãs, sem fins lucrativos, e não é afiliado à Cygames.
