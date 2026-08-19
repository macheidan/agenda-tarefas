@echo off
rem Coleta diaria dos clientes no Saipos e importa para a intranet (secao Clientes).
rem Agendado no Task Scheduler: todo dia 04:10 (tarefa "ClientesColeta").
rem 04:10 e depois das outras automacoes que usam o MESMO perfil de browser
rem (DashboardColeta3h as 03:00, MotoboysColeta3h as 03:20) — duas ao mesmo
rem tempo travam no lock do perfil do Chromium.
setlocal
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
if errorlevel 1 echo HISTORICO FALHOU (segue com a importacao) >> %LOG%

node scripts\clientes\importar_clientes.mjs scripts\clientes\data\clientes-%HOJE%.json >> %LOG% 2>&1
if errorlevel 1 (
  echo IMPORTACAO FALHOU >> %LOG%
) else (
  echo OK >> %LOG%
)

:fim
endlocal
