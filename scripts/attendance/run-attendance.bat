@echo off
cd /d "C:\Users\suzzz\Desktop\iloom_workspace\1. 일룸 영업직군 교육\1) 입문교육"
node scripts/attendance/fetch-attendance.js >> scripts/attendance/logs.txt 2>&1
