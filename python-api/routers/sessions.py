# python-api/routers/session.py
from fastapi import APIRouter, HTTPException, Depends, Query, Path
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import pandas as pd
import io
import os
import base64
from models import (
    AnalysisSession,
    OriginalData,
    CoordinatesData,
    VisualizationData,
    EigenvalueData,
    AnalysisMetadata,
    get_db,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def get_analysis_sessions(
    user_id: str = Query("default", description="ユーザーID"),
    search: str = Query(None, description="検索キーワード"),
    tags: str = Query(None, description="タグフィルター（カンマ区切り）"),
    analysis_type: str = Query(None, description="分析タイプフィルター"),
    limit: int = Query(20, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    db: Session = Depends(get_db),
):
    """保存された分析セッションの一覧を取得"""
    try:
        query = db.query(AnalysisSession).filter(AnalysisSession.user_id == user_id)

        # 分析タイプでフィルター（新機能）
        if analysis_type:
            query = query.filter(AnalysisSession.analysis_type == analysis_type)
            print(f"Filtering by analysis_type: {analysis_type}")

        # 検索キーワードでフィルター
        if search:
            query = query.filter(
                AnalysisSession.session_name.ilike(f"%{search}%")
                | AnalysisSession.description.ilike(f"%{search}%")
                | AnalysisSession.original_filename.ilike(f"%{search}%")
            )

        # タグでフィルター
        if tags:
            tag_list = [tag.strip() for tag in tags.split(",")]
            for tag in tag_list:
                query = query.filter(AnalysisSession.tags.any(tag))

        # 最新順でソート
        query = query.order_by(AnalysisSession.analysis_timestamp.desc())

        # ページネーション
        total = query.count()
        sessions = query.offset(offset).limit(limit).all()

        print(f"Found {total} sessions total, returning {len(sessions)} sessions")

        # レスポンス形式を整理
        results = []
        for session in sessions:
            # analysis_typeを安全に取得
            analysis_type = getattr(session, "analysis_type", "correspondence")

            session_data = {
                "session_id": session.id,
                "session_name": session.session_name,
                "filename": session.original_filename,
                "description": session.description,
                "tags": session.tags or [],
                "analysis_timestamp": session.analysis_timestamp.isoformat(),
                "analysis_type": analysis_type,
                "total_inertia": (
                    float(session.total_inertia) if session.total_inertia else None
                ),
                "dimensions_count": getattr(session, "dimensions_count", None),
                "dimension_1_contribution": (
                    float(session.dimension_1_contribution)
                    if hasattr(session, "dimension_1_contribution")
                    and session.dimension_1_contribution
                    else None
                ),
                "dimension_2_contribution": (
                    float(session.dimension_2_contribution)
                    if hasattr(session, "dimension_2_contribution")
                    and session.dimension_2_contribution
                    else None
                ),
                "row_count": session.row_count,
                "column_count": session.column_count,
            }
            results.append(session_data)

        return {
            "success": True,
            "data": results,
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_next": offset + limit < total,
            },
        }

    except Exception as e:
        print(f"Sessions API Error: {str(e)}")
        import traceback

        traceback.print_exc()

        raise HTTPException(
            status_code=500, detail=f"データ取得中にエラーが発生しました: {str(e)}"
        )


@router.delete("/{session_id}")
async def delete_analysis_session(
    session_id: int = Path(..., description="削除するセッションのID"),
    db: Session = Depends(get_db),
):
    """分析セッションとその関連データを削除"""
    try:
        # セッションの存在確認
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(
                status_code=404, detail="指定されたセッションが見つかりません"
            )

        print(f"Deleting session: {session_id} ({session.session_name})")

        # 関連データを削除（外部キー制約に配慮して順番に削除）

        # 1. メタデータを削除（新しいテーブル）
        metadata_count = 0
        try:
            metadata_count = (
                db.query(AnalysisMetadata)
                .filter(AnalysisMetadata.session_id == session_id)
                .count()
            )
            if metadata_count > 0:
                db.query(AnalysisMetadata).filter(
                    AnalysisMetadata.session_id == session_id
                ).delete()
                print(f"Deleted {metadata_count} metadata records")
        except Exception as meta_error:
            print(f"Could not delete metadata: {meta_error}")

        # 2. 可視化データを削除
        visualization_count = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .count()
        )
        if visualization_count > 0:
            db.query(VisualizationData).filter(
                VisualizationData.session_id == session_id
            ).delete()
            print(f"Deleted {visualization_count} visualization records")

        # 3. 座標データを削除
        coordinates_count = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .count()
        )
        if coordinates_count > 0:
            db.query(CoordinatesData).filter(
                CoordinatesData.session_id == session_id
            ).delete()
            print(f"Deleted {coordinates_count} coordinates records")

        # 4. 固有値データを削除
        eigenvalue_count = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .count()
        )
        if eigenvalue_count > 0:
            db.query(EigenvalueData).filter(
                EigenvalueData.session_id == session_id
            ).delete()
            print(f"Deleted {eigenvalue_count} eigenvalue records")

        # 5. 元データを削除
        original_data_count = (
            db.query(OriginalData).filter(OriginalData.session_id == session_id).count()
        )
        if original_data_count > 0:
            db.query(OriginalData).filter(
                OriginalData.session_id == session_id
            ).delete()
            print(f"Deleted {original_data_count} original data records")

        # 6. 最後にセッション自体を削除
        db.delete(session)

        # 変更をコミット
        db.commit()

        print(f"Successfully deleted session {session_id}")

        return {
            "success": True,
            "message": f"セッション '{session.session_name}' を正常に削除しました",
            "deleted_session_id": session_id,
            "deleted_counts": {
                "metadata": metadata_count,
                "visualization_data": visualization_count,
                "coordinates_data": coordinates_count,
                "eigenvalue_data": eigenvalue_count,
                "original_data": original_data_count,
            },
        }

    except HTTPException:
        # HTTPExceptionはそのまま再発生
        raise
    except Exception as e:
        # データベースエラーの場合はロールバック
        db.rollback()
        print(f"Delete session error: {str(e)}")
        import traceback

        traceback.print_exc()

        raise HTTPException(
            status_code=500, detail=f"セッション削除中にエラーが発生しました: {str(e)}"
        )


