# python-api/routers/cluster.py
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional, List
import pandas as pd
import io

from models import get_db
from analysis.cluster import ClusterAnalyzer

router = APIRouter(prefix="/cluster", tags=["cluster"])


@router.post("/analyze")
async def analyze_cluster(
    file: UploadFile = File(...),
    session_name: str = Form(...),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    user_id: str = Form("default"),
    method: str = Form("kmeans"),  # kmeans, hierarchical, dbscan
    n_clusters: int = Form(3),
    standardize: bool = Form(True),
    linkage: str = Form(
        "ward"
    ),  # ward, complete, average, single (階層クラスタリング用)
    eps: float = Form(0.5),  # DBSCAN用
    min_samples: int = Form(5),  # DBSCAN用
    db: Session = Depends(get_db),
):
    """
    クラスター解析を実行

    Parameters:
    - file: CSVファイル
    - session_name: セッション名
    - description: 説明（オプション）
    - tags: タグ（カンマ区切り、オプション）
    - user_id: ユーザーID
    - method: クラスタリング手法 (kmeans, hierarchical, dbscan)
    - n_clusters: クラスター数 (kmeans, hierarchical用)
    - standardize: データの標準化を行うか
    - linkage: 結合方法 (階層クラスタリング用: ward, complete, average, single)
    - eps: 近傍半径 (DBSCAN用)
    - min_samples: 最小サンプル数 (DBSCAN用)
    """
    try:
        print(f"=== クラスター解析API開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"手法: {method}, クラスター数: {n_clusters}")
        print(f"ユーザーID: {user_id}, セッション名: {session_name}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(
                status_code=400, detail="CSVファイルのみサポートしています"
            )

        # CSVファイルを読み込み
        try:
            csv_content = await file.read()
            csv_text = csv_content.decode("utf-8")
            df = pd.read_csv(io.StringIO(csv_text), index_col=0)
            print(f"CSV読み込み完了: {df.shape}")
        except Exception as e:
            print(f"CSV読み込みエラー: {e}")
            raise HTTPException(
                status_code=400, detail=f"CSVファイルの読み込みに失敗しました: {str(e)}"
            )

        # データの基本検証
        if df.empty:
            raise HTTPException(status_code=400, detail="空のデータです")

        if df.shape[0] < 2:
            raise HTTPException(
                status_code=400, detail="クラスター分析には最低2つのサンプルが必要です"
            )

        # タグの処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # クラスター解析の実行
        analyzer = ClusterAnalyzer()

        # パラメータの設定
        kwargs = {}
        if method == "hierarchical":
            kwargs["linkage"] = linkage
        elif method == "dbscan":
            kwargs["eps"] = eps
            kwargs["min_samples"] = min_samples
            # DBSCANの場合はn_clustersは自動決定されるため、実際の値で上書き

        # 完全な分析パイプラインを実行
        result = analyzer.run_full_analysis(
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
            **kwargs,
        )

        print(f"クラスター解析完了: session_id={result['session_id']}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"クラスター解析API全体エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"クラスター解析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_clustering_methods():
    """利用可能なクラスタリング手法の一覧を取得"""
    return {
        "methods": [
            {
                "value": "kmeans",
                "label": "K-means法",
                "description": "事前にクラスター数を指定する分割クラスタリング",
                "parameters": ["n_clusters"],
            },
            {
                "value": "hierarchical",
                "label": "階層クラスタリング",
                "description": "サンプル間の距離に基づく階層的なクラスタリング",
                "parameters": ["n_clusters", "linkage"],
            },
            {
                "value": "dbscan",
                "label": "DBSCAN法",
                "description": "密度ベースのクラスタリング（ノイズ検出可能）",
                "parameters": ["eps", "min_samples"],
            },
        ],
        "linkage_methods": [
            {"value": "ward", "label": "Ward法"},
            {"value": "complete", "label": "完全結合法"},
            {"value": "average", "label": "平均結合法"},
            {"value": "single", "label": "単一結合法"},
        ],
    }


@router.get("/optimal-clusters")
async def suggest_optimal_clusters(
    file: UploadFile = File(...),
    method: str = "kmeans",
    max_k: int = 10,
    standardize: bool = True,
):
    """
    最適なクラスター数の提案（エルボー法とシルエット分析）
    """
    try:
        print(f"最適クラスター数分析開始: {file.filename}")

        # CSVファイルを読み込み
        csv_content = await file.read()
        csv_text = csv_content.decode("utf-8")
        df = pd.read_csv(io.StringIO(csv_text), index_col=0)

        if df.empty or df.shape[0] < 2:
            raise HTTPException(status_code=400, detail="データが不足しています")

        # データの前処理
        analyzer = ClusterAnalyzer()
        df_processed = analyzer._preprocess_data(df, standardize)

        # K=2からmax_kまでの評価
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score

        max_k = min(max_k, len(df) - 1)
        results = {"k_values": [], "inertias": [], "silhouette_scores": []}

        for k in range(2, max_k + 1):
            try:
                kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                labels = kmeans.fit_predict(df_processed)

                inertia = kmeans.inertia_
                silhouette = silhouette_score(df_processed, labels)

                results["k_values"].append(k)
                results["inertias"].append(float(inertia))
                results["silhouette_scores"].append(float(silhouette))

            except Exception as e:
                print(f"K={k}での評価エラー: {e}")

        # 最適クラスター数の推定
        if results["silhouette_scores"]:
            best_k_silhouette = results["k_values"][
                results["silhouette_scores"].index(max(results["silhouette_scores"]))
            ]

            # エルボー法による推定（簡易版）
            inertias = results["inertias"]
            if len(inertias) >= 3:
                # 差分の変化率を計算
                diff1 = [
                    inertias[i] - inertias[i + 1] for i in range(len(inertias) - 1)
                ]
                diff2 = [diff1[i] - diff1[i + 1] for i in range(len(diff1) - 1)]
                best_k_elbow = (
                    results["k_values"][diff2.index(max(diff2)) + 2]
                    if diff2
                    else best_k_silhouette
                )
            else:
                best_k_elbow = best_k_silhouette

            results["recommendations"] = {
                "silhouette_method": best_k_silhouette,
                "elbow_method": best_k_elbow,
                "recommended": best_k_silhouette,  # シルエット係数を優先
            }

        return {
            "success": True,
            "data": results,
            "message": f"最適クラスター数の分析が完了しました（K=2-{max_k}）",
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"最適クラスター数分析エラー: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"最適クラスター数の分析中にエラーが発生しました: {str(e)}",
        )
