from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import matplotlib
import logging

matplotlib.use("Agg")

# データベースモデルのインポート
from models import create_tables

# ログ設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ルーターのインポートと可用性チェック
routers_status = {}

# 基本ルーター（必須）
try:
    from routers import correspondence, sessions

    routers_status["correspondence"] = True
    routers_status["sessions"] = True
    print("✓ Core routers loaded (correspondence, sessions)")
except ImportError as e:
    print(f"❌ Core routers import error: {e}")
    routers_status["correspondence"] = False
    routers_status["sessions"] = False

# PCA ルーター
try:
    from routers import pca

    routers_status["pca"] = True
    print("✓ PCA router loaded")
except ImportError:
    routers_status["pca"] = False
    print("⚠️ PCA router not found")

# 因子分析ルーター
try:
    from routers import factor

    routers_status["factor"] = True
    print("✓ Factor router loaded")
except ImportError:
    routers_status["factor"] = False
    print("⚠️ Factor router not found")

# クラスター分析ルーター
try:
    from routers import cluster

    routers_status["cluster"] = True
    print("✓ Cluster router loaded")
except ImportError:
    routers_status["cluster"] = False
    print("⚠️ Cluster router not found")

# 回帰分析ルーター
try:
    from routers import regression

    routers_status["regression"] = True
    print("✓ Regression router loaded")
except ImportError:
    routers_status["regression"] = False
    print("⚠️ Regression router not found")

# RFM分析ルーター
try:
    from routers import rfm

    routers_status["rfm"] = True
    print("✓ RFM router loaded")
except ImportError:
    routers_status["rfm"] = False
    print("⚠️ RFM router not found")