@router.get("/{session_id}")
async def get_analysis_session(
    session_id: int = Path(..., description="取得するセッションのID"),
    db: Session = Depends(get_db),
):
    """指定されたセッションの詳細情報を取得"""
    try:
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(
                status_code=404, detail="指定されたセッションが見つかりません"
            )

        # analysis_typeを安全に取得
        analysis_type = getattr(session, "analysis_type", "correspondence")
        print(f"Loading session {session_id} of type: {analysis_type}")

        # 関連データを取得
        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )
        eigenvalues = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .all()
        )
        visualization = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .first()
        )

        # 因子分析特有のメタデータを取得
        factor_metadata = None
        if analysis_type == "factor":
            try:
                factor_metadata = (
                    db.query(AnalysisMetadata)
                    .filter(AnalysisMetadata.session_id == session_id)
                    .all()
                )
                print(
                    f"Found {len(factor_metadata) if factor_metadata else 0} factor metadata records"
                )
            except Exception as meta_error:
                print(f"Could not load factor metadata: {meta_error}")
                factor_metadata = None

        # 座標データを整理
        row_coords = []
        col_coords = []
        variable_coords = []  # 因子分析用
        observation_coords = []  # 因子分析用

        for coord in coordinates:
            coord_data = {
                "name": getattr(coord, "point_name", "Unknown"),
                "dimension_1": float(getattr(coord, "dimension_1", 0)),
                "dimension_2": float(getattr(coord, "dimension_2", 0)),
            }

            # point_typeを安全に判定
            point_type = getattr(coord, "point_type", None)
            if point_type == "row":
                row_coords.append(coord_data)
            elif point_type == "column":
                col_coords.append(coord_data)
            elif point_type == "variable":  # 因子分析用
                variable_coords.append(coord_data)
            elif point_type == "observation":  # 因子分析用
                observation_coords.append(coord_data)
            else:
                # フォールバック: インデックスで判定
                coord_index = coordinates.index(coord)
                if coord_index < len(coordinates) // 2:
                    row_coords.append(coord_data)
                else:
                    col_coords.append(coord_data)

        # 固有値データを整理
        eigenvalue_data = []
        for eigenval in sorted(eigenvalues, key=lambda x: x.dimension_number):
            eigenvalue_data.append(
                {
                    "dimension": eigenval.dimension_number,
                    "eigenvalue": (
                        float(eigenval.eigenvalue) if eigenval.eigenvalue else 0
                    ),
                    "explained_inertia": (
                        float(eigenval.explained_inertia)
                        if eigenval.explained_inertia
                        else 0
                    ),
                    "cumulative_inertia": (
                        float(eigenval.cumulative_inertia)
                        if eigenval.cumulative_inertia
                        else 0
                    ),
                }
            )

        # 因子分析特有のデータ構造
        factor_analysis_data = {}
        if analysis_type == "factor" and factor_metadata:
            for metadata in factor_metadata:
                metadata_type = getattr(metadata, "metadata_type", "")
                metadata_content = getattr(metadata, "metadata_content", {})
                factor_analysis_data[metadata_type] = metadata_content

        result = {
            "success": True,
            "session_info": {
                "session_id": session.id,
                "session_name": session.session_name,
                "filename": session.original_filename,
                "description": session.description,
                "tags": session.tags or [],
                "analysis_timestamp": session.analysis_timestamp.isoformat(),
                "user_id": session.user_id,
                "analysis_type": analysis_type,
            },
            "analysis_data": {
                "total_inertia": (
                    float(session.total_inertia) if session.total_inertia else None
                ),
                "chi2": (
                    float(getattr(session, "chi2_value", 0))
                    if hasattr(session, "chi2_value") and getattr(session, "chi2_value")
                    else None
                ),
                "degrees_of_freedom": getattr(session, "degrees_of_freedom", None),
                "dimensions_count": len(eigenvalue_data),
                "eigenvalues": eigenvalue_data,
                "coordinates": {
                    "rows": row_coords,
                    "columns": col_coords,
                    # 因子分析用の座標データ
                    "variables": variable_coords,
                    "observations": observation_coords,
                },
                # 因子分析特有のデータ
                "factor_data": (
                    factor_analysis_data if analysis_type == "factor" else None
                ),
            },
            "metadata": {
                "row_count": session.row_count,
                "column_count": session.column_count,
                "file_size": getattr(session, "file_size", None),
                "analysis_type": analysis_type,
            },
            "visualization": {
                "plot_image": (
                    getattr(visualization, "image_base64", None)
                    if visualization
                    else None
                ),
                "image_info": (
                    {
                        "width": (
                            getattr(visualization, "width", None)
                            if visualization
                            else None
                        ),
                        "height": (
                            getattr(visualization, "height", None)
                            if visualization
                            else None
                        ),
                        "size_bytes": (
                            getattr(visualization, "image_size", None)
                            if visualization
                            else None
                        ),
                    }
                    if visualization
                    else None
                ),
            },
        }

        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"Get session error: {str(e)}")
        import traceback

        traceback.print_exc()

        raise HTTPException(
            status_code=500, detail=f"セッション取得中にエラーが発生しました: {str(e)}"
        )


