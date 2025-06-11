from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List, Dict, Any
import pandas as pd
import io
import csv
import base64
from datetime import datetime

from models import (
    get_db,
    AnalysisSession,
    OriginalData,
    CoordinatesData,
    EigenvalueData,
    VisualizationData,
    AnalysisMetadata,
    AnalysisTypes,
    MetadataTypes,
    SessionTag,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/")
async def get_sessions(
    userId: str = Query("default", description="ユーザーID"),
    limit: int = Query(50, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    analysis_type: Optional[str] = Query(None, description="分析タイプでフィルタ"),
    db: Session = Depends(get_db),
):
    """分析セッション一覧を取得"""
    try:
        query = db.query(AnalysisSession).filter(AnalysisSession.user_id == userId)

        if analysis_type:
            query = query.filter(AnalysisSession.analysis_type == analysis_type)

        sessions = (
            query.order_by(desc(AnalysisSession.analysis_timestamp))
            .offset(offset)
            .limit(limit)
            .all()
        )

        session_list = []
        for session in sessions:
            session_data = {
                "session_id": session.id,
                "session_name": session.session_name,
                "description": session.description,
                "tags": session.tags,
                "user_id": session.user_id,
                "filename": session.original_filename,
                "analysis_timestamp": session.analysis_timestamp.isoformat(),
                "analysis_type": session.analysis_type,
                "row_count": session.row_count,
                "column_count": session.column_count,
                "total_inertia": session.total_inertia,
                "chi2_value": session.chi2_value,
                "degrees_of_freedom": session.degrees_of_freedom,
            }
            session_list.append(session_data)

        return {"success": True, "data": session_list}

    except Exception as e:
        print(f"セッション一覧取得エラー: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"セッション一覧の取得に失敗しました: {str(e)}"
        )


@router.get("/{session_id}")
async def get_session_detail(session_id: int, db: Session = Depends(get_db)):
    """特定のセッションの詳細情報を取得"""
    try:
        print(f"=== セッション詳細取得開始: {session_id} ===")

        # セッション基本情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        print(
            f"セッション情報: {session.session_name}, 分析タイプ: {session.analysis_type}"
        )

        # 基本的なセッション情報
        session_info = {
            "session_id": session.id,
            "session_name": session.session_name,
            "description": session.description,
            "tags": session.tags,
            "user_id": session.user_id,
            "analysis_timestamp": session.analysis_timestamp.isoformat(),
            "analysis_type": session.analysis_type,
        }

        # メタデータ情報
        metadata = {
            "original_filename": session.original_filename,
            "row_count": session.row_count,
            "column_count": session.column_count,
        }

        # 分析タイプ別の詳細データ取得
        if session.analysis_type == AnalysisTypes.CLUSTER:
            analysis_data = await get_cluster_analysis_data(db, session_id, session)
        elif session.analysis_type == AnalysisTypes.CORRESPONDENCE:
            analysis_data = await get_correspondence_analysis_data(
                db, session_id, session
            )
        elif session.analysis_type == AnalysisTypes.PCA:
            analysis_data = await get_pca_analysis_data(db, session_id, session)
        elif session.analysis_type == AnalysisTypes.FACTOR:
            analysis_data = await get_factor_analysis_data(db, session_id, session)
        else:
            analysis_data = {}

        print(f"分析データ取得完了: {len(analysis_data)} keys")

        # 可視化データ取得
        visualization_data = get_visualization_data(db, session_id)
        print(f"可視化データ: {'あり' if visualization_data else 'なし'}")

        # フロントエンド用に構造を調整
        if session.analysis_type == AnalysisTypes.CLUSTER:
            # クラスター分析用の特別な構造
            cluster_assignments = analysis_data.get("cluster_assignments", [])
            cluster_statistics = analysis_data.get("cluster_statistics", {})
            evaluation_metrics = analysis_data.get("evaluation_metrics", {})

            response_data = {
                "success": True,
                "data": {
                    "session_info": session_info,
                    "metadata": metadata,
                    "analysis_data": {
                        **analysis_data,
                        # visualization の中にもデータを配置
                        "visualization": {
                            "cluster_assignments": cluster_assignments,
                            "cluster_colors": {
                                str(i): get_cluster_color(i)
                                for i in range(
                                    max(1, analysis_data.get("n_clusters", 1))
                                )
                            },
                            "cluster_statistics": cluster_statistics,
                            "evaluation_metrics": evaluation_metrics,
                            "plot_image": (
                                visualization_data.get("plot_image")
                                if visualization_data
                                else None
                            ),
                        },
                    },
                    "visualization": {
                        "plot_image": (
                            visualization_data.get("plot_image")
                            if visualization_data
                            else None
                        ),
                        "cluster_assignments": cluster_assignments,
                        "cluster_colors": {
                            str(i): get_cluster_color(i)
                            for i in range(max(1, analysis_data.get("n_clusters", 1)))
                        },
                        "cluster_statistics": cluster_statistics,
                        "evaluation_metrics": evaluation_metrics,
                    },
                    # トップレベルに直接配置（フロントエンド互換性のため）
                    "cluster_assignments": cluster_assignments,
                    "cluster_statistics": cluster_statistics,
                    "evaluation_metrics": evaluation_metrics,
                    "cluster_colors": {
                        str(i): get_cluster_color(i)
                        for i in range(max(1, analysis_data.get("n_clusters", 1)))
                    },
                    # 画像データも直接アクセス可能にする
                    "plot_image": (
                        visualization_data.get("plot_image")
                        if visualization_data
                        else None
                    ),
                },
            }
        else:
            response_data = {
                "success": True,
                "data": {
                    "session_info": session_info,
                    "metadata": metadata,
                    "analysis_data": analysis_data,
                    "visualization": visualization_data,
                },
            }

        print(f"=== セッション詳細取得完了: {session_id} ===")

        # デバッグ用：レスポンス構造をログ出力
        if session.analysis_type == AnalysisTypes.CLUSTER:
            print(f"🔍 CLUSTER DEBUG - Response Structure:")
            print(
                f"  - cluster_assignments count: {len(response_data['data'].get('cluster_assignments', []))}"
            )
            print(
                f"  - visualization.cluster_assignments count: {len(response_data['data'].get('visualization', {}).get('cluster_assignments', []))}"
            )
            print(
                f"  - analysis_data.cluster_assignments count: {len(response_data['data'].get('analysis_data', {}).get('cluster_assignments', []))}"
            )
            print(
                f"  - analysis_data.visualization.cluster_assignments count: {len(response_data['data'].get('analysis_data', {}).get('visualization', {}).get('cluster_assignments', []))}"
            )

            # レスポンスのキー構造も確認
            print(f"  - Top-level data keys: {list(response_data['data'].keys())}")
            if "visualization" in response_data["data"]:
                print(
                    f"  - Visualization keys: {list(response_data['data']['visualization'].keys())}"
                )
            if (
                "analysis_data" in response_data["data"]
                and "visualization" in response_data["data"]["analysis_data"]
            ):
                print(
                    f"  - Analysis_data.visualization keys: {list(response_data['data']['analysis_data']['visualization'].keys())}"
                )

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        print(f"セッション詳細取得エラー: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"セッション詳細の取得に失敗しました: {str(e)}"
        )


async def get_cluster_analysis_data(
    db: Session, session_id: int, session: AnalysisSession
) -> Dict[str, Any]:
    """クラスター分析の詳細データを取得"""
    try:
        print(f"=== クラスター分析データ取得開始: {session_id} ===")

        # メタデータを取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        cluster_metrics = {}
        cluster_statistics = {}

        for metadata in metadata_entries:
            if metadata.metadata_type == "cluster_metrics":
                cluster_metrics = metadata.metadata_content
                print(f"クラスター評価指標取得: {cluster_metrics}")
            elif metadata.metadata_type == "cluster_statistics":
                cluster_statistics = metadata.metadata_content
                print(f"クラスター統計取得: {len(cluster_statistics)} clusters")

        # 座標データ（クラスター割り当て）を取得
        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        cluster_assignments = []
        cluster_labels = []

        for coord in coordinates:
            if coord.point_type == "observation":  # クラスター分析では観測値として保存
                cluster_id = (
                    int(coord.dimension_1) if coord.dimension_1 is not None else 0
                )
                cluster_assignments.append(
                    {
                        "sample_name": coord.point_name,
                        "cluster_id": cluster_id,
                        "cluster_label": f"クラスター {cluster_id + 1}",
                        "color": get_cluster_color(cluster_id),
                    }
                )
                cluster_labels.append(cluster_id)

        print(f"クラスター割り当て: {len(cluster_assignments)} samples")

        # 実際のクラスター数を計算
        actual_n_clusters = len(set(cluster_labels)) if cluster_labels else 0

        # 評価指標を統一
        evaluation_metrics = {
            "silhouette_score": cluster_metrics.get(
                "silhouette_score",
                float(session.chi2_value) if session.chi2_value else 0.0,
            ),
            "calinski_harabasz_score": cluster_metrics.get(
                "calinski_harabasz_score", 0.0
            ),
            "davies_bouldin_score": cluster_metrics.get("davies_bouldin_score", 0.0),
            "inertia": cluster_metrics.get(
                "inertia",
                float(session.total_inertia) if session.total_inertia else 0.0,
            ),
            "n_clusters": cluster_metrics.get("n_clusters", actual_n_clusters),
            "method": cluster_metrics.get("method", "kmeans"),
        }

        # セッション情報からの基本データ
        analysis_data = {
            "method": evaluation_metrics["method"],
            "n_clusters": evaluation_metrics["n_clusters"],
            "total_inertia": evaluation_metrics["inertia"],
            "silhouette_score": evaluation_metrics["silhouette_score"],
            "calinski_harabasz_score": evaluation_metrics["calinski_harabasz_score"],
            "davies_bouldin_score": evaluation_metrics["davies_bouldin_score"],
            "cluster_labels": cluster_labels,
            "cluster_assignments": cluster_assignments,
            "cluster_statistics": cluster_statistics,
            "evaluation_metrics": evaluation_metrics,
            # 可視化データも analysis_data に含める
            "visualization": {
                "cluster_assignments": cluster_assignments,
                "cluster_colors": {
                    str(i): get_cluster_color(i)
                    for i in range(max(1, evaluation_metrics["n_clusters"]))
                },
                "cluster_statistics": cluster_statistics,
                "evaluation_metrics": evaluation_metrics,
            },
        }

        print(f"=== クラスター分析データ取得完了: session_id={session_id} ===")
        print(
            f"取得データ概要: {analysis_data['n_clusters']}クラスター, {len(cluster_assignments)}サンプル"
        )
        print(f"評価指標: シルエット={analysis_data['silhouette_score']:.4f}")
        print(f"クラスター割り当て数: {len(analysis_data['cluster_assignments'])}")
        return analysis_data

    except Exception as e:
        print(f"クラスター分析データ取得エラー: {str(e)}")
        import traceback

        traceback.print_exc()
        return {}


def get_cluster_color(cluster_id: int) -> str:
    """クラスターIDに対応する色を取得"""
    color_palette = [
        "#1f77b4",
        "#ff7f0e",
        "#2ca02c",
        "#d62728",
        "#9467bd",
        "#8c564b",
        "#e377c2",
        "#7f7f7f",
        "#bcbd22",
        "#17becf",
    ]
    return color_palette[cluster_id % len(color_palette)]


async def get_correspondence_analysis_data(
    db: Session, session_id: int, session: AnalysisSession
) -> Dict[str, Any]:
    """コレスポンデンス分析の詳細データを取得"""
    try:
        # 座標データを取得
        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        row_coordinates = []
        column_coordinates = []

        for coord in coordinates:
            coord_data = {
                "name": coord.point_name,
                "dim1": float(coord.dimension_1) if coord.dimension_1 else 0.0,
                "dim2": float(coord.dimension_2) if coord.dimension_2 else 0.0,
            }

            if coord.point_type == "row":
                row_coordinates.append(coord_data)
            elif coord.point_type == "column":
                column_coordinates.append(coord_data)

        # 固有値データを取得
        eigenvalues = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .order_by(EigenvalueData.dimension_number)
            .all()
        )

        eigenvalue_data = []
        explained_variance = []
        cumulative_variance = []

        for eigenval in eigenvalues:
            eigenvalue_data.append(
                float(eigenval.eigenvalue) if eigenval.eigenvalue else 0.0
            )
            explained_variance.append(
                float(eigenval.explained_inertia) if eigenval.explained_inertia else 0.0
            )
            cumulative_variance.append(
                float(eigenval.cumulative_inertia)
                if eigenval.cumulative_inertia
                else 0.0
            )

        return {
            "chi2_statistic": float(session.chi2_value) if session.chi2_value else 0.0,
            "degrees_of_freedom": session.degrees_of_freedom,
            "total_inertia": (
                float(session.total_inertia) if session.total_inertia else 0.0
            ),
            "eigenvalues": eigenvalue_data,
            "explained_variance_ratio": explained_variance,
            "cumulative_variance_ratio": cumulative_variance,
            "row_coordinates": row_coordinates,
            "column_coordinates": column_coordinates,
        }

    except Exception as e:
        print(f"コレスポンデンス分析データ取得エラー: {str(e)}")
        return {}


