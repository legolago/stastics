# python-api/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import matplotlib
from routers.correspondence import router as correspondence_router

matplotlib.use("Agg")

# データベースモデルのインポート
from models import create_tables

# ルーターのインポート
from routers import correspondence, sessions, pca, factor, cluster, regression

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

# 回帰分析のインポート
try:
    from routers import regression

    regression_available = True
    print("✓ Regression router loaded from routers.regression")
except ImportError:
    regression_available = False
    print("⚠️ Regression router not found")

# FastAPIアプリケーションを作成
app = FastAPI(
    title="多変量解析API",
    version="2.0.0",
    description="コレスポンデンス分析、主成分分析、因子分析、クラスター分析、回帰分析などの多変量解析を提供するAPI",
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
app.include_router(factor.router, prefix="/api")  # 因子分析ルーターを追加

# クラスター解析ルーターを登録（prefixなしで直接登録）
app.include_router(cluster.router)  # cluster.routerは内部で "/cluster" パスを持っている
print("✓ Cluster analysis router registered")

# 回帰分析ルーターを登録
if regression_available:
    app.include_router(regression.router, prefix="/api")
    print("✓ Regression analysis router registered at /api/regression")
else:
    print("⚠️ Regression router not registered - file not found")

# デバッグ用：登録されているルートを確認
print("=== 登録されているルート一覧 ===")
for route in app.routes:
    if hasattr(route, "path") and hasattr(route, "methods"):
        print(f"Path: {route.path}, Methods: {route.methods}")
print("===========================")

# PCAルーターを条件付きで登録
# if pca_available:
#     app.include_router(pca.router, prefix="/api")
#     print("✓ PCA router registered at /api/pca")
# else:
#     print("⚠️ PCA router not registered - file not found")


@app.get("/")
async def root():
    """APIの基本情報を返す"""
    return {
        "message": "多変量解析API",
        "version": "2.0.0",
        "supported_methods": [
            "correspondence",
            "pca" if pca_available else None,
            "factor",
            "cluster",  # クラスター分析を追加
            "regression" if regression_available else None,  # 回帰分析を追加
        ],
    }


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    available_methods = ["correspondence", "pca", "factor", "cluster"]
    if regression_available:
        available_methods.append("regression")

    return {
        "status": "healthy",
        "version": "2.1.0",
        "available_methods": available_methods,
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
            "id": "pca",
            "name": "主成分分析",
            "description": "多次元データの次元削減と可視化を行う分析手法",
            "endpoint": "/api/pca/analyze",
            "status": "available",
            "parameters_endpoint": "/api/pca/parameters/validate",
            "methods_endpoint": "/api/pca/methods",
        },
        {
            "id": "factor",
            "name": "因子分析",
            "description": "観測変数の背後にある潜在因子を抽出する分析手法",
            "endpoint": "/api/factor/analyze",
            "status": "available",
            "parameters_endpoint": "/api/factor/parameters/validate",
            "methods_endpoint": "/api/factor/methods",
        },
        {
            "id": "cluster",
            "name": "クラスター解析",
            "description": "データを類似性に基づいてグループに分ける分析手法",
            "endpoint": "/api/cluster/analyze",  # 修正: prefixなしのパス
            "status": "available",
            "methods_endpoint": "/api/cluster/methods",  # 修正: prefixなしのパス
            "optimal_clusters_endpoint": "/api/cluster/optimal-clusters",  # 修正: prefixなしのパス
        },
        {
            "id": "regression",
            "name": "回帰分析",
            "description": "目的変数と説明変数の関係をモデル化する分析手法",
            "endpoint": "/api/regression/analyze",
            "status": "available",
            "parameters_endpoint": "/api/regression/parameters/validate",
            "methods_endpoint": "/api/regression/methods",
        },
    ]

    return {"methods": methods}


@app.get("/api/analysis-types")
async def get_analysis_types():
    """分析手法の詳細情報を取得"""
    analysis_types = [
        {
            "type": "correspondence",
            "name": "コレスポンデンス分析",
            "category": "関係性分析",
            "data_type": "カテゴリカル",
            "output": "散布図、寄与率",
            "use_cases": ["ブランドとイメージの関係", "商品とターゲットの分析"],
        },
        {
            "type": "pca",
            "name": "主成分分析",
            "category": "次元削減",
            "data_type": "数値",
            "output": "主成分得点、負荷量、寄与率",
            "use_cases": ["データの可視化", "次元削減", "特徴抽出"],
        },
        {
            "type": "factor",
            "name": "因子分析",
            "category": "潜在変数分析",
            "data_type": "数値",
            "output": "因子負荷量、因子得点、共通性",
            "use_cases": ["心理測定", "アンケート分析", "潜在因子の発見"],
        },
        {
            "type": "cluster",
            "name": "クラスター解析",
            "category": "分類分析",
            "data_type": "数値",
            "output": "クラスター所属、評価指標、可視化",
            "use_cases": [
                "顧客セグメンテーション",
                "商品分類",
                "市場セグメント分析",
            ],
            "methods": [
                {
                    "name": "kmeans",
                    "display_name": "K-means法",
                    "description": "事前にクラスター数を指定する代表的な手法",
                    "parameters": ["n_clusters", "standardize"],
                },
                {
                    "name": "hierarchical",
                    "display_name": "階層クラスタリング",
                    "description": "階層的にクラスターを形成し、デンドログラムで可視化",
                    "parameters": ["n_clusters", "linkage", "standardize"],
                },
                {
                    "name": "dbscan",
                    "display_name": "DBSCAN法",
                    "description": "密度ベースの手法で、クラスター数を事前に指定不要",
                    "parameters": ["eps", "min_samples", "standardize"],
                },
            ],
        },
    ]

    return {"analysis_types": analysis_types}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
