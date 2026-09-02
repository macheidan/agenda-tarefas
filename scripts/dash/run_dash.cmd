@echo off
rem Coleta diaria do Dash (Task Scheduler "DashboardColeta3h", todo dia 03:00).
rem Roda os coletores (vendas do Saipos, IA, agenda, YouTube, GitHub, newsletters),
rem consolida em data\dashboard-data.json e publica via FTPS em
rem fabiomachado.com.br/pizzas/data/dashboard-data-<token>.json, que o Dash e a
rem Mesa do Dono da intranet leem (VITE_DASH_TOKEN).
rem 03:00 e antes das outras automacoes que usam o MESMO perfil de browser
rem (MotoboysColeta3h 03:20, ClientesColeta 04:10) — duas juntas travam no lock.
cd /d C:\claude_project\Pizzarias\intranet-pizzarias\scripts\dash
if not exist data mkdir data
echo. >> data\runner.log
echo ===== %DATE% %TIME% ===== >> data\runner.log
rem --headless: Saipos sem janela (login automatico funciona; mais leve e nao
rem depende de desktop interativo as 03h, que e onde o browser travava).
"C:\Python314\python.exe" runner.py --headless >> data\runner.log 2>&1