async def get_pca_analysis_data(
    db: Session, session_id: int, session: AnalysisSession
) -> Dict[str, Any]:
    """PCA分析の詳細データを取得"""
    try:
        # 座標データを取得
        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        component_scores = []
        loadings = []
        sample_names = []
        feature_names = []

        for coord in coordinates:
            if coord.point_type == "observation":
                component_scores.append(
                    [
                        float(coord.dimension_1) if coord.dimension_1 else 0.0,
                        float(coord.dimension_2) if coord.dimension_2 else 0.0,
                    ]
                )
                sample_names.append(coord.point_name)
            elif coord.point_type == "variable":
                loadings.append(
                    [
                        float(coord.dimension_1) if coord.dimension_1 else 0.0,
                        float(coord.dimension_2) if coord.dimension_2 else 0.0,
                    ]
                )
                feature_names.append(coord.point_name)

        # 固有値データを取得
        eigenvalues = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .order_by(EigenvalueData.dimension_number)
            .all()
        )

        eigenvalue_data = []
        explained_variance = []
        cumulative_variance = []

        for eigenval in eigenvalues:
            eigenvalue_data.append(
                float(eigenval.eigenvalue) if eigenval.eigenvalue else 0.0
            )
            explained_variance.append(
                float(eigenval.explained_inertia) if eigenval.explained_inertia else 0.0
            )
            cumulative_variance.append(
                float(eigenval.cumulative_inertia)
                if eigenval.cumulative_inertia
                else 0.0
            )

        return {
            "kmo": (
                float(session.chi2_value) if session.chi2_value else 0.0
            ),  # PCAの場合はKMO値
            "n_components": session.degrees_of_freedom,
            "total_variance": (
                float(session.total_inertia) if session.total_inertia else 0.0
            ),
            "eigenvalues": eigenvalue_data,
            "explained_variance_ratio": explained_variance,
            "cumulative_variance_ratio": cumulative_variance,
            "component_scores": component_scores,
            "loadings": loadings,
            "sample_names": sample_names,
            "feature_names": feature_names,
        }

    except Exception as e:
        print(f"PCA分析データ取得エラー: {str(e)}")
        return {}


