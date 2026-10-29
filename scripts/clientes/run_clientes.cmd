@echo off
rem Coleta diaria dos clientes no Saipos e importa para a intranet (secao Clientes).
rem Agendado no Task Scheduler: todo dia 03:40 (tarefa "ClientesColeta").
rem 03:40 e depois das outras automacoes que usam o MESMO perfil de browser
rem (DashboardColeta3h as 03:00, MotoboysColeta3h as 03:20) — duas ao mesmo
rem tempo travam no lock do perfil do Chromium.
setlocal
rem FALHA=1 faz o .cmd sair com codigo 1: e assim que a agenda (Hub\agenda)
rem marca falha e manda o e-mail ao Fabio. Antes o erro ficava so no log e o
rem painel dizia ok (coleta de clientes quebrou 12 dias calada, out/2026).
set FALHA=0
cd /d C:\claude_project\Pizzarias\intranet-pizzarias
if not exist scripts\clientes\data mkdir scripts\clientes\data
set LOG=scripts\clientes\data\runner.log

for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set HOJE=%%d
for /f %%d in ('powershell -NoProfile -Command "(Get-Date).AddDays(-1).ToString('yyyy-MM-dd')"') do set ONTEM=%%d

echo. >> %LOG%
echo ===== %date% %time% ===== >> %LOG%

"C:\Python314\python.exe" scripts\clientes\coletar_clientes.py --dias 90 >> %LOG% 2>&1
if errorlevel 1 (
  echo COLETA FALHOU >> %LOG%
  set FALHA=1
  goto :fim
)

rem Historico de pedidos por cliente (frequencia). Le so quem comprou desde a
rem coleta de ontem — a base inteira levaria ~30 min, o dia a dia leva segundos.
rem Sem o arquivo de ontem (primeira execucao do mes, falha na vespera) le todo mundo.
if exist scripts\clientes\data\clientes-%ONTEM%.json (
  "C:\Python314\python.exe" scripts\clientes\coletar_historico.py scripts\clientes\data\clientes-%HOJE%.json --novos-de scripts\clientes\data\clientes-%ONTEM%.json >> %LOG% 2>&1
) else (
  "C:\Python314\python.exe" scripts\clientes\coletar_historico.py scripts\clientes\data\clientes-%HOJE%.json >> %LOG% 2>&1
)
if errorlevel 1 (
  echo HISTORICO FALHOU - segue com a importacao >> %LOG%
  set FALHA=1
)

node scripts\clientes\importar_clientes.mjs scripts\clientes\data\clientes-%HOJE%.json >> %LOG% 2>&1
if errorlevel 1 (
  echo IMPORTACAO FALHOU >> %LOG%
  set FALHA=1
) else (
  echo OK >> %LOG%
)

rem Clientes que nasceram no sistema de pedidos (balcao ou bot) e o Saipos nao
rem enxerga: sobem os dos ultimos 2 dias. E a rede de seguranca do aviso de
rem "caixa fechado" que a loja manda ao whatsbot (regra do Fabio, 2026-10-06).
rem --forcar porque aqui estamos dentro da janela da coleta, logo depois dela.
for %%l in (dame lov) do node scripts\clientes\subir_pdv.mjs --loja %%l --dias 2 --forcar >> %LOG% 2>&1

rem E o caminho inverso: a base da intranet (Saipos cruzada) desce para o
rem sistema de pedidos (Supabase pdv_clientes, que os PCs puxam). So entra
rem cliente novo ou campo em branco; o cadastro da loja manda (2026-10-27).
rem DESLIGADO ate o ok do Fabio para gravar nas lojas (ensaiado na marca teste):
rem node scripts\clientes\descer_pdv.mjs >> %LOG% 2>&1
rem if errorlevel 1 echo DESCIDA PARA O PDV FALHOU >> %LOG%

rem Cada coleta guarda um JSON de ~4 MB e so a vespera ainda tem uso (--novos-de).
rem Sem esta limpeza a pasta cresce ~1,4 GB por ano.
forfiles /p "C:\claude_project\Pizzarias\intranet-pizzarias\scripts\clientes\data" /m clientes-*.json /d -7 /c "cmd /c del @path" >nul 2>&1

:fim
endlocal & exit /b %FALHA%
