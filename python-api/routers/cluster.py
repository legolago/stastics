from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
import csv
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
    method: str = Query("kmeans", description="クラスタリング手法"),
    n_clusters: int = Query(3, description="クラスター数"),
    linkage_method: str = Query("ward", description="階層クラスタリングの結合方法"),
    distance_metric: str = Query("euclidean", description="距離指標"),
    standardize: bool = Query(True, description="データを標準化するかどうか"),
    max_clusters: int = Query(10, description="エルボー法で評価する最大クラスター数"),
    db: Session = Depends(get_db),
):
    """クラスター分析を実行"""
    try:
        print(f"=== クラスター分析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"手法: {method}, クラスター数: {n_clusters}")
        print(f"結合方法: {linkage_method}, 距離指標: {distance_metric}")
        print(f"標準化: {standardize}")

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

        # パラメータ検証
        if method not in ["kmeans", "hierarchical"]:
            raise HTTPException(
                status_code=400,
                detail="手法はkmeansまたはhierarchicalを選択してください",
            )

        if n_clusters < 2 or n_clusters > df.shape[0]:
            raise HTTPException(
                status_code=400,
                detail=f"クラスター数は2以上{df.shape[0]}以下で設定してください",
            )

        if linkage_method not in ["ward", "complete", "average", "single"]:
            raise HTTPException(
                status_code=400,
                detail="結合方法はward, complete, average, singleから選択してください",
            )

        if distance_metric not in ["euclidean", "manhattan", "cosine"]:
            raise HTTPException(
                status_code=400,
                detail="距離指標はeuclidean, manhattan, cosineから選択してください",
            )

        # Wardの場合はユークリッド距離のみ
        if linkage_method == "ward" and distance_metric != "euclidean":
            print("Wardの場合はユークリッド距離を使用します")
            distance_metric = "euclidean"

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行
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
            linkage_method=linkage_method,
            distance_metric=distance_metric,
            standardize=standardize,
            max_clusters=max_clusters,
        )

        print("=== クラスター分析API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== クラスター分析API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_cluster_methods():
    """クラスター分析で利用可能な手法一覧を取得"""
    return {
        "methods": [
            {
                "name": "kmeans",
                "display_name": "K-means法",
                "description": "非階層的クラスタリング手法。事前にクラスター数を指定する必要がある。",
                "parameters": {
                    "n_clusters": {
                        "type": "integer",
                        "default": 3,
                        "min": 2,
                        "max": 20,
                        "description": "クラスター数",
                    },
                    "standardize": {
                        "type": "boolean",
                        "default": True,
                        "description": "データを標準化するかどうか",
                    },
                    "max_clusters": {
                        "type": "integer",
                        "default": 10,
                        "min": 5,
                        "max": 20,
                        "description": "エルボー法で評価する最大クラスター数",
                    },
                },
            },
            {
                "name": "hierarchical",
                "display_name": "階層クラスタリング",
                "description": "階層的クラスタリング手法。デンドログラムで結果を可視化できる。",
                "parameters": {
                    "n_clusters": {
                        "type": "integer",
                        "default": 3,
                        "min": 2,
                        "max": 20,
                        "description": "クラスター数",
                    },
                    "linkage_method": {
                        "type": "string",
                        "default": "ward",
                        "options": ["ward", "complete", "average", "single"],
                        "description": "結合方法",
                    },
                    "distance_metric": {
                        "type": "string",
                        "default": "euclidean",
                        "options": ["euclidean", "manhattan", "cosine"],
                        "description": "距離指標",
                    },
                    "standardize": {
                        "type": "boolean",
                        "default": True,
                        "description": "データを標準化するかどうか",
                    },
                },
            },
        ],
        "distance_metrics": [
            {"name": "euclidean", "display_name": "ユークリッド距離"},
            {"name": "manhattan", "display_name": "マンハッタン距離"},
            {"name": "cosine", "display_name": "コサイン距離"},
        ],
        "linkage_methods": [
            {"name": "ward", "display_name": "Ward法"},
            {"name": "complete", "display_name": "完全結合法"},
            {"name": "average", "display_name": "平均結合法"},
            {"name": "single", "display_name": "単結合法"},
        ],
    }


@router.get("/parameters/validate")
async def validate_parameters(
    method: str = Query("kmeans", description="手法"),
    n_clusters: int = Query(3, description="クラスター数"),
    linkage_method: str = Query("ward", description="結合方法"),
    distance_metric: str = Query("euclidean", description="距離指標"),
    max_clusters: int = Query(10, description="最大クラスター数"),
):
    """パラメータの妥当性をチェック"""
    errors = []

    if method not in ["kmeans", "hierarchical"]:
        errors.append("手法はkmeansまたはhierarchicalを選択してください")

    if n_clusters < 2:
        errors.append("クラスター数は2以上である必要があります")
    if n_clusters > 20:
        errors.append("クラスター数は20以下である必要があります")

    if linkage_method not in ["ward", "complete", "average", "single"]:
        errors.append("結合方法はward, complete, average, singleから選択してください")

    if distance_metric not in ["euclidean", "manhattan", "cosine"]:
        errors.append("距離指標はeuclidean, manhattan, cosineから選択してください")

    if linkage_method == "ward" and distance_metric != "euclidean":
        errors.append("Ward法はユークリッド距離のみ対応しています")

    if max_clusters < 5:
        errors.append("最大クラスター数は5以上である必要があります")
    if max_clusters > 20:
        errors.append("最大クラスター数は20以下である必要があります")

    return {"valid": len(errors) == 0, "errors": errors}


@router.get("/download/{session_id}/assignments")
async def download_cluster_assignments(session_id: int, db: Session = Depends(get_db)):
    """クラスター割り当て結果をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "cluster":
            raise HTTPException(
                status_code=400, detail="クラスター分析のセッションではありません"
            )

        # 座標データ（クラスター割り当て情報）を取得
        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        if not coordinates:
            raise HTTPException(
                status_code=404, detail="クラスター割り当てデータが見つかりません"
            )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(["sample_name", "cluster_id", "cluster_label"])

        # データ行
        for coord in coordinates:
            if coord.point_type == "observation":  # クラスター分析では観測値として保存
                cluster_id = (
                    int(coord.dimension_1) if coord.dimension_1 is not None else 0
                )
                cluster_label = f"クラスター {cluster_id + 1}"
                writer.writerow([coord.point_name, cluster_id, cluster_label])

        output.seek(0)

        # レスポンス作成
        response = StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=cluster_assignments_{session_id}.csv"
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"CSV出力中にエラーが発生しました: {str(e)}"
        )


@router.get("/download/{session_id}/details")
async def download_cluster_details(session_id: int, db: Session = Depends(get_db)):
    """分析結果詳細をCSV形式でダウンロード"""
    try:
        import csv
        import io
        from fastapi.responses import Response
        from models import (
            AnalysisSession,
            EigenvalueData,
            AnalysisMetadata,
            CoordinatesData,
        )

        print(f"Starting cluster details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "cluster":
            raise HTTPException(
                status_code=400, detail="クラスター分析のセッションではありません"
            )

        print(f"Session found: {session.session_name}")

        # メタデータを取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        # 座標データを取得（クラスター割り当て情報）
        coordinates_data = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        print(
            f"Found {len(metadata_entries)} metadata entries and {len(coordinates_data)} coordinates"
        )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # セッション情報
        writer.writerow(["セッション情報"])
        writer.writerow(["項目", "値"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(["分析手法", "クラスター分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["サンプル数", session.row_count])
        writer.writerow(["変数数", session.column_count])
        writer.writerow([])

        # 評価指標
        writer.writerow(["評価指標"])
        writer.writerow(["指標", "値"])

        # 座標データから実際のクラスター情報を計算
        cluster_ids = []
        cluster_counts = {}
        for coord in coordinates_data:
            if getattr(coord, "point_type", None) == "observation":
                cluster_id = int(getattr(coord, "dimension_1", 0))
                cluster_ids.append(cluster_id)
                cluster_counts[cluster_id] = cluster_counts.get(cluster_id, 0) + 1

        actual_clusters = len(set(cluster_ids)) if cluster_ids else 0

        # メタデータから評価指標を取得
        metrics_found = False
        for metadata in metadata_entries:
            if metadata.metadata_type == "cluster_metrics":
                metrics_found = True
                metrics = metadata.metadata_content
                print(f"Found cluster metrics: {metrics}")

                writer.writerow(
                    [
                        "シルエットスコア",
                        f"{metrics.get('silhouette_score', 'N/A'):.4f}",
                    ]
                )
                writer.writerow(
                    [
                        "Calinski-Harabasz指標",
                        f"{metrics.get('calinski_harabasz_score', 'N/A'):.4f}",
                    ]
                )
                writer.writerow(
                    [
                        "Davies-Bouldin指標",
                        f"{metrics.get('davies_bouldin_score', 'N/A'):.4f}",
                    ]
                )
                writer.writerow(["慣性", f"{metrics.get('inertia', 'N/A'):.4f}"])
                writer.writerow(
                    ["クラスター数", metrics.get("n_clusters", actual_clusters)]
                )
                break

        # セッション情報からも評価指標を取得（フォールバック）
        if not metrics_found:
            print(
                "No cluster_metrics metadata found, using session and coordinate data"
            )

            # セッション情報から基本指標
            silhouette = getattr(session, "chi2_value", 0.0)
            inertia = getattr(session, "total_inertia", 0.0)

            writer.writerow(["シルエットスコア", f"{silhouette:.4f}"])
            writer.writerow(["クラスター数", actual_clusters])  # 実際のクラスター数
            writer.writerow(["総クラスター内平方和", f"{inertia:.4f}"])

            # クラスター別サイズ情報
            writer.writerow(["クラスター別サイズ", ""])
            for cluster_id, count in sorted(cluster_counts.items()):
                writer.writerow([f"クラスター {cluster_id + 1}", count])

        writer.writerow([])

        # クラスター統計情報
        stats_found = False
        for metadata in metadata_entries:
            if metadata.metadata_type == "cluster_statistics":
                stats_found = True
                writer.writerow(["クラスター統計"])
                stats = metadata.metadata_content
                print(f"Found cluster statistics for {len(stats)} clusters")

                for cluster_key, cluster_info in stats.items():
                    writer.writerow([f"{cluster_key} (サイズ: {cluster_info['size']})"])
                    writer.writerow(
                        ["メンバー", ", ".join(cluster_info.get("members", []))]
                    )

                    if cluster_info.get("mean"):
                        writer.writerow(
                            ["変数", "平均", "標準偏差", "最小値", "最大値"]
                        )
                        for var_name in cluster_info["mean"].keys():
                            mean_val = cluster_info["mean"].get(var_name, "N/A")
                            std_val = cluster_info["std"].get(var_name, "N/A")
                            min_val = cluster_info["min"].get(var_name, "N/A")
                            max_val = cluster_info["max"].get(var_name, "N/A")

                            writer.writerow(
                                [
                                    var_name,
                                    (
                                        f"{mean_val:.4f}"
                                        if isinstance(mean_val, (int, float))
                                        else str(mean_val)
                                    ),
                                    (
                                        f"{std_val:.4f}"
                                        if isinstance(std_val, (int, float))
                                        else str(std_val)
                                    ),
                                    (
                                        f"{min_val:.4f}"
                                        if isinstance(min_val, (int, float))
                                        else str(min_val)
                                    ),
                                    (
                                        f"{max_val:.4f}"
                                        if isinstance(max_val, (int, float))
                                        else str(max_val)
                                    ),
                                ]
                            )
                    writer.writerow([])
                break

        if not stats_found:
            writer.writerow(["クラスター統計"])
            writer.writerow(["統計情報が見つかりませんでした"])
            writer.writerow([])

        # クラスター割り当て結果
        if coordinates_data:
            writer.writerow(["クラスター割り当て結果"])
            writer.writerow(["サンプル名", "クラスターID", "クラスターラベル"])

            cluster_assignments = []
            for coord in coordinates_data:
                if getattr(coord, "point_type", None) == "observation":
                    sample_name = getattr(coord, "point_name", "Unknown")
                    cluster_id = int(getattr(coord, "dimension_1", 0))
                    cluster_label = f"クラスター {cluster_id + 1}"
                    cluster_assignments.append([sample_name, cluster_id, cluster_label])

            for assignment in cluster_assignments:
                writer.writerow(assignment)

            print(f"Added {len(cluster_assignments)} cluster assignments")
            writer.writerow([])
        else:
            writer.writerow(["クラスター割り当て結果"])
            writer.writerow(["座標データが見つかりませんでした"])
            writer.writerow([])

        # 固有値データ（存在する場合）
        eigenvalue_data = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .all()
        )

        if eigenvalue_data:
            writer.writerow(["次元別情報"])
            writer.writerow(["次元", "固有値", "寄与率(%)", "累積寄与率(%)"])

            for eigenval in sorted(eigenvalue_data, key=lambda x: x.dimension_number):
                eigenvalue = eigenval.eigenvalue if eigenval.eigenvalue else 0
                explained_inertia = (
                    eigenval.explained_inertia if eigenval.explained_inertia else 0
                )
                cumulative_inertia = (
                    eigenval.cumulative_inertia if eigenval.cumulative_inertia else 0
                )

                writer.writerow(
                    [
                        f"次元{eigenval.dimension_number}",
                        f"{eigenvalue:.8f}",
                        f"{explained_inertia*100:.2f}",
                        f"{cumulative_inertia*100:.2f}",
                    ]
                )

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"cluster_details_{session_id}.csv"

        # Responseを正しく作成
        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"詳細CSV出力エラー: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"詳細CSV出力中にエラーが発生しました: {str(e)}"
        )