async def get_factor_analysis_data(
    db: Session, session_id: int, session: AnalysisSession
) -> Dict[str, Any]:
    """因子分析の詳細データを取得（将来の実装用）"""
    try:
        return {}
    except Exception as e:
        print(f"因子分析データ取得エラー: {str(e)}")
        return {}


def get_visualization_data(db: Session, session_id: int) -> Optional[Dict[str, Any]]:
    """可視化データを取得"""
    try:
        visualization = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .first()
        )

        if visualization and visualization.image_base64:
            return {
                "plot_image": visualization.image_base64,
                "width": visualization.width,
                "height": visualization.height,
            }

        return None

    except Exception as e:
        print(f"可視化データ取得エラー: {str(e)}")
        return None


@router.delete("/{session_id}")
async def delete_session(session_id: int, db: Session = Depends(get_db)):
    """セッションを削除"""
    try:
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        # 関連データも削除
        db.query(OriginalData).filter(OriginalData.session_id == session_id).delete()
        db.query(CoordinatesData).filter(
            CoordinatesData.session_id == session_id
        ).delete()
        db.query(EigenvalueData).filter(
            EigenvalueData.session_id == session_id
        ).delete()
        db.query(VisualizationData).filter(
            VisualizationData.session_id == session_id
        ).delete()
        db.query(AnalysisMetadata).filter(
            AnalysisMetadata.session_id == session_id
        ).delete()

        db.delete(session)
        db.commit()

        return {"success": True, "message": "セッションが削除されました"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"セッション削除エラー: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"セッションの削除に失敗しました: {str(e)}"
        )


