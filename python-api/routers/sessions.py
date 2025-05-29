from fastapi import APIRouter, HTTPException, Depends, Query, Path
from sqlalchemy.orm import Session
from typing import Optional
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
