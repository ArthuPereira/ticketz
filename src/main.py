from fastapi import FastAPI
from src.evento.router import router as evento_router

app = FastAPI(
    title="Ticketz API",
    description="Backend para plataforma de reserva e emissão de ingressos",
    version="1.0.0"
)

app.include_router(evento_router)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API do Ticketz operante"}
