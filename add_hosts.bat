@echo off
echo 127.0.0.1 www.sportsdynasty.com sportsdynasty.com >> "%WINDIR%\System32\drivers\etc\hosts"
ipconfig /flushdns >nul
