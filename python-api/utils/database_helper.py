from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
from fastapi import UploadFile
import pandas as pd
import base64

from models import (
    AnalysisSession,
    OriginalData,
    CoordinatesData,
    VisualizationData,
    EigenvalueData,
)
from analysis.base import BaseAnalyzer


async def save_analysis_to_db(
    db: Session,
    analyzer: BaseAnalyzer,
    session_name: str,
    description: Optional[str],
    tags: List[str],
    user_id: str,
    file: UploadFile,
    csv_text: str,
    df: pd.DataFrame,
    results: Dict[str, Any],
    plot_base64: str,
) -> int:
    """分析結果をデータベースに保存する共通関数"""

    analysis_type = analyzer.get_analysis_type()

    # 1. 分析セッションを作成
    analysis_session = AnalysisSession(
        session_name=session_name,
        original_filename=file.filename,
        file_size=len(csv_text.encode("utf-8")),
        description=description,
        tags=tags,
        user_id=user_id,
        analysis_type=analysis_type,  # 新しく追加するカラム
        row_count=df.shape[0],
        column_count=df.shape[1],
        analysis_parameters=extract_parameters(results, analysis_type),
    )

    # 分析手法別の統計情報を設定
    if analysis_type == "correspondence":
        analysis_session.total_inertia = float(results["total_inertia"])
        analysis_session.chi2_value = float(results["chi2"])
        analysis_session.degrees_of_freedom = results["degrees_of_freedom"]
        analysis_session.dimension_1_contribution = float(
            results["explained_inertia"][0]
        )
        analysis_session.dimension_2_contribution = (
            float(results["explained_inertia"][1])
            if len(results["explained_inertia"]) > 1
            else 0
        )
    elif analysis_type == "pca":
        analysis_session.total_inertia = float(sum(results["explained_variance_ratio"]))
        analysis_session.dimension_1_contribution = float(
            results["explained_variance_ratio"][0]
        )
        analysis_session.dimension_2_contribution = (
            float(results["explained_variance_ratio"][1])
            if len(results["explained_variance_ratio"]) > 1
            else 0
        )
    # 他の分析手法も同様に追加

    db.add(analysis_session)
    db.commit()
    db.refresh(analysis_session)
    session_id = analysis_session.id

    # 2. 元データを保存
    original_data = OriginalData(
        session_id=session_id,
        csv_data=csv_text,
        row_names=list(df.index),
        column_names=list(df.columns),
        data_matrix=df.to_dict("records"),
    )
    db.add(original_data)

    # 3. 座標データを保存（分析手法に応じて）
    await save_coordinates_data(db, session_id, analyzer, results)

    # 4. 可視化データを保存
    image_data = base64.b64decode(plot_base64)
    visualization = VisualizationData(
        session_id=session_id,
        image_type=f"{analysis_type}_plot",
        image_data=image_data,
        image_base64=plot_base64,
        image_size=len(image_data),
        width=1400,
        height=1100,
    )
    db.add(visualization)

    # 5. 固有値データを保存（該当する分析手法のみ）
    await save_eigenvalue_data(db, session_id, results, analysis_type)

    # 全ての変更をコミット
    db.commit()
    return session_id


