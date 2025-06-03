# python-api/routers/regression.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
from typing import Optional, List

from models import get_db
from analysis.regression import RegressionAnalyzer

router = APIRouter(prefix="/regression", tags=["regression"])


@router.post("/analyze")
async def analyze_regression(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    target_column: str = Query(..., description="目的変数のカラム名"),
    regression_type: str = Query(
        "linear", description="回帰の種類: linear, multiple, polynomial"
    ),
    polynomial_degree: int = Query(
        2, description="多項式回帰の次数（polynomial選択時）"
    ),
    test_size: float = Query(0.3, description="テストデータの割合"),
    include_intercept: bool = Query(True, description="切片を含めるか"),
    db: Session = Depends(get_db),
):
    """回帰分析を実行"""
    try:
        print(f"=== 回帰分析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"目的変数: {target_column}")
        print(f"回帰の種類: {regression_type}")

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

        # 目的変数の存在確認
        if target_column not in df.columns:
            available_columns = list(df.columns)
            raise HTTPException(
                status_code=400,
                detail=f"目的変数 '{target_column}' が見つかりません。利用可能なカラム: {available_columns}",
            )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行（BaseAnalyzerのパイプラインを使用）
        analyzer = RegressionAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            target_column=target_column,
            regression_type=regression_type,
            polynomial_degree=polynomial_degree,
            test_size=test_size,
            include_intercept=include_intercept,
        )

        print("=== 回帰分析API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== 回帰分析API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"回帰分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_regression_methods():
    """回帰分析で利用可能な手法一覧を取得"""
    return {
        "methods": [
            {
                "name": "linear",
                "display_name": "単回帰分析",
                "description": "一つの説明変数による線形回帰",
                "parameters": {
                    "target_column": {
                        "type": "string",
                        "required": True,
                        "description": "目的変数のカラム名",
                    },
                    "test_size": {
                        "type": "float",
                        "default": 0.3,
                        "min": 0.1,
                        "max": 0.9,
                        "description": "テストデータの割合",
                    },
                    "include_intercept": {
                        "type": "boolean",
                        "default": True,
                        "description": "切片を含めるか",
                    },
                },
            },
            {
                "name": "multiple",
                "display_name": "重回帰分析",
                "description": "複数の説明変数による線形回帰",
                "parameters": {
                    "target_column": {
                        "type": "string",
                        "required": True,
                        "description": "目的変数のカラム名",
                    },
                    "test_size": {
                        "type": "float",
                        "default": 0.3,
                        "min": 0.1,
                        "max": 0.9,
                        "description": "テストデータの割合",
                    },
                    "include_intercept": {
                        "type": "boolean",
                        "default": True,
                        "description": "切片を含めるか",
                    },
                },
            },
            {
                "name": "polynomial",
                "display_name": "多項式回帰",
                "description": "多項式による非線形回帰",
                "parameters": {
                    "target_column": {
                        "type": "string",
                        "required": True,
                        "description": "目的変数のカラム名",
                    },
                    "polynomial_degree": {
                        "type": "integer",
                        "default": 2,
                        "min": 2,
                        "max": 5,
                        "description": "多項式の次数",
                    },
                    "test_size": {
                        "type": "float",
                        "default": 0.3,
                        "min": 0.1,
                        "max": 0.9,
                        "description": "テストデータの割合",
                    },
                    "include_intercept": {
                        "type": "boolean",
                        "default": True,
                        "description": "切片を含めるか",
                    },
                },
            },
        ]
    }


@router.get("/parameters/validate")
async def validate_parameters(
    target_column: str = Query(..., description="目的変数"),
    regression_type: str = Query("linear", description="回帰の種類"),
    polynomial_degree: int = Query(2, description="多項式の次数"),
    test_size: float = Query(0.3, description="テストデータの割合"),
):
    """パラメータの妥当性をチェック"""
    errors = []

    if not target_column or target_column.strip() == "":
        errors.append("目的変数は必須です")

    if regression_type not in ["linear", "multiple", "polynomial"]:
        errors.append(
            "回帰の種類は linear, multiple, polynomial のいずれかである必要があります"
        )

    if polynomial_degree < 2 or polynomial_degree > 5:
        errors.append("多項式の次数は2以上5以下である必要があります")

    if test_size < 0.1 or test_size > 0.9:
        errors.append("テストデータの割合は0.1以上0.9以下である必要があります")

    return {"valid": len(errors) == 0, "errors": errors}


@router.get("/columns/{file_hash}")
async def get_available_columns():
    """アップロードされたファイルの利用可能なカラム一覧を取得（将来の実装用）"""
    # 実際の実装では、一時的にファイルを保存してカラム情報を返す
    return {"columns": [], "message": "この機能は将来実装予定です"}
