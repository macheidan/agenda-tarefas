@echo off
rem Coleta as entregas por motoboy no Saipos e importa para a intranet.
rem Uso: run_motoboys.cmd [3h^|9h^|manual]   (default: manual)
rem Agendado no Task Scheduler: quarta 03:20 (3h) e quarta 09:00 (9h, fallback).
setlocal
set FONTE=%1
if "%FONTE%"=="" set FONTE=manual
cd /d C:\claude_project\Pizzarias\intranet-pizzarias
if not exist scripts\motoboys\data mkdir scripts\motoboys\data
set LOG=scripts\motoboys\data\runner.log

echo. >> %LOG%
echo ===== %date% %time% fonte=%FONTE% ===== >> %LOG%

rem Semana alvo: segunda-feira da semana passada.
for /f %%d in ('python -c "from datetime import date,timedelta;h=date.today();print((h-timedelta(days=h.weekday()+7)).isoformat())"') do set SEMANA=%%d
echo semana=%SEMANA% >> %LOG%

rem Fallback (9h): se a rodada das 3h ja importou as duas lojas, nao repete.
if "%FONTE%"=="9h" (
  node scripts\motoboys\importar_pa.mjs --check-done --semana %SEMANA% >> %LOG% 2>&1
  if not errorlevel 1 (
    echo 9h: ja importado, saindo >> %LOG%
    goto :fim
  )
)

python scripts\motoboys\coletar_saipos.py --semana %SEMANA% >> %LOG% 2>&1
if errorlevel 1 (
  echo COLETA FALHOU >> %LOG%
  goto :fim
)

node scripts\motoboys\importar_pa.mjs scripts\motoboys\data\pa-%SEMANA%.json --fonte %FONTE% >> %LOG% 2>&1
if errorlevel 1 (
  echo IMPORTACAO FALHOU >> %LOG%
) else (
  echo OK >> %LOG%
)

:fim
endlocal
