@echo off
rem So as vendas dia a dia (sub-aba "Por Dia da Semana" de Vendas), sem os
rem bairros. A rotina mensal roda isto dentro do run_bairros.cmd; este aqui e
rem para refazer um periodo:
rem   run_diario.cmd 2025-01 2026-09
rem
rem SO NA MADRUGADA — mesmos motivos do run_bairros.cmd (sessao unica do Saipos
rem e lock do perfil do Chromium com as outras coletas).
setlocal
set FALHA=0
cd /d C:\claude_project\Pizzarias\intranet-pizzarias
if not exist scripts\vendas\data mkdir scripts\vendas\data
set LOG=scripts\vendas\data\runner.log

for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set HOJE=%%d

set PERIODO=
if not "%~1"=="" set PERIODO=--de %~1
if not "%~2"=="" set PERIODO=%PERIODO% --ate %~2

echo. >> %LOG%
echo ===== %date% %time% (diario %PERIODO%) ===== >> %LOG%

"C:\Python314\python.exe" scripts\vendas\coletar_diario.py %PERIODO% >> %LOG% 2>&1
if errorlevel 1 (
  echo COLETA DIARIO FALHOU >> %LOG%
  set FALHA=1
  goto :fim
)

node scripts\vendas\importar_diario.mjs scripts\vendas\data\diario-%HOJE%.json >> %LOG% 2>&1
if errorlevel 1 (
  echo IMPORTACAO DIARIO FALHOU >> %LOG%
  set FALHA=1
) else (
  echo OK DIARIO >> %LOG%
)

:fim
endlocal & exit /b %FALHA%
