from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from routers import jurisdictions, officials, outreach, interactions, vendors, brief, search

app = FastAPI(title="CES Idaho Regional Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ces.quietimpact.ai", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(jurisdictions.router, prefix="/api")
app.include_router(officials.router, prefix="/api")
app.include_router(outreach.router, prefix="/api")
app.include_router(interactions.router, prefix="/api")
app.include_router(vendors.router, prefix="/api")
app.include_router(brief.router, prefix="/api")
app.include_router(search.router, prefix="/api")

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/manifest.json")
async def manifest():
    return FileResponse(os.path.join(STATIC_DIR, "manifest.json"), media_type="application/manifest+json")


@app.get("/sw.js")
async def service_worker():
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")


@app.get("/icons/{filename}")
async def icons(filename: str):
    return FileResponse(os.path.join(STATIC_DIR, "icons", filename))


@app.get("/")
@app.get("/{path:path}")
async def spa_fallback(request: Request, path: str = ""):
    if path.startswith("api/") or path.startswith("static/"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))
