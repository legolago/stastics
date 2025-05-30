from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import matplotlib
from routers.correspondence import router as correspondence_router

matplotlib.use("Agg")

# データベースモデルのインポート
from models import create_tables

# ルーターのインポート
from routers import correspondence, sessions

# FastAPIアプリケーションを作成
app = FastAPI(
    title="多変量解析API",
    version="2.0.0",
    description="コレスポンデンス分析、主成分分析、因子分析などの多変量解析を提供するAPI",
)

# データベーステーブルを作成
create_tables()

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーターを登録
app.include_router(correspondence.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
# app.include_router(sessions.router)  # prefixなしでも登録（既存コード互換性のため）
# app.include_router(correspondence_router)  # /correspondence/analyze など


@app.get("/")
async def root():
    """APIの基本情報を返す"""
    return {
        "message": "多変量解析API",
        "version": "2.0.0",
        "supported_methods": ["correspondence", "pca", "factor", "cluster"],
    }


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {"status": "healthy", "version": "2.0.0"}


@app.get("/api/methods")
async def get_available_methods():
    """利用可能な分析手法一覧を取得"""
    return {
        "methods": [
            {
                "id": "correspondence",
                "name": "コレスポンデンス分析",
                "description": "カテゴリカルデータの関係性を可視化する分析手法",
                "endpoint": "/api/correspondence/analyze",
                "status": "available",
            },
        ]
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
