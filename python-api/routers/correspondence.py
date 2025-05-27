from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
from typing import Optional, List

from models import get_db
from analysis.correspondence import CorrespondenceAnalyzer
from utils.database_helper import save_analysis_to_db

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
        # ファイルタイプをチェック
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイルを読み込み
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        df = pd.read_csv(io.StringIO(csv_text), index_col=0)

        # データの基本チェック
        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # コレスポンデンス分析を実行
        analyzer = CorrespondenceAnalyzer()
        ca_results = analyzer.analyze(df, n_components=n_components)

        # プロットを作成
        plot_base64 = analyzer.create_plot(ca_results, df)

        # タグの処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # データベースに保存
        session_id = await save_analysis_to_db(
            db=db,
            analyzer=analyzer,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            df=df,
            results=ca_results,
            plot_base64=plot_base64,
        )

        # 結果を整理
        response_data = {
            "success": True,
            "session_id": session_id,
            "analysis_type": analyzer.get_analysis_type(),
            "data": {
                "total_inertia": float(ca_results["total_inertia"]),
                "chi2": float(ca_results["chi2"]),
                "eigenvalues": [float(x) for x in ca_results["eigenvalues"]],
                "explained_inertia": [float(x) for x in ca_results["explained_inertia"]],
                "cumulative_inertia": [float(x) for x in ca_results["cumulative_inertia"]],
                "degrees_of_freedom": ca_results["degrees_of_freedom"],
                "plot_image": plot_base64,
            },
            "metadata": {
                "session_name": session_name,
                "filename": file.filename,
                "rows": df.shape[0],
                "columns": df.shape[1],
                "row_names": list(df.index),
                "column_names": list(df.columns),
            },
        }

        return JSONResponse(content=response_data)

    except Exception as e:
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
                        "description": "抽出する次元数"
                    }
                }
            }
        ]
    }

@router.get("/parameters/validate")
async def validate_parameters(
    n_components: int = Query(2, description="次元数")
):
    """パラメータの妥当性をチェック"""
    errors = []
    
    if n_components < 2:
        errors.append("次元数は2以上である必要があります")
    if n_components > 10:
        errors.append("次元数は10以下である必要があります")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }