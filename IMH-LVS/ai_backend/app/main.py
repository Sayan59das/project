from fastapi import FastAPI
from app.api.v1 import endpoints

app = FastAPI(
    title="IMH Label Verification System (LVS) Microservice",
    description="Backend microservice for label extraction and comparison",
    version="1.0.0"
)

app.include_router(endpoints.router, prefix="/api/v1", tags=["Label Verification"])

@app.get("/")
def read_root():
    return {"message": "Welcome to IMH LVS Microservice API"}
