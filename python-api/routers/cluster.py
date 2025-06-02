# python-api/routers/cluster.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
from typing import Optional, List

from models import get_db
from analysis.cluster import ClusterAnalyzer

router = APIRouter(prefix="/cluster", tags=["cluster"])


@router.post("/analyze")
async def analyze_cluster(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    method: str = Query("kmeans", description="クラスター手法"),
    n_clusters: int = Query(3, description="クラスター数"),
    standardize: bool = Query(True, description="データを標準化するか"),
    # K-means用パラメータ
    max_iter: int = Query(300, description="K-means最大反復回数"),
    random_state: int = Query(42, description="乱数シード"),
    # 階層クラスタリング用パラメータ
    linkage: str = Query("ward", description="階層クラスタリングのリンケージ"),
    # DBSCAN用パラメータ
    eps: float = Query(0.5, description="DBSCAN epsilon値"),
    min_samples: int = Query(5, description="DBSCAN最小サンプル数"),
    db: Session = Depends(get_db),
):
    """クラスター解析を実行"""
    try:
        print(f"=== クラスター解析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"手法: {method}, クラスター数: {n_clusters}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        print(f"CSVテキスト:\n{csv_text}")

        df = pd.read_csv(io.StringIO(csv_text), index_col=0)
        print(f"データフレーム:\n{df}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 数値データの確認
        numeric_cols = df.select_dtypes(include=["number"]).columns
        if len(numeric_cols) == 0:
            raise HTTPException(status_code=400, detail="数値データが見つかりません")

        # メソッド別パラメータ検証
        if method not in ["kmeans", "hierarchical", "dbscan"]:
            raise HTTPException(
                status_code=400,
                detail="サポートされていないクラスター手法です。kmeans, hierarchical, dbscan のいずれかを選択してください",
            )

        if method in ["kmeans", "hierarchical"] and n_clusters < 2:
            raise HTTPException(
                status_code=400, detail="クラスター数は2以上である必要があります"
            )

        if method in ["kmeans", "hierarchical"] and n_clusters > len(df):
            raise HTTPException(
                status_code=400,
                detail="クラスター数はサンプル数以下である必要があります",
            )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # メソッド別パラメータ設定
        method_params = {}
        if method == "kmeans":
            method_params.update(
                {
                    "max_iter": max_iter,
                    "random_state": random_state,
                }
            )
        elif method == "hierarchical":
            method_params.update(
                {
                    "linkage": linkage,
                }
            )
        elif method == "dbscan":
            method_params.update(
                {
                    "eps": eps,
                    "min_samples": min_samples,
                }
            )

        # 分析実行（BaseAnalyzerのパイプラインを使用）
        analyzer = ClusterAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            method=method,
            n_clusters=n_clusters,
            standardize=standardize,
            **method_params,
        )

        print("=== クラスター解析API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== クラスター解析API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"クラスター解析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_cluster_methods():
    """クラスター解析で利用可能な手法一覧を取得"""
    return {
        "methods": [
            {
                "name": "kmeans",
                "display_name": "K-means法",
                "description": "最も一般的なクラスタリング手法。クラスター数を事前に指定する必要があります。",
                "parameters": {
                    "n_clusters": {
                        "type": "integer",
                        "default": 3,
                        "min": 2,
                        "max": 20,
                        "description": "クラスター数",
                    },
                    "max_iter": {
                        "type": "integer",
                        "default": 300,
                        "min": 50,
                        "max": 1000,
                        "description": "最大反復回数",
                    },
                    "random_state": {
                        "type": "integer",
                        "default": 42,
                        "min": 0,
                        "max": 9999,
                        "description": "乱数シード",
                    },
                },
            },
            {
                "name": "hierarchical",
                "display_name": "階層クラスタリング",
                "description": "階層的にクラスターを形成する手法。デンドログラムで可視化できます。",
                "parameters": {
                    "n_clusters": {
                        "type": "integer",
                        "default": 3,
                        "min": 2,
                        "max": 20,
                        "description": "クラスター数",
                    },
                    "linkage": {
                        "type": "string",
                        "default": "ward",
                        "options": ["ward", "complete", "average", "single"],
                        "description": "リンケージ手法",
                    },
                },
            },
            {
                "name": "dbscan",
                "display_name": "DBSCAN法",
                "description": "密度ベースのクラスタリング手法。クラスター数を事前に指定する必要がありません。",
                "parameters": {
                    "eps": {
                        "type": "float",
                        "default": 0.5,
                        "min": 0.1,
                        "max": 5.0,
                        "description": "近傍の半径（epsilon）",
                    },
                    "min_samples": {
                        "type": "integer",
                        "default": 5,
                        "min": 2,
                        "max": 50,
                        "description": "コアポイントとなる最小サンプル数",
                    },
                },
            },
        ]
    }


@router.get("/parameters/validate")
async def validate_cluster_parameters(
    method: str = Query(..., description="クラスター手法"),
    n_clusters: int = Query(3, description="クラスター数"),
    eps: float = Query(0.5, description="DBSCAN epsilon値"),
    min_samples: int = Query(5, description="DBSCAN最小サンプル数"),
    max_iter: int = Query(300, description="K-means最大反復回数"),
):
    """クラスター解析パラメータの妥当性をチェック"""
    errors = []

    # 手法の検証
    if method not in ["kmeans", "hierarchical", "dbscan"]:
        errors.append("サポートされていないクラスター手法です")

    # 共通パラメータの検証
    if method in ["kmeans", "hierarchical"]:
        if n_clusters < 2:
            errors.append("クラスター数は2以上である必要があります")
        if n_clusters > 20:
            errors.append("クラスター数は20以下である必要があります")

    # K-means固有パラメータの検証
    if method == "kmeans":
        if max_iter < 50:
            errors.append("最大反復回数は50以上である必要があります")
        if max_iter > 1000:
            errors.append("最大反復回数は1000以下である必要があります")

    # DBSCAN固有パラメータの検証
    if method == "dbscan":
        if eps <= 0:
            errors.append("epsilon値は0より大きい値である必要があります")
        if eps > 5.0:
            errors.append("epsilon値は5.0以下である必要があります")
        if min_samples < 2:
            errors.append("最小サンプル数は2以上である必要があります")
        if min_samples > 50:
            errors.append("最小サンプル数は50以下である必要があります")

    return {"valid": len(errors) == 0, "errors": errors}


@router.get("/evaluation-metrics")
async def get_evaluation_metrics_info():
    """クラスター評価指標の説明を取得"""
    return {
        "metrics": [
            {
                "name": "silhouette_score",
                "display_name": "シルエット係数",
                "description": "クラスター内の凝集度とクラスター間の分離度を測る指標。-1から1の範囲で、1に近いほど良い。",
                "range": "[-1, 1]",
                "better": "higher",
            },
            {
                "name": "calinski_harabasz_score",
                "display_name": "Calinski-Harabasz指標",
                "description": "クラスター間分散とクラスター内分散の比。値が大きいほど良い。",
                "range": "[0, ∞)",
                "better": "higher",
            },
            {
                "name": "davies_bouldin_score",
                "display_name": "Davies-Bouldin指標",
                "description": "クラスター内距離とクラスター間距離の比の平均。値が小さいほど良い。",
                "range": "[0, ∞)",
                "better": "lower",
            },
            {
                "name": "noise_ratio",
                "display_name": "ノイズ率",
                "description": "DBSCANにおけるノイズポイントの割合。",
                "range": "[0, 1]",
                "better": "lower",
            },
        ]
    }


@router.post("/optimal-clusters")
async def find_optimal_clusters(
    file: UploadFile = File(...),
    method: str = Query("kmeans", description="クラスター手法"),
    max_clusters: int = Query(10, description="最大クラスター数"),
    standardize: bool = Query(True, description="データを標準化するか"),
):
    """最適なクラスター数を探索（エルボー法・シルエット分析）"""
    try:
        print(f"=== 最適クラスター数探索開始 ===")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        df = pd.read_csv(io.StringIO(csv_text), index_col=0)

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 数値データの確認
        numeric_cols = df.select_dtypes(include=["number"]).columns
        if len(numeric_cols) == 0:
            raise HTTPException(status_code=400, detail="数値データが見つかりません")

        # DBSCANは対象外
        if method == "dbscan":
            raise HTTPException(
                status_code=400,
                detail="DBSCANは事前にクラスター数を指定しないため、この機能は利用できません",
            )

        # データ前処理
        analyzer = ClusterAnalyzer()
        df_processed = analyzer._preprocess_cluster_data(df, standardize)

        # クラスター数を変えて評価
        cluster_range = range(2, min(max_clusters + 1, len(df)))
        results = []

        for k in cluster_range:
            try:
                if method == "kmeans":
                    cluster_result = analyzer._compute_kmeans(df_processed, k)
                    inertia = cluster_result.get("inertia", 0)
                elif method == "hierarchical":
                    cluster_result = analyzer._compute_hierarchical(df_processed, k)
                    inertia = 0  # 階層クラスタリングには慣性がない

                labels = cluster_result["labels"]
                evaluation_metrics = analyzer._compute_evaluation_metrics(
                    df_processed, labels
                )

                results.append(
                    {
                        "n_clusters": k,
                        "inertia": float(inertia),
                        "silhouette_score": evaluation_metrics.get(
                            "silhouette_score", 0
                        ),
                        "calinski_harabasz_score": evaluation_metrics.get(
                            "calinski_harabasz_score", 0
                        ),
                        "davies_bouldin_score": evaluation_metrics.get(
                            "davies_bouldin_score", 0
                        ),
                    }
                )

            except Exception as e:
                print(f"クラスター数{k}での計算エラー: {e}")
                continue

        if not results:
            raise HTTPException(
                status_code=500, detail="最適クラスター数の計算に失敗しました"
            )

        # 最適クラスター数の推奨
        recommendations = []

        # シルエット係数による推奨
        best_silhouette = max(results, key=lambda x: x["silhouette_score"])
        recommendations.append(
            {
                "method": "silhouette_score",
                "recommended_clusters": best_silhouette["n_clusters"],
                "score": best_silhouette["silhouette_score"],
                "reason": "シルエット係数が最大",
            }
        )

        # Calinski-Harabasz指標による推奨
        best_ch = max(results, key=lambda x: x["calinski_harabasz_score"])
        recommendations.append(
            {
                "method": "calinski_harabasz",
                "recommended_clusters": best_ch["n_clusters"],
                "score": best_ch["calinski_harabasz_score"],
                "reason": "Calinski-Harabasz指標が最大",
            }
        )

        # Davies-Bouldin指標による推奨（小さいほど良い）
        best_db = min(results, key=lambda x: x["davies_bouldin_score"])
        recommendations.append(
            {
                "method": "davies_bouldin",
                "recommended_clusters": best_db["n_clusters"],
                "score": best_db["davies_bouldin_score"],
                "reason": "Davies-Bouldin指標が最小",
            }
        )

        return {
            "success": True,
            "method": method,
            "evaluated_range": [min(cluster_range), max(cluster_range)],
            "results": results,
            "recommendations": recommendations,
            "metadata": {
                "filename": file.filename,
                "rows": df.shape[0],
                "columns": df.shape[1],
                "standardized": standardize,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"最適クラスター数探索エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500,
            detail=f"最適クラスター数探索中にエラーが発生しました: {str(e)}",
        )
