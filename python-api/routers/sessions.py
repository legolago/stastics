from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from models import AnalysisSession, get_db

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