@router.get("/{session_id}/csv")
async def download_original_csv(
    session_id: int = Path(..., description="セッションID"),
    db: Session = Depends(get_db),
):
    """セッションの元CSVファイルをダウンロード"""
    try:
        print(f"Fetching CSV for session: {session_id}")

        # セッションの存在確認
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(
                status_code=404, detail="指定されたセッションが見つかりません"
            )

        # 元データを取得
        original_data = (
            db.query(OriginalData).filter(OriginalData.session_id == session_id).first()
        )
        if not original_data:
            raise HTTPException(status_code=404, detail="元のCSVデータが見つかりません")

        print(f"Original data found, checking attributes...")
        available_attrs = [
            attr for attr in dir(original_data) if not attr.startswith("_")
        ]
        print(f"Available attributes: {available_attrs}")

        # CSVデータを安全に取得
        csv_content = None

        # 1. csv_dataフィールドを優先
        if hasattr(original_data, "csv_data") and original_data.csv_data:
            print("Found csv_data field")
            csv_content = original_data.csv_data
        # 2. data_matrixから復元
        elif hasattr(original_data, "data_matrix") and original_data.data_matrix:
            try:
                print("Attempting to reconstruct from data_matrix...")
                df = pd.DataFrame(original_data.data_matrix)

                # 行名・列名を設定
                if hasattr(original_data, "row_names") and original_data.row_names:
                    df.index = original_data.row_names
                if (
                    hasattr(original_data, "column_names")
                    and original_data.column_names
                ):
                    df.columns = original_data.column_names

                # CSVとして出力
                output = io.StringIO()
                df.to_csv(output, encoding="utf-8")
                csv_content = output.getvalue()
                output.close()
                print("Successfully reconstructed CSV from data_matrix")

            except Exception as matrix_error:
                print(f"Failed to reconstruct from data_matrix: {matrix_error}")

        # CSVコンテンツが取得できない場合
        if not csv_content:
            raise HTTPException(
                status_code=404, detail="CSVデータを復元できませんでした"
            )

        # ファイル名を設定
        filename = getattr(
            session, "original_filename", f"session_{session_id}_data.csv"
        )
        if not filename.endswith(".csv"):
            filename += ".csv"

        print(f"Returning CSV file: {filename}")
        return Response(
            content=(
                csv_content.encode("utf-8-sig")
                if isinstance(csv_content, str)
                else csv_content
            ),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"CSV download error: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"CSVダウンロード中にエラーが発生しました: {str(e)}"
        )


