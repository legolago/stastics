from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import io
from typing import Optional, List

from models import get_db
from analysis.factor import FactorAnalysisAnalyzer

# 必須でないライブラリは条件付きインポート
try:
    from factor_analyzer import FactorAnalyzer as FactorAnalyzerLib

    FACTOR_ANALYZER_AVAILABLE = True
except ImportError:
    FACTOR_ANALYZER_AVAILABLE = False

router = APIRouter(prefix="/factor", tags=["factor"])


@router.post("/analyze")
async def analyze_factor(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    n_factors: Optional[int] = Query(
        None, description="因子数（指定しない場合は自動決定）"
    ),
    rotation: str = Query("varimax", description="回転方法"),
    standardize: bool = Query(True, description="データを標準化するか"),
    db: Session = Depends(get_db),
):
    """因子分析を実行"""
    try:
        print(f"=== 因子分析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"因子数: {n_factors}, 回転: {rotation}, 標準化: {standardize}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            csv_text = contents.decode("shift_jis")

        print(f"CSVテキスト:\n{csv_text}")

        df = pd.read_csv(io.StringIO(csv_text), index_col=0)
        print(f"データフレーム:\n{df}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 数値データのみを抽出
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.empty:
            raise HTTPException(
                status_code=400,
                detail="数値データが見つかりません。因子分析には数値データが必要です。",
            )

        # 欠損値の処理
        if numeric_df.isnull().any().any():
            numeric_df = numeric_df.dropna()
            if numeric_df.empty:
                raise HTTPException(
                    status_code=400,
                    detail="欠損値を除去した結果、データが空になりました。",
                )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行（BaseAnalyzerのパイプラインを使用）
        analyzer = FactorAnalysisAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=numeric_df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            n_factors=n_factors,
            rotation=rotation,
            standardize=standardize,
        )

        print("=== 因子分析API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== 因子分析API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"因子分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_factor_methods():
    """因子分析で利用可能な手法一覧を取得"""
    methods = {
        "rotation_methods": [
            {
                "id": "varimax",
                "name": "バリマックス回転",
                "description": "直交回転、因子の解釈を簡単にする",
            },
            {
                "id": "quartimax",
                "name": "クォーティマックス回転",
                "description": "直交回転、変数の解釈を簡単にする",
            },
        ],
        "guidelines": {
            "kmo_thresholds": {
                "excellent": {"value": 0.9, "label": "優秀"},
                "good": {"value": 0.8, "label": "良好"},
                "adequate": {"value": 0.7, "label": "適切"},
                "poor": {"value": 0.6, "label": "不良"},
                "unacceptable": {"value": 0.5, "label": "不適切"},
            },
            "minimum_sample_size": "変数数の5-10倍",
            "minimum_variables": 3,
            "communality_threshold": 0.5,
        },
        "library_status": {
            "factor_analyzer": FACTOR_ANALYZER_AVAILABLE,
            "sklearn_alternative": True,
        },
    }

    if FACTOR_ANALYZER_AVAILABLE:
        methods["rotation_methods"].extend(
            [
                {
                    "id": "promax",
                    "name": "プロマックス回転",
                    "description": "斜交回転、因子間の相関を許可",
                },
                {
                    "id": "oblimin",
                    "name": "オブリミン回転",
                    "description": "斜交回転、柔軟な因子構造",
                },
                {
                    "id": "equamax",
                    "name": "イクアマックス回転",
                    "description": "直交回転、varimax と quartimax の中間",
                },
            ]
        )

    return methods


@router.get("/parameters/validate")
async def validate_factor_parameters(
    n_factors: Optional[int] = Query(None, description="因子数"),
    rotation: str = Query("varimax", description="回転方法"),
    standardize: bool = Query(True, description="標準化"),
):
    """因子分析パラメータの検証"""
    validation_result = {"valid": True, "warnings": [], "errors": []}

    # 因子数の検証
    if n_factors is not None:
        if n_factors < 1:
            validation_result["errors"].append("因子数は1以上である必要があります")
            validation_result["valid"] = False
        elif n_factors > 20:
            validation_result["warnings"].append(
                "因子数が多すぎる可能性があります（推奨: ≤10）"
            )

    # 回転方法の検証
    if FACTOR_ANALYZER_AVAILABLE:
        valid_rotations = ["varimax", "promax", "oblimin", "quartimax", "equamax"]
    else:
        valid_rotations = ["varimax", "quartimax"]

    if rotation not in valid_rotations:
        validation_result["errors"].append(
            f"無効な回転方法です。利用可能: {valid_rotations}"
        )
        validation_result["valid"] = False

    return validation_result


@router.get("/interpretation")
async def get_interpretation_guide():
    """因子分析結果の解釈ガイドを取得"""
    return {
        "kmo_interpretation": {
            "description": "Kaiser-Meyer-Olkin適合度測度",
            "ranges": {
                "0.9以上": "優秀 - 因子分析に非常に適している",
                "0.8-0.9": "良好 - 因子分析に適している",
                "0.7-0.8": "適切 - 因子分析が可能",
                "0.6-0.7": "不良 - 因子分析には不適切",
                "0.6未満": "不適切 - 因子分析は推奨されない",
            },
        },
        "bartlett_test": {
            "description": "Bartlett球面性検定",
            "interpretation": {
                "p < 0.05": "有意 - 変数間に相関があり、因子分析に適している",
                "p >= 0.05": "非有意 - 変数間の相関が低く、因子分析に不適切",
            },
        },
        "communality": {
            "description": "共通性 - 因子によって説明される変数の分散の割合",
            "ranges": {
                "0.7以上": "高い - 因子によってよく説明される",
                "0.5-0.7": "中程度 - 適切に説明される",
                "0.5未満": "低い - 因子による説明が不十分",
            },
        },
        "factor_loadings": {
            "description": "因子負荷量 - 変数と因子の相関の強さ",
            "ranges": {
                "0.7以上": "強い関連",
                "0.5-0.7": "中程度の関連",
                "0.3-0.5": "弱い関連",
                "0.3未満": "ほとんど関連なし",
            },
        },
        "eigenvalue": {
            "description": "固有値 - 各因子が説明する分散の大きさ",
            "interpretation": {
                "Kaiser基準": "固有値1以上の因子を採用",
                "スクリー基準": "スクリープロットの急激な減少点まで採用",
            },
        },
    }
