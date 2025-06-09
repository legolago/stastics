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


@router.get("/sessions/{session_id}")
async def get_factor_session_detail(
    session_id: int,
    db: Session = Depends(get_db),
):
    """因子分析セッション詳細を取得"""
    try:
        print(f"📊 因子分析セッション詳細取得開始: {session_id}")

        # FactorAnalysisAnalyzerのインスタンスを作成
        analyzer = FactorAnalysisAnalyzer()

        # 修正されたメソッド名で呼び出し
        session_detail = await analyzer.get_session_detail(session_id, db)

        print(f"🔍 取得されたセッション詳細: {session_detail.get('success', False)}")

        if not session_detail or not session_detail.get("success"):
            error_msg = (
                session_detail.get("error", f"セッション {session_id} が見つかりません")
                if session_detail
                else f"セッション {session_id} が見つかりません"
            )
            raise HTTPException(status_code=404, detail=error_msg)

        return JSONResponse(content=session_detail)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 因子分析セッション詳細取得エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500,
            detail=f"セッション詳細の取得中にエラーが発生しました: {str(e)}",
        )


# routers/factor.py に追加する関数（修正版）


@router.get("/download/{session_id}/details")
async def download_factor_details(session_id: int, db: Session = Depends(get_db)):
    """因子分析結果詳細をCSV形式でダウンロード"""
    try:
        import csv
        import io
        from fastapi.responses import Response
        from models import (
            AnalysisSession,
            EigenvalueData,
            AnalysisMetadata,
            CoordinatesData,
        )

        print(f"Starting factor details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "factor":
            raise HTTPException(
                status_code=400, detail="因子分析のセッションではありません"
            )

        print(f"Session found: {session.session_name}")

        # メタデータを取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        # 座標データを取得
        coordinates_data = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        # 固有値データを取得
        eigenvalue_data = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .all()
        )

        print(
            f"Found {len(metadata_entries)} metadata entries, {len(coordinates_data)} coordinates, {len(eigenvalue_data)} eigenvalues"
        )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # セッション情報
        writer.writerow(["セッション情報"])
        writer.writerow(["項目", "値"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(["分析手法", "因子分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["サンプル数", session.row_count])
        writer.writerow(["変数数", session.column_count])
        writer.writerow([])

        # 固有値と寄与率
        if eigenvalue_data:
            writer.writerow(["因子の固有値と寄与率"])
            writer.writerow(["因子", "固有値", "寄与率(%)", "累積寄与率(%)"])

            for eigenval in sorted(eigenvalue_data, key=lambda x: x.dimension_number):
                eigenvalue = eigenval.eigenvalue if eigenval.eigenvalue else 0
                explained_variance = (
                    eigenval.explained_inertia if eigenval.explained_inertia else 0
                )
                cumulative_variance = (
                    eigenval.cumulative_inertia if eigenval.cumulative_inertia else 0
                )

                writer.writerow(
                    [
                        f"Factor{eigenval.dimension_number}",
                        f"{eigenvalue:.8f}",
                        f"{explained_variance*100:.2f}",
                        f"{cumulative_variance*100:.2f}",
                    ]
                )
            writer.writerow([])

        # 因子負荷量（変数座標）
        variable_coords = [
            coord for coord in coordinates_data if coord.point_type == "variable"
        ]
        if variable_coords:
            writer.writerow(["因子負荷量"])
            writer.writerow(["変数名", "Factor1", "Factor2", "Factor3", "共通性"])
            for coord in variable_coords:
                # 共通性を計算（因子負荷量の二乗和）
                f1 = coord.dimension_1 if coord.dimension_1 else 0.0
                f2 = coord.dimension_2 if coord.dimension_2 else 0.0
                f3 = coord.dimension_3 if coord.dimension_3 else 0.0
                communality = f1**2 + f2**2 + f3**2

                writer.writerow(
                    [
                        coord.point_name,
                        f"{f1:.6f}",
                        f"{f2:.6f}",
                        f"{f3:.6f}",
                        f"{communality:.6f}",
                    ]
                )
            writer.writerow([])

        # 因子得点（サンプル座標）
        sample_coords = [
            coord for coord in coordinates_data if coord.point_type == "observation"
        ]
        if sample_coords:
            writer.writerow(["因子得点"])
            writer.writerow(["サンプル名", "Factor1", "Factor2", "Factor3"])
            for coord in sample_coords:
                writer.writerow(
                    [
                        coord.point_name,
                        f"{coord.dimension_1:.6f}" if coord.dimension_1 else "0.000000",
                        f"{coord.dimension_2:.6f}" if coord.dimension_2 else "0.000000",
                        f"{coord.dimension_3:.6f}" if coord.dimension_3 else "0.000000",
                    ]
                )
            writer.writerow([])

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"factor_details_{session_id}.csv"

        # Responseを作成
        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"詳細CSV出力エラー: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"詳細CSV出力中にエラーが発生しました: {str(e)}"
        )


@router.get("/download/{session_id}/loadings")
async def download_factor_loadings(session_id: int, db: Session = Depends(get_db)):
    """因子負荷量をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "factor":
            raise HTTPException(
                status_code=400, detail="因子分析のセッションではありません"
            )

        # 変数座標データ（因子負荷量）を取得
        loadings = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "variable",
            )
            .all()
        )

        if not loadings:
            raise HTTPException(status_code=404, detail="因子負荷量が見つかりません")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(
            ["variable_name", "Factor1", "Factor2", "Factor3", "communality"]
        )

        # データ行
        for loading in loadings:
            f1 = loading.dimension_1 if loading.dimension_1 is not None else 0.0
            f2 = loading.dimension_2 if loading.dimension_2 is not None else 0.0
            f3 = loading.dimension_3 if loading.dimension_3 is not None else 0.0
            communality = f1**2 + f2**2 + f3**2

            writer.writerow([loading.point_name, f1, f2, f3, communality])

        output.seek(0)

        # レスポンス作成
        response = StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=factor_loadings_{session_id}.csv"
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"因子負荷量CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"因子負荷量CSV出力中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/scores")
async def download_factor_scores(session_id: int, db: Session = Depends(get_db)):
    """因子得点をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "factor":
            raise HTTPException(
                status_code=400, detail="因子分析のセッションではありません"
            )

        # サンプル座標データ（因子得点）を取得
        scores = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "observation",
            )
            .all()
        )

        if not scores:
            raise HTTPException(status_code=404, detail="因子得点が見つかりません")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(["sample_name", "Factor1", "Factor2", "Factor3"])

        # データ行
        for score in scores:
            writer.writerow(
                [
                    score.point_name,
                    score.dimension_1 if score.dimension_1 is not None else 0.0,
                    score.dimension_2 if score.dimension_2 is not None else 0.0,
                    score.dimension_3 if score.dimension_3 is not None else 0.0,
                ]
            )

        output.seek(0)

        # レスポンス作成
        response = StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=factor_scores_{session_id}.csv"
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"因子得点CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"因子得点CSV出力中にエラーが発生しました: {str(e)}"
        )
