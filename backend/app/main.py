from fastapi import FastAPI

app = FastAPI(title="PAWCHITO")

@app.get("/health")
def health():
    return {"status": "ok"}
