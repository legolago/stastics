# python-api/routers/correspondence.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
from typing import Optional, List

from models import get_db
from analysis.correspondence import CorrespondenceAnalyzer

router = APIRouter(prefix="/correspondence", tags=["correspondence"])


@router.post("/analyze")
async def analyze_correspondence(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    n_components: int = Query(2, description="次元数"),
    db: Session = Depends(get_db),
):
    """コレスポンデンス分析を実行"""
    try:
        print(f"=== API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"次元数: {n_components}")

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

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行（BaseAnalyzerのパイプラインを使用）
        analyzer = CorrespondenceAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            n_components=n_components,
        )

        print("=== API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_correspondence_methods():
    """コレスポンデンス分析で利用可能な手法一覧を取得"""
    return {
        "methods": [
            {
                "name": "standard",
                "display_name": "標準コレスポンデンス分析",
                "description": "基本的なコレスポンデンス分析",
                "parameters": {
                    "n_components": {
                        "type": "integer",
                        "default": 2,
                        "min": 2,
                        "max": 10,
                        "description": "抽出する次元数",
                    }
                },
            }
        ]
    }


@router.get("/parameters/validate")
async def validate_parameters(n_components: int = Query(2, description="次元数")):
    """パラメータの妥当性をチェック"""
    errors = []

    if n_components < 2:
        errors.append("次元数は2以上である必要があります")
    if n_components > 10:
        errors.append("次元数は10以下である必要があります")

    return {"valid": len(errors) == 0, "errors": errors}
