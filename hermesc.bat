@echo off
REM WSL wrapper for hermesc - runs Linux hermesc binary through WSL
node "F:\AegisAndroid\hermesc_wsl.js" %*
exit /b %errorlevel%
