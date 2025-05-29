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
    get_db,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def get_analysis_sessions(
    user_id: str = Query("default", description="ユーザーID"),
    search: str = Query(None, description="検索キーワード"),
    tags: str = Query(None, description="タグフィルター（カンマ区切り）"),
    limit: int = Query(20, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    db: Session = Depends(get_db),
):
    """保存された分析セッションの一覧を取得"""
    try:
        query = db.query(AnalysisSession).filter(AnalysisSession.user_id == user_id)

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
                "dimension_1_contribution": (
                    float(session.dimension_1_contribution)
                    if session.dimension_1_contribution
                    else None
                ),
                "dimension_2_contribution": (
                    float(session.dimension_2_contribution)
                    if session.dimension_2_contribution
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

        # 1. 可視化データを削除
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

        # 2. 座標データを削除
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

        # 3. 固有値データを削除
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

        # 4. 元データを削除
        original_data_count = (
            db.query(OriginalData).filter(OriginalData.session_id == session_id).count()
        )
        if original_data_count > 0:
            db.query(OriginalData).filter(
                OriginalData.session_id == session_id
            ).delete()
            print(f"Deleted {original_data_count} original data records")

        # 5. 最後にセッション自体を削除
        db.delete(session)

        # 変更をコミット
        db.commit()

        print(f"Successfully deleted session {session_id}")

        return {
            "success": True,
            "message": f"セッション '{session.session_name}' を正常に削除しました",
            "deleted_session_id": session_id,
            "deleted_counts": {
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
            "dimension_1_contribution": (
                float(session.dimension_1_contribution)
                if session.dimension_1_contribution
                else None
            ),
            "dimension_2_contribution": (
                float(session.dimension_2_contribution)
                if session.dimension_2_contribution
                else None
            ),
            "row_count": session.row_count,
            "column_count": session.column_count,
        }

        return {"success": True, "data": session_data}

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

        # 元データを取得（main.pyの方式に合わせる）
        original_data = (
            db.query(OriginalData).filter(OriginalData.session_id == session_id).first()
        )
        if not original_data:
            raise HTTPException(status_code=404, detail="元のCSVデータが見つかりません")

        print(f"Original data found, checking attributes...")
        print(
            f"Available attributes: {[attr for attr in dir(original_data) if not attr.startswith('_')]}"
        )

        # main.pyと同じ方式でcsv_dataフィールドを確認
        csv_content = None

        # 直接csv_dataフィールドがある場合（main.pyの方式）
        if hasattr(original_data, "csv_data") and original_data.csv_data:
            print("Found csv_data field")
            csv_content = original_data.csv_data
        else:
            print("csv_data field not found, trying alternative approaches...")

            # 代替手段：data_matrixから復元
            if hasattr(original_data, "data_matrix") and original_data.data_matrix:
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

            # 最終手段：個別レコードから復元を試行
            if not csv_content:
                print("Attempting to reconstruct from individual records...")
                try:
                    # 複数レコードとして保存されている場合
                    all_records = (
                        db.query(OriginalData)
                        .filter(OriginalData.session_id == session_id)
                        .all()
                    )
                    if len(all_records) > 1:
                        # 個別レコードから復元するロジック
                        # この部分は実際のデータ構造に応じて調整が必要
                        csv_content = "# データ復元に失敗しました\n# 管理者にお問い合わせください\n"

                except Exception as records_error:
                    print(f"Failed to reconstruct from records: {records_error}")

        # CSVコンテンツが取得できない場合
        if not csv_content:
            raise HTTPException(
                status_code=404, detail="CSVデータを復元できませんでした"
            )

        # ファイル名を設定
        filename = session.original_filename or f"session_{session_id}_data.csv"
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

        # 可視化データを取得（main.pyの方式に合わせる）
        visualization_data = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .first()
        )

        if not visualization_data:
            raise HTTPException(status_code=404, detail="プロット画像が見つかりません")

        print(f"Visualization data found, checking attributes...")
        print(
            f"Available attributes: {[attr for attr in dir(visualization_data) if not attr.startswith('_')]}"
        )

        # 画像データを取得（main.pyと同じ方式）
        image_data = None

        # main.pyの方式：image_dataフィールドを優先
        if hasattr(visualization_data, "image_data") and visualization_data.image_data:
            print("Found image_data field (binary)")
            image_data = visualization_data.image_data
        elif (
            hasattr(visualization_data, "image_base64")
            and visualization_data.image_base64
        ):
            print("Found image_base64 field")
            try:
                # Base64エンコードされたデータをデコード
                base64_data = visualization_data.image_base64
                if base64_data.startswith("data:image/"):
                    # data:image/png;base64, プレフィックスを除去
                    base64_data = base64_data.split(",")[1]

                image_data = base64.b64decode(base64_data)
                print("Successfully decoded base64 image data")
            except Exception as decode_error:
                print(f"Base64 decode error: {decode_error}")
        else:
            # その他の属性名パターンを試す
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
                            # Base64文字列の場合
                            try:
                                if attr_value.startswith("data:image/"):
                                    attr_value = attr_value.split(",")[1]
                                image_data = base64.b64decode(attr_value)
                                break
                            except:
                                continue
                        else:
                            # バイナリデータの場合
                            image_data = attr_value
                            break

        if not image_data:
            raise HTTPException(status_code=404, detail="画像データが見つかりません")

        # ファイル名を設定
        filename = f"analysis_{session_id}_plot.png"

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
        # セッションの存在確認
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(
                status_code=404, detail="指定されたセッションが見つかりません"
            )

        # 分析タイプを取得（コレスポンデンス分析がデフォルト）
        analysis_type = getattr(session, "analysis_type", "correspondence")

        output = io.StringIO()

        # ヘッダー情報
        output.write("分析結果詳細データ\n\n")
        output.write(f"セッション名,{session.session_name}\n")
        output.write(f"分析日時,{session.analysis_timestamp}\n")
        output.write(f"分析タイプ,{analysis_type}\n")
        output.write(f"元ファイル名,{session.original_filename}\n\n")

        # 固有値データ
        eigenvalue_data = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .order_by(EigenvalueData.dimension_number)
            .all()
        )

        if eigenvalue_data:
            output.write("固有値・寄与率\n")
            output.write("次元,固有値,寄与率(%),累積寄与率(%)\n")

            total_eigenvalue = sum([ev.eigenvalue for ev in eigenvalue_data])
            cumulative_ratio = 0

            for ev in eigenvalue_data:
                ratio = (
                    (ev.eigenvalue / total_eigenvalue * 100)
                    if total_eigenvalue > 0
                    else 0
                )
                cumulative_ratio += ratio
                output.write(
                    f"第{ev.dimension_number}次元,{ev.eigenvalue:.6f},{ratio:.2f},{cumulative_ratio:.2f}\n"
                )
            output.write("\n")

        # 座標データ
        coordinates_data = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        if coordinates_data:
            # 行座標と列座標を分離
            row_coords = [c for c in coordinates_data if c.coordinate_type == "row"]
            col_coords = [c for c in coordinates_data if c.coordinate_type == "column"]

            if row_coords:
                output.write("行座標\n")
                output.write("項目名,第1次元,第2次元,寄与度,品質\n")
                for coord in row_coords:
                    output.write(
                        f"{coord.label},{coord.dimension_1:.6f},{coord.dimension_2:.6f},{coord.contribution or 0:.6f},{coord.quality or 0:.6f}\n"
                    )
                output.write("\n")

            if col_coords:
                output.write("列座標\n")
                output.write("項目名,第1次元,第2次元,寄与度,品質\n")
                for coord in col_coords:
                    output.write(
                        f"{coord.label},{coord.dimension_1:.6f},{coord.dimension_2:.6f},{coord.contribution or 0:.6f},{coord.quality or 0:.6f}\n"
                    )
                output.write("\n")

        csv_content = output.getvalue()
        output.close()

        filename = f"analysis_results_{session_id}.csv"

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
