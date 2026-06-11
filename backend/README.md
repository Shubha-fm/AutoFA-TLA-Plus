# AutoFA-TLA+ Backend

FastAPI backend for validation, TLA+ generation, CFG generation, and lightweight verification.

## Run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API runs at `http://localhost:8000`.