# FastAPIアプリケーションを作成
app = FastAPI(
    title="多変量解析API",
    version="2.1.0",
    description="コレスポンデンス分析、主成分分析、因子分析、クラスター分析、回帰分析、RFM分析などの多変量解析を提供するAPI",
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
print("📋 Registering routers:")

# 基本ルーター（必須）
if routers_status["correspondence"]:
    app.include_router(correspondence.router, prefix="/api")
    print("  ✓ Correspondence: /api/correspondence")

if routers_status["sessions"]:
    app.include_router(sessions.router, prefix="/api")
    print("  ✓ Sessions: /api/sessions")

# 分析手法ルーター（オプション）
if routers_status["pca"]:
    app.include_router(pca.router, prefix="/api")
    print("  ✓ PCA: /api/pca")

if routers_status["factor"]:
    app.include_router(factor.router, prefix="/api")
    print("  ✓ Factor: /api/factor")

if routers_status["cluster"]:
    app.include_router(cluster.router, prefix="/api")
    print("  ✓ Cluster: /api/cluster")

if routers_status["regression"]:
    app.include_router(regression.router, prefix="/api")
    print("  ✓ Regression: /api/regression")

if routers_status["rfm"]:
    app.include_router(rfm.router, prefix="/api")
    print("  ✓ RFM: /api/rfm")

print(
    f"📋 Router registration complete. Active routers: {sum(routers_status.values())}/{len(routers_status)}"
)


@app.get("/")
async def root():
    """APIの基本情報を返す"""
    supported_methods = []

    # 利用可能な分析手法を動的に追加
    if routers_status["correspondence"]:
        supported_methods.append("correspondence")
    if routers_status["pca"]:
        supported_methods.append("pca")
    if routers_status["factor"]:
        supported_methods.append("factor")
    if routers_status["cluster"]:
        supported_methods.append("cluster")
    if routers_status["regression"]:
        supported_methods.append("regression")
    if routers_status["rfm"]:
        supported_methods.append("rfm")

    return {
        "message": "多変量解析API",
        "version": "2.1.0",
        "supported_methods": supported_methods,
        "router_status": routers_status,
    }


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {
        "status": "healthy",
        "version": "2.1.0",
        "routers_status": routers_status,
        "active_routers": sum(routers_status.values()),
        "total_routers": len(routers_status),
    }


@app.get("/api/methods")
async def get_available_methods():
    """利用可能な分析手法一覧を取得"""
    methods = []

    # コレスポンデンス分析
    if routers_status["correspondence"]:
        methods.append(
            {
                "id": "correspondence",
                "name": "コレスポンデンス分析",
                "description": "カテゴリカルデータの関係性を可視化する分析手法",
                "endpoint": "/api/correspondence/analyze",
                "status": "available",
            }
        )

    # 主成分分析
    if routers_status["pca"]:
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

    # 因子分析
    if routers_status["factor"]:
        methods.append(
            {
                "id": "factor",
                "name": "因子分析",
                "description": "潜在的な因子構造を発見する分析手法",
                "endpoint": "/api/factor/analyze",
                "status": "available",
                "parameters_endpoint": "/api/factor/parameters/validate",
                "methods_endpoint": "/api/factor/methods",
                "download_endpoints": {
                    "loadings": "/api/factor/download/{session_id}/loadings",
                    "scores": "/api/factor/download/{session_id}/scores",
                    "details": "/api/factor/download/{session_id}/details",
                },
            }
        )

    # クラスター分析
    if routers_status["cluster"]:
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
                    "details": "/api/cluster/download/{session_id}/details",
                },
            }
        )

    # 回帰分析
    if routers_status["regression"]:
        methods.append(
            {
                "id": "regression",
                "name": "回帰分析",
                "description": "変数間の関係性をモデル化し予測を行う分析手法",
                "endpoint": "/api/regression/analyze",
                "status": "available",
                "parameters_endpoint": "/api/regression/parameters/validate",
                "methods_endpoint": "/api/regression/methods",
                "session_detail_endpoint": "/api/regression/sessions/{session_id}",
                "download_endpoints": {
                    "predictions": "/api/regression/download/{session_id}/predictions",
                    "details": "/api/regression/download/{session_id}/details",
                },
                "supported_methods": [
                    {
                        "name": "linear",
                        "display_name": "単回帰分析",
                        "description": "1つの説明変数による線形回帰",
                        "required_params": {
                            "target_variable": "目的変数（従属変数）",
                            "explanatory_variables": "説明変数（独立変数）- 1つのみ",
                        },
                    },
                    {
                        "name": "multiple",
                        "display_name": "重回帰分析",
                        "description": "複数の説明変数による線形回帰",
                        "required_params": {
                            "target_variable": "目的変数（従属変数）",
                            "explanatory_variables": "説明変数（独立変数）- カンマ区切りで複数指定",
                        },
                    },
                    {
                        "name": "polynomial",
                        "display_name": "多項式回帰分析",
                        "description": "1つの説明変数による多項式回帰",
                        "required_params": {
                            "target_variable": "目的変数（従属変数）",
                            "explanatory_variables": "説明変数（独立変数）- 1つのみ",
                            "polynomial_degree": "多項式の次数（1-6）",
                        },
                    },
                ],
                "parameter_examples": {
                    "target_variable": "例: sales, price, score",
                    "explanatory_variables": "例: age,income,education (カンマ区切り)",
                    "polynomial_degree": "例: 2 (2次式), 3 (3次式)",
                    "test_size": "例: 0.2 (20%をテストデータに使用)",
                    "standardize": "例: true (説明変数を標準化)",
                },
            }
        )

    # RFM分析
    if routers_status["rfm"]:
        methods.append(
            {
                "id": "rfm",
                "name": "RFM分析",
                "description": "顧客の購買行動を分析し、セグメント分類を行う手法",
                "endpoint": "/api/rfm/analyze",
                "status": "available",
                "parameters_endpoint": "/api/rfm/parameters/validate",
                "methods_endpoint": "/api/rfm/methods",
                "interpretation_endpoint": "/api/rfm/interpretation",
                "download_endpoints": {
                    "customers": "/api/rfm/download/{session_id}/customers",
                    "segments": "/api/rfm/download/{session_id}/segments",
                    "details": "/api/rfm/download/{session_id}/details",
                },
                "required_columns": {
                    "customer_id": "顧客ID列（例: id, customer_id）",
                    "date": "購入日付列（例: date, purchase_date）",
                    "amount": "購入金額列（例: price, amount, total）",
                },
                "supported_segments": [
                    "VIP顧客",
                    "優良顧客",
                    "新規顧客",
                    "要注意ヘビーユーザー",
                    "安定顧客",
                    "見込み顧客",
                    "離脱した優良顧客",
                    "離脱しつつある顧客",
                    "離脱顧客",
                ],
            }
        )

    return {"methods": methods}


@app.get("/api/status")
async def get_router_status():
    """各ルーターの詳細ステータスを取得"""
    return {
        "routers": routers_status,
        "summary": {
            "total": len(routers_status),
            "active": sum(routers_status.values()),
            "inactive": len(routers_status) - sum(routers_status.values()),
        },
        "endpoints": {
            router_name: f"/api/{router_name}"
            for router_name, status in routers_status.items()
            if status
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
