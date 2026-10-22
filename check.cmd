@echo off
rem lisp-toolkit / check.cmd -- one command, Windows.
rem Requires SBCL on PATH, or set SBCL=C:\path\to\sbcl.exe
setlocal
if "%SBCL%"=="" set "SBCL=sbcl"
if exist "%SBCL%" goto have_sbcl
where %SBCL% >nul 2>nul || goto no_sbcl

:have_sbcl
set FAIL=0

echo == check-parens ==
"%SBCL%" --script tools\check-parens.lisp tools
if errorlevel 1 set FAIL=1

echo.
echo == check-format ==
"%SBCL%" --script tools\check-format.lisp tools
if errorlevel 1 set FAIL=1

echo.
echo == check-encoding ==
"%SBCL%" --script tools\check-encoding.lisp tools README.md check.cmd check.sh skills
if errorlevel 1 set FAIL=1

echo.
if "%FAIL%"=="0" (echo -- all checks passed) else (echo -- some checks failed)
exit /b %FAIL%

:no_sbcl
echo sbcl not found. Install SBCL from https://www.sbcl.org/ or set SBCL=path\to\sbcl.exe
exit /b 127