@router.get("/{session_id}/image")
async def download_plot_image(
    session_id: int = Path(..., description="セッションID"),
    db: Session = Depends(get_db),
):
    """セッションのプロット画像をダウンロード"""
    try:
        print(f"Fetching image for session: {session_id}")

        # セッションの存在確認
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(
                status_code=404, detail="指定されたセッションが見つかりません"
            )

        # 可視化データを取得
        visualization_data = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .first()
        )

        if not visualization_data:
            raise HTTPException(status_code=404, detail="プロット画像が見つかりません")

        print(f"Visualization data found, checking attributes...")
        available_attrs = [
            attr for attr in dir(visualization_data) if not attr.startswith("_")
        ]
        print(f"Available attributes: {available_attrs}")

        # 画像データを安全に取得
        image_data = None

        # 1. image_dataフィールドを優先
        if hasattr(visualization_data, "image_data") and visualization_data.image_data:
            print("Found image_data field (binary)")
            image_data = visualization_data.image_data
        # 2. image_base64フィールド
        elif (
            hasattr(visualization_data, "image_base64")
            and visualization_data.image_base64
        ):
            print("Found image_base64 field")
            try:
                base64_data = visualization_data.image_base64
                if base64_data.startswith("data:image/"):
                    base64_data = base64_data.split(",")[1]
                image_data = base64.b64decode(base64_data)
                print("Successfully decoded base64 image data")
            except Exception as decode_error:
                print(f"Base64 decode error: {decode_error}")
        # 3. その他の属性名パターン
        else:
            for attr_name in [
                "plot_image",
                "plot_data",
                "visualization_data",
                "plot_base64",
            ]:
                if hasattr(visualization_data, attr_name):
                    attr_value = getattr(visualization_data, attr_name)
                    if attr_value:
                        print(f"Found image data in attribute: {attr_name}")
                        if isinstance(attr_value, str):
                            try:
                                if attr_value.startswith("data:image/"):
                                    attr_value = attr_value.split(",")[1]
                                image_data = base64.b64decode(attr_value)
                                break
                            except:
                                continue
                        else:
                            image_data = attr_value
                            break

        if not image_data:
            raise HTTPException(status_code=404, detail="画像データが見つかりません")

        # 分析タイプに応じたファイル名設定
        analysis_type = getattr(session, "analysis_type", "analysis")
        filename = f"{analysis_type}_{session_id}_plot.png"

        print(f"Returning image file: {filename}")
        return Response(
            content=image_data,
            media_type="image/png",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Image download error: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"画像ダウンロード中にエラーが発生しました: {str(e)}",
        )


