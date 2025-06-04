# main.py の修正版（クラスター分析を追加）

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import matplotlib
from routers.correspondence import router as correspondence_router

matplotlib.use("Agg")

# データベースモデルのインポート
from models import create_tables

# ルーターのインポート
from routers import correspondence, sessions, pca, factor, cluster

# PCAのインポート - ファイルの場所に応じて以下のいずれかを使用
try:
    from routers import pca  # routers/pca.py にある場合
    pca_available = True
    print("✓ PCA router loaded from routers.pca")
except ImportError:
    try:
        import pca  # ルートディレクトリのpca.py にある場合
        pca_available = True
        print("✓ PCA router loaded from pca")
    except ImportError:
        pca_available = False
        print("⚠️ PCA router not found")

# クラスター分析のインポート
try:
    from routers import cluster
    cluster_available = True
    print("✓ Cluster router loaded from routers.cluster")
except ImportError:
    cluster_available = False
    print("⚠️ Cluster router not found")

# FastAPIアプリケーションを作成
app = FastAPI(
    title="多変量解析API",
    version="2.0.0",
    description="コレスポンデンス分析、主成分分析、因子分析、クラスター分析などの多変量解析を提供するAPI",
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
app.include_router(pca.router, prefix="/api")
app.include_router(factor.router, prefix="/api")  # 因子分析ルーター

# クラスター分析ルーターを条件付きで登録
if cluster_available:
    app.include_router(cluster.router, prefix="/api")
    print("✓ Cluster router registered at /api/cluster")
else:
    print("⚠️ Cluster router not registered - file not found")


@app.get("/")
async def root():
    """APIの基本情報を返す"""
    supported_methods = ["correspondence", "factor"]
    
    if pca_available:
        supported_methods.append("pca")
    
    if cluster_available:
        supported_methods.append("cluster")
    
    return {
        "message": "多変量解析API",
        "version": "2.0.0",
        "supported_methods": supported_methods,
    }


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {
        "status": "healthy", 
        "version": "2.0.0", 
        "pca_available": pca_available,
        "cluster_available": cluster_available
    }


@app.get("/api/methods")
async def get_available_methods():
    """利用可能な分析手法一覧を取得"""
    methods = [
        {
            "id": "correspondence",
            "name": "コレスポンデンス分析",
            "description": "カテゴリカルデータの関係性を可視化する分析手法",
            "endpoint": "/api/correspondence/analyze",
            "status": "available",
        },
        {
            "id": "factor",
            "name": "因子分析",
            "description": "潜在的な因子構造を発見する分析手法",
            "endpoint": "/api/factor/analyze",
            "status": "available",
        }
    ]

    if pca_available:
        methods.append(
            {
                "id": "pca",
                "name": "主成分分析",
                "description": "多次元データの次元削減と可視化を行う分析手法",
                "endpoint": "/api/pca/analyze",
                "status": "available",
                "parameters_endpoint": "/api/pca/parameters/validate",
                "methods_endpoint": "/api/pca/methods",
            }
        )

    if cluster_available:
        methods.append(
            {
                "id": "cluster",
                "name": "クラスター分析",
                "description": "データをグループに分類する分析手法",
                "endpoint": "/api/cluster/analyze",
                "status": "available",
                "parameters_endpoint": "/api/cluster/parameters/validate",
                "methods_endpoint": "/api/cluster/methods",
                "download_endpoints": {
                    "assignments": "/api/cluster/download/{session_id}/assignments",
                    "details": "/api/cluster/download/{session_id}/details"
                }
            }
        )

    return {"methods": methods}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)