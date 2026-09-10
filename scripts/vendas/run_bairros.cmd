@echo off
rem Vendas por bairro (sub-aba "Por Bairro" de Vendas): coleta o MES PASSADO no
rem Saipos e importa para o Firestore.
rem
rem Sem argumento pega o mes passado (fechado). Para refazer um periodo:
rem   run_bairros.cmd 2024-01 2026-08
rem
rem SO NA MADRUGADA. O Saipos aceita uma sessao por usuario: com o PC da loja
rem ligado (a partir das 18h) o login daqui derruba a loja, a loja reconecta e
rem derruba a gente — o app carrega pela metade e a coleta morre em "campos de
rem data nao apareceram". Alem disso usa o mesmo perfil de browser das outras
rem automacoes do Saipos: nao rodar junto com DashboardColeta3h (03:00),
rem MotoboysColeta3h (03:20) ou ClientesColeta (03:40, ~20 min) — duas ao mesmo
rem tempo travam no lock do Chromium.
rem
rem Sem --headless de proposito: as 4h ninguem esta no PC, e headless as vezes
rem trava no boot do app do Saipos (mesmo motivo do fallback do runner do Dash).
setlocal
cd /d C:\claude_project\Pizzarias\intranet-pizzarias
if not exist scripts\vendas\data mkdir scripts\vendas\data
set LOG=scripts\vendas\data\runner.log

for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set HOJE=%%d

set PERIODO=
if not "%~1"=="" set PERIODO=--de %~1
if not "%~2"=="" set PERIODO=%PERIODO% --ate %~2

echo. >> %LOG%
echo ===== %date% %time% ===== >> %LOG%

"C:\Python314\python.exe" scripts\vendas\coletar_bairros.py %PERIODO% >> %LOG% 2>&1
if errorlevel 1 (
  echo COLETA FALHOU >> %LOG%
  goto :fim
)

node scripts\vendas\importar_bairros.mjs scripts\vendas\data\bairros-%HOJE%.json >> %LOG% 2>&1
if errorlevel 1 (echo IMPORTACAO FALHOU >> %LOG%) else (echo OK >> %LOG%)

:fim
endlocal
