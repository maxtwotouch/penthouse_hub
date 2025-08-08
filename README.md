# Penthouse Hub

Penthouse Hub is a local home dashboard designed for a Raspberry Pi touchscreen.  
It provides quick access to shared household tools and information, including:

- **Bus Timetable** – Live departure times from nearby stops.
- **Weather** – Local forecast with temperature, wind, and precipitation.
- **Vaskeliste** – Weekly household chore assignments and completion tracking.

## Features
- Touch-friendly interface using **Tailwind CSS** and **daisyUI**.
- Backend powered by **FastAPI**.
- Local-first design – runs entirely on your home network.
- Data sources:
  - **Entur API** for public transport.
  - **api.met.no** for weather forecasts.
  - MongoDB for storing chore data.

## Requirements
- Node.js 18+
- Python 3.11+
- MongoDB instance
- Raspberry Pi with touchscreen (optional)

## Getting Started

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

Frontend

cd frontend
npm install
npm run dev
