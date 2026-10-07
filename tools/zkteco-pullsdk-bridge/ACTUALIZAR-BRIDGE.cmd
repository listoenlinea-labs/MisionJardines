@echo off
setlocal
cd /d "%~dp0\..\.."

where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "tools\zkteco-pullsdk-bridge\bridge_manager.py" %*
) else (
  python "tools\zkteco-pullsdk-bridge\bridge_manager.py" %*
)

set EXITCODE=%errorlevel%
echo.
if not "%EXITCODE%"=="0" (
  echo El administrador termino con error %EXITCODE%.
) else (
  echo Proceso completado correctamente.
)
echo.
pause
exit /b %EXITCODE%