@router.get("/{session_id}/csv")
async def download_session_csv(session_id: int, db: Session = Depends(get_db)):
    """セッションの元データをCSV形式でダウンロード"""
    try:
        original_data = (
            db.query(OriginalData).filter(OriginalData.session_id == session_id).first()
        )
        if not original_data:
            raise HTTPException(status_code=404, detail="元データが見つかりません")

        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )

        filename = (
            f"{session.original_filename}"
            if session
            else f"session_{session_id}_data.csv"
        )

        return StreamingResponse(
            io.StringIO(original_data.csv_data),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"CSV出力中にエラーが発生しました: {str(e)}"
        )


@router.get("/{session_id}/image")
async def download_session_image(session_id: int, db: Session = Depends(get_db)):
    """セッションのプロット画像をダウンロード"""
    try:
        print(f"画像ダウンロード要求: session_id={session_id}")

        visualization = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .first()
        )

        if not visualization or not visualization.image_base64:
            print(f"画像データが見つかりません: session_id={session_id}")
            raise HTTPException(status_code=404, detail="プロット画像が見つかりません")

        # Base64データをデコード
        try:
            image_data = base64.b64decode(visualization.image_base64)
            print(f"画像データデコード成功: {len(image_data)} bytes")
        except Exception as decode_error:
            print(f"Base64デコードエラー: {decode_error}")
            raise HTTPException(
                status_code=500, detail="画像データの読み込みに失敗しました"
            )

        # セッション情報を取得してファイル名を決定
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )

        if session:
            analysis_type = session.analysis_type or "analysis"
            filename = f"{analysis_type}_plot_{session_id}.png"
        else:
            filename = f"plot_{session_id}.png"

        return StreamingResponse(
            io.BytesIO(image_data),
            media_type="image/png",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"画像出力エラー: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"画像出力中にエラーが発生しました: {str(e)}"
        )