async def save_coordinates_data(
    db: Session, session_id: int, analyzer: BaseAnalyzer, results: Dict[str, Any]
):
    """座標データを保存"""
    analysis_type = analyzer.get_analysis_type()

    if analysis_type == "correspondence":
        # コレスポンデンス分析の座標データ
        coordinates = analyzer.get_coordinates_data(results)

        # 行座標を保存
        for coord in coordinates["rows"]:
            coords = CoordinatesData(
                session_id=session_id,
                point_type="row",
                point_name=coord["name"],
                dimension_1=coord["dimension_1"],
                dimension_2=coord["dimension_2"],
            )
            db.add(coords)

        # 列座標を保存
        for coord in coordinates["columns"]:
            coords = CoordinatesData(
                session_id=session_id,
                point_type="column",
                point_name=coord["name"],
                dimension_1=coord["dimension_1"],
                dimension_2=coord["dimension_2"],
            )
            db.add(coords)

    elif analysis_type == "pca":
        # 主成分分析の場合は主成分スコアを保存
        if "scores" in results:
            scores = results["scores"]
            for i, (idx, row) in enumerate(scores.iterrows()):
                coords = CoordinatesData(
                    session_id=session_id,
                    point_type="observation",
                    point_name=str(idx),
                    dimension_1=float(row.iloc[0]) if len(row) > 0 else 0,
                    dimension_2=float(row.iloc[1]) if len(row) > 1 else 0,
                )
                db.add(coords)

    # 他の分析手法も同様に実装


async def save_eigenvalue_data(
    db: Session, session_id: int, results: Dict[str, Any], analysis_type: str
):
    """固有値データを保存"""
    if analysis_type == "correspondence":
        eigenvalues = results["eigenvalues"]
        explained_inertia = results["explained_inertia"]
        cumulative_inertia = results["cumulative_inertia"]

        for i, (eigenval, explained, cumulative) in enumerate(
            zip(eigenvalues, explained_inertia, cumulative_inertia)
        ):
            eigenvalue_data = EigenvalueData(
                session_id=session_id,
                dimension_number=i + 1,
                eigenvalue=float(eigenval),
                explained_inertia=float(explained),
                cumulative_inertia=float(cumulative),
            )
            db.add(eigenvalue_data)

    elif analysis_type == "pca":
        if "explained_variance_ratio" in results:
            explained_variance = results["explained_variance_ratio"]
            cumulative_variance = results.get("cumulative_variance_ratio", [])

            for i, explained in enumerate(explained_variance):
                eigenvalue_data = EigenvalueData(
                    session_id=session_id,
                    dimension_number=i + 1,
                    eigenvalue=float(
                        results.get("eigenvalues", [0] * len(explained_variance))[i]
                    ),
                    explained_inertia=float(explained),
                    cumulative_inertia=(
                        float(cumulative_variance[i]) if cumulative_variance else 0
                    ),
                )
                db.add(eigenvalue_data)


def extract_parameters(results: Dict[str, Any], analysis_type: str) -> Dict[str, Any]:
    """分析結果から分析パラメータを抽出"""
    parameters = {"analysis_type": analysis_type}

    if analysis_type == "correspondence":
        parameters.update(
            {"n_components": results.get("n_components", 2), "method": "prince"}
        )
    elif analysis_type == "pca":
        parameters.update(
            {
                "n_components": results.get("n_components", 2),
                "standardize": results.get("standardize", True),
                "method": results.get("method", "sklearn"),
            }
        )

    return parameters


def get_analysis_summary(session: AnalysisSession) -> Dict[str, Any]:
    """分析セッションのサマリー情報を取得"""
    summary = {
        "session_id": session.id,
        "session_name": session.session_name,
        "analysis_type": getattr(session, "analysis_type", "correspondence"),
        "filename": session.original_filename,
        "description": session.description,
        "tags": session.tags or [],
        "analysis_timestamp": session.analysis_timestamp.isoformat(),
        "row_count": session.row_count,
        "column_count": session.column_count,
    }

    # 分析手法別の追加情報
    if hasattr(session, "total_inertia") and session.total_inertia:
        summary["total_inertia"] = float(session.total_inertia)

    if (
        hasattr(session, "dimension_1_contribution")
        and session.dimension_1_contribution
    ):
        summary["dimension_1_contribution"] = float(session.dimension_1_contribution)

    if (
        hasattr(session, "dimension_2_contribution")
        and session.dimension_2_contribution
    ):
        summary["dimension_2_contribution"] = float(session.dimension_2_contribution)

    return summary
