@echo off
set PORT=8000
set URL=http://localhost:%PORT%/
start %URL%
python -m http.server %PORT%
