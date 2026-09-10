@echo off
rem ============================================================================
rem  Mesa do Dono - fecha o MES ANTERIOR (dia 01, 04:40)
rem
rem  Existe porque agosto/2026 ficou pela metade na Mesa do Dono: o documento
rem  fechamentos_mensais/2026-08_<marca> tinha o DRE (dre_synced_at 04/09 11:38)
rem  mas nao tinha `pizzas`, `ticket` nem `canais` - o lado da planilha VENDAS
rem  LOJAS (dados_synced_at parou em 02/09 19:17, cobrindo so ate julho).
rem  Nenhum job da grade cobria essa metade: o intranet-dashboard so alimenta o
rem  MES CORRENTE e o vendas-bairros escreve noutra colecao.
rem
rem  Dois passos:
rem   1) dre_itens_vendidos.py --gravar-vendas
rem      Exporta os itens vendidos do Saipos, confere a consistencia e grava nas
rem      abas ITENS DAME / ITENS LOV e na aba DADOS (contagem de pizzas por
rem      canal) da planilha VENDAS LOJAS. Sem --mes/--ano ele ja assume o mes
rem      anterior, que no dia 01 e exatamente o que acabou de fechar.
rem   2) Dispara o Web App do SyncVendas.gs (planilha VENDAS LOJAS), que le a
rem      aba DADOS e escreve pizzas/ticket/canais em fechamentos_mensais.
rem      ISSO E OBRIGATORIO: gravacao pela API do Sheets NAO dispara o gatilho
rem      onChange do Apps Script - sem esta chamada a planilha fica certa e o
rem      Firestore fica velho, que e a origem do buraco de agosto.
rem
rem  SO NA MADRUGADA, e NUNCA em paralelo com outra automacao do Saipos. Todas
rem  usam o MESMO perfil do Chromium
rem  (%LOCALAPPDATA%\dre_ai\browser_profile_saipos) e o Saipos aceita uma sessao
rem  por usuario: duas ao mesmo tempo travam no lock do perfil ou derrubam uma a
rem  outra. Na madrugada do dia 01 a ordem e:
rem      03:10 intranet-dashboard (~8 min)
rem      03:30 clientes-coleta    (~20 min, ate ~03:50)
rem      04:00 motoboys-3h        (so quartas, ~20 min, ate ~04:20)
rem      04:40 ESTE JOB
rem  O vendas-bairros usa o mesmo horario (04:40) mas no dia 02, entao os dois
rem  nunca se cruzam.
rem
rem  Sem --headless de proposito, mesma razao do run_bairros.cmd: as 4h ninguem
rem  esta no PC e o headless as vezes trava no boot do app do Saipos.
rem
rem  Para refazer um mes especifico:
rem    run_mesadono.cmd 8 2026
rem ============================================================================
setlocal
set SKILL=C:\Users\PICHAU\.claude\skills\dre\scripts
cd /d "%SKILL%"

set RAIZ=C:\claude_project\Pizzarias\intranet-pizzarias
if not exist "%RAIZ%\scripts\mesadono\data" mkdir "%RAIZ%\scripts\mesadono\data"
set LOG=%RAIZ%\scripts\mesadono\data\runner.log

set PERIODO=
if not "%~1"=="" set PERIODO=--mes %~1
if not "%~2"=="" set PERIODO=%PERIODO% --ano %~2

echo. >> "%LOG%"
echo ===== %date% %time% ===== >> "%LOG%"

rem 1) Saipos -> planilha VENDAS LOJAS (abas ITENS + aba DADOS)
"C:\Python314\python.exe" dre_itens_vendidos.py %PERIODO% --gravar-vendas >> "%LOG%" 2>&1
if errorlevel 1 (
  echo ITENS VENDIDOS FALHOU - sync nao disparado >> "%LOG%"
  goto :fim
)

rem 2) VENDAS LOJAS -> Firestore (fechamentos_mensais: pizzas, ticket, canais)
rem    A URL e o token sao os mesmos do botao "Sincronizar" do dashboard
rem    (dashboard_pizzarias/src/lib/sheetSync.ts). O Apps Script sincroniza a
rem    planilha inteira e costuma passar do timeout HTTP mesmo gravando certo,
rem    por isso a falha do curl NAO derruba a rodada - o log fica com a resposta.
set SYNC=https://script.google.com/macros/s/AKfycbycofX6Woh_PjE2z4gGvZSHpeOcsJINOqbmZ9JmE8vEsc7pJuwB5FQRPxMnbnMJaGQ4/exec
curl -sSL --max-time 600 "%SYNC%?token=dp-sync-vendas-4j8w2r6t" >> "%LOG%" 2>&1
echo. >> "%LOG%"
echo (sync exit %errorlevel%) >> "%LOG%"

rem 3) Confere no Firestore se o mes ficou completo.
node "%RAIZ%\scripts\mesadono\conferir.mjs" %PERIODO% >> "%LOG%" 2>&1
if errorlevel 1 (echo CONFERENCIA APONTOU BURACO >> "%LOG%") else (echo OK >> "%LOG%")

:fim
endlocal