@router.get("/{session_id}/analysis-csv")
async def download_analysis_csv(session_id: int, db: Session = Depends(get_db)):
    """分析結果詳細をCSV形式でダウンロード"""
    try:
        print(f"分析結果CSV出力開始: session_id={session_id}")

        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        # 分析タイプ別のCSV生成
        if session.analysis_type == AnalysisTypes.CLUSTER:
            csv_content = await generate_cluster_analysis_csv(db, session_id, session)
        elif session.analysis_type == AnalysisTypes.CORRESPONDENCE:
            csv_content = await generate_correspondence_analysis_csv(
                db, session_id, session
            )
        elif session.analysis_type == AnalysisTypes.PCA:
            csv_content = await generate_pca_analysis_csv(db, session_id, session)
        else:
            raise HTTPException(
                status_code=400, detail="サポートされていない分析タイプです"
            )

        filename = f"{session.analysis_type}_analysis_results_{session_id}.csv"

        return StreamingResponse(
            io.StringIO(csv_content),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"分析結果CSV出力エラー: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"分析結果CSV出力中にエラーが発生しました: {str(e)}",
        )


async def generate_cluster_analysis_csv(
    db: Session, session_id: int, session: AnalysisSession
) -> str:
    """クラスター分析結果のCSVを生成"""
    try:
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー情報
        writer.writerow(["クラスター分析結果"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["サンプル数", session.row_count])
        writer.writerow(["変数数", session.column_count])
        writer.writerow([])

        # メタデータから評価指標を取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        # 評価指標
        writer.writerow(["評価指標"])
        writer.writerow(["指標", "値"])

        metrics_found = False
        cluster_statistics = {}

        for metadata in metadata_entries:
            if metadata.metadata_type == "cluster_metrics":
                metrics_found = True
                metrics = metadata.metadata_content
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
                    [
                        "クラスター数",
                        metrics.get("n_clusters", session.degrees_of_freedom),
                    ]
                )
            elif metadata.metadata_type == "cluster_statistics":
                cluster_statistics = metadata.metadata_content

        if not metrics_found:
            writer.writerow(
                [
                    "シルエットスコア",
                    f"{float(session.chi2_value):.4f}" if session.chi2_value else "N/A",
                ]
            )
            writer.writerow(["クラスター数", session.degrees_of_freedom])
            writer.writerow(
                [
                    "総クラスター内平方和",
                    (
                        f"{float(session.total_inertia):.4f}"
                        if session.total_inertia
                        else "N/A"
                    ),
                ]
            )

        writer.writerow([])

        # クラスター統計情報
        if cluster_statistics:
            writer.writerow(["クラスター統計"])
            for cluster_key, cluster_info in cluster_statistics.items():
                writer.writerow([f"{cluster_key} (サイズ: {cluster_info['size']})"])
                writer.writerow(
                    ["メンバー", ", ".join(cluster_info.get("members", []))]
                )

                if cluster_info.get("mean"):
                    writer.writerow(["変数", "平均", "標準偏差", "最小値", "最大値"])
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
        writer.writerow([])

        # クラスター割り当て結果
        coordinates_data = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        if coordinates_data:
            writer.writerow(["クラスター割り当て結果"])
            writer.writerow(["サンプル名", "クラスターID", "クラスターラベル"])

            for coord in coordinates_data:
                if coord.point_type == "observation":
                    cluster_id = (
                        int(coord.dimension_1) if coord.dimension_1 is not None else 0
                    )
                    cluster_label = f"クラスター {cluster_id + 1}"
                    writer.writerow([coord.point_name, cluster_id, cluster_label])

        return output.getvalue()

    except Exception as e:
        print(f"クラスター分析CSV生成エラー: {str(e)}")
        raise


async def generate_correspondence_analysis_csv(
    db: Session, session_id: int, session: AnalysisSession
) -> str:
    """コレスポンデンス分析結果のCSVを生成"""
    # 既存の実装があればそれを使用、なければプレースホルダー
    return "コレスポンデンス分析結果CSV（実装予定）"


async def generate_pca_analysis_csv(
    db: Session, session_id: int, session: AnalysisSession
) -> str:
    """PCA分析結果のCSVを生成"""
    # 既存の実装があればそれを使用、なければプレースホルダー
    return "PCA分析結果CSV（実装予定）"
