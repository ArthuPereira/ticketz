from fastapi import FastAPI

app = FastAPI(
    title="Ticketz API",
    description="Backend para plataforma de reserva e emissão de ingressos",
    version="1.0.0"
)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "API do Ticketz operante"}