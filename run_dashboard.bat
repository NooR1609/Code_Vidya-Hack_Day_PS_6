@echo off
title VisionTraffic AI - Vehicle Detection Dashboard
echo ======================================================================
echo    VisionTraffic AI - Live Vehicle Monitoring & Analytics Dashboard
echo ======================================================================
echo.
echo [1/2] Starting Flask OpenCV Streaming Server on http://localhost:5000 ...
start "" "http://localhost:5000"
python app.py
pause