@router.get("/{session_id}/analysis-csv")
async def download_analysis_results_csv(
    session_id: int = Path(..., description="セッションID"),
    db: Session = Depends(get_db),
):
    """分析結果の詳細データをCSV形式でダウンロード"""
    try:
        print(f"Generating analysis CSV for session: {session_id}")

        # セッションの存在確認
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(
                status_code=404, detail="指定されたセッションが見つかりません"
            )

        analysis_type = getattr(session, "analysis_type", "correspondence")
        print(f"Generating {analysis_type} analysis CSV")

        # 関連データを取得
        coordinates_data = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )
        eigenvalue_data = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .all()
        )

        # 因子分析の場合はメタデータも取得
        factor_metadata = None
        if analysis_type == "factor":
            try:
                factor_metadata = (
                    db.query(AnalysisMetadata)
                    .filter(AnalysisMetadata.session_id == session_id)
                    .all()
                )
                print(
                    f"Found {len(factor_metadata) if factor_metadata else 0} factor metadata records"
                )
            except Exception as meta_error:
                print(f"Could not load factor metadata: {meta_error}")

        print(f"Found {len(coordinates_data)} coordinate records")
        print(f"Found {len(eigenvalue_data)} eigenvalue records")

        output = io.StringIO()

        # ヘッダー情報
        if analysis_type == "factor":
            output.write("因子分析結果\n")
        elif analysis_type == "pca":
            output.write("主成分分析結果\n")
        else:
            output.write("コレスポンデンス分析結果\n")

        output.write(f"セッション名,{session.session_name}\n")
        output.write(f"ファイル名,{getattr(session, 'original_filename', 'unknown')}\n")
        output.write(
            f"分析日時,{session.analysis_timestamp.strftime('%Y-%m-%d %H:%M:%S')}\n"
        )
        output.write(f"データサイズ,{session.row_count}行 × {session.column_count}列\n")
        output.write(f"分析タイプ,{analysis_type}\n")

        if hasattr(session, "total_inertia") and session.total_inertia:
            if analysis_type == "factor":
                output.write(f"総分散説明率,{session.total_inertia:.6f}\n")
            else:
                output.write(f"総慣性,{session.total_inertia:.6f}\n")

        if hasattr(session, "chi2_value") and getattr(session, "chi2_value", None):
            output.write(f"カイ二乗値,{session.chi2_value:.6f}\n")
        if hasattr(session, "degrees_of_freedom") and getattr(
            session, "degrees_of_freedom", None
        ):
            output.write(f"自由度,{session.degrees_of_freedom}\n")
        output.write("\n")

        # 固有値データのセクション
        if eigenvalue_data:
            if analysis_type == "factor":
                output.write("因子別情報\n")
                output.write("因子,固有値,寄与率(%),累積寄与率(%)\n")
            elif analysis_type == "pca":
                output.write("主成分別情報\n")
                output.write("主成分,固有値,寄与率(%),累積寄与率(%)\n")
            else:
                output.write("次元別情報\n")
                output.write("次元,固有値,寄与率(%),累積寄与率(%)\n")

            eigenvalue_data_sorted = sorted(
                eigenvalue_data, key=lambda x: x.dimension_number
            )
            for ev in eigenvalue_data_sorted:
                eigenvalue = ev.eigenvalue if ev.eigenvalue else 0
                explained_inertia = ev.explained_inertia if ev.explained_inertia else 0
                cumulative_inertia = (
                    ev.cumulative_inertia if ev.cumulative_inertia else 0
                )

                if analysis_type == "factor":
                    label = f"因子{ev.dimension_number}"
                elif analysis_type == "pca":
                    label = f"第{ev.dimension_number}主成分"
                else:
                    label = f"第{ev.dimension_number}次元"

                output.write(
                    f"{label},{eigenvalue:.8f},{explained_inertia*100:.2f},{cumulative_inertia*100:.2f}\n"
                )
            output.write("\n")

        # 因子分析特有のメタデータ出力
        if analysis_type == "factor" and factor_metadata:
            for metadata in factor_metadata:
                metadata_type = getattr(metadata, "metadata_type", "")
                metadata_content = getattr(metadata, "metadata_content", {})

                if metadata_type == "factor_loadings" and isinstance(
                    metadata_content, dict
                ):
                    output.write("因子負荷量\n")
                    loadings = metadata_content.get("loadings", [])
                    feature_names = metadata_content.get("feature_names", [])
                    n_factors = metadata_content.get("n_factors", 0)

                    # ヘッダー
                    header = (
                        "変数,"
                        + ",".join([f"因子{i+1}" for i in range(n_factors)])
                        + ",共通性\n"
                    )
                    output.write(header)

                    # データ
                    communalities = metadata_content.get("communalities", [])
                    for i, feature in enumerate(feature_names):
                        if i < len(loadings):
                            loading_values = ",".join(
                                [f"{val:.3f}" for val in loadings[i]]
                            )
                            communality = (
                                communalities[i] if i < len(communalities) else 0
                            )
                            output.write(
                                f"{feature},{loading_values},{communality:.3f}\n"
                            )
                    output.write("\n")

        # 座標データの処理
        if coordinates_data:
            # 座標データを分析タイプに応じて分類
            row_coordinates = []
            col_coordinates = []
            variable_coordinates = []  # 因子分析・PCA用
            observation_coordinates = []  # 因子分析・PCA用

            for coord in coordinates_data:
                # 座標データを安全に取得
                coord_info = {
                    "name": getattr(coord, "point_name", "Unknown"),
                    "dimension_1": float(getattr(coord, "dimension_1", 0)),
                    "dimension_2": float(getattr(coord, "dimension_2", 0)),
                    "point_type": getattr(coord, "point_type", None),
                }

                # point_typeで分類
                if coord_info["point_type"] == "row":
                    row_coordinates.append(coord_info)
                elif coord_info["point_type"] == "column":
                    col_coordinates.append(coord_info)
                elif coord_info["point_type"] == "variable":
                    variable_coordinates.append(coord_info)
                elif coord_info["point_type"] == "observation":
                    observation_coordinates.append(coord_info)
                else:
                    # フォールバック: インデックスで判定
                    coord_index = coordinates_data.index(coord)
                    if analysis_type in ["factor", "pca"]:
                        # 因子分析・PCAの場合
                        if coord_index < len(coordinates_data) // 2:
                            variable_coordinates.append(coord_info)
                        else:
                            observation_coordinates.append(coord_info)
                    else:
                        # コレスポンデンス分析の場合
                        if coord_index < len(coordinates_data) // 2:
                            row_coordinates.append(coord_info)
                        else:
                            col_coordinates.append(coord_info)

            # 分析タイプに応じて座標データを出力
            if analysis_type == "factor":
                # 因子分析の場合
                if variable_coordinates:
                    output.write("変数の因子得点\n")
                    output.write("変数名,因子1,因子2\n")
                    for coord in variable_coordinates:
                        output.write(
                            f"{coord['name']},{coord['dimension_1']:.8f},{coord['dimension_2']:.8f}\n"
                        )
                    output.write("\n")

                if observation_coordinates:
                    output.write("観測値の因子得点\n")
                    output.write("観測名,因子1,因子2\n")
                    for coord in observation_coordinates:
                        output.write(
                            f"{coord['name']},{coord['dimension_1']:.8f},{coord['dimension_2']:.8f}\n"
                        )
                    output.write("\n")

            elif analysis_type == "pca":
                # 主成分分析の場合
                if variable_coordinates:
                    output.write("変数の主成分負荷量\n")
                    output.write("変数名,第1主成分,第2主成分\n")
                    for coord in variable_coordinates:
                        output.write(
                            f"{coord['name']},{coord['dimension_1']:.8f},{coord['dimension_2']:.8f}\n"
                        )
                    output.write("\n")

                if observation_coordinates:
                    output.write("観測値の主成分得点\n")
                    output.write("観測名,第1主成分,第2主成分\n")
                    for coord in observation_coordinates:
                        output.write(
                            f"{coord['name']},{coord['dimension_1']:.8f},{coord['dimension_2']:.8f}\n"
                        )
                    output.write("\n")

            else:
                # コレスポンデンス分析の場合（デフォルト）
                if row_coordinates:
                    output.write("行座標（イメージ）\n")
                    output.write("項目名,第1次元,第2次元\n")
                    for coord in row_coordinates:
                        output.write(
                            f"{coord['name']},{coord['dimension_1']:.8f},{coord['dimension_2']:.8f}\n"
                        )
                    output.write("\n")

                if col_coordinates:
                    output.write("列座標（ブランド）\n")
                    output.write("項目名,第1次元,第2次元\n")
                    for coord in col_coordinates:
                        output.write(
                            f"{coord['name']},{coord['dimension_1']:.8f},{coord['dimension_2']:.8f}\n"
                        )
                    output.write("\n")

            print(
                f"Processed coordinates: rows={len(row_coordinates)}, "
                f"columns={len(col_coordinates)}, "
                f"variables={len(variable_coordinates)}, "
                f"observations={len(observation_coordinates)}"
            )

        # データが見つからない場合の処理
        if not coordinates_data and not eigenvalue_data:
            output.write("座標データおよび固有値データが見つかりませんでした\n")
            output.write("データベースの構造を確認してください\n")

        csv_content = output.getvalue()
        output.close()

        # 分析タイプに応じたファイル名設定
        filename = f"{analysis_type}_analysis_results_{session_id}.csv"

        print(f"Generated analysis CSV: {filename} ({len(csv_content)} characters)")

        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Analysis CSV download error: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"分析結果CSVダウンロード中にエラーが発生しました: {str(e)}",
        )
