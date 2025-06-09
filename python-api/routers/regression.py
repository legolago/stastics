from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
import csv
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
    method: str = Query(
        "linear", description="回帰手法 (linear, polynomial, multiple)"
    ),
    target_variable: str = Query(..., description="目的変数（従属変数）"),
    explanatory_variables: str = Query(
        ..., description="説明変数（独立変数）（カンマ区切り）"
    ),
    polynomial_degree: int = Query(2, description="多項式回帰の次数"),
    test_size: float = Query(0.2, description="テストデータの割合"),
    random_state: int = Query(42, description="ランダムシード"),
    include_intercept: bool = Query(True, description="切片を含むかどうか"),
    standardize: bool = Query(False, description="説明変数を標準化するかどうか"),
    db: Session = Depends(get_db),
):
    """回帰分析を実行"""
    try:
        print(f"=== 回帰分析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"手法: {method}")
        print(f"目的変数: {target_variable}")
        print(f"説明変数: {explanatory_variables}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            csv_text = contents.decode("shift_jis")

        print(f"CSVテキスト:\n{csv_text[:500]}...")  # 最初の500文字のみ表示

        df = pd.read_csv(io.StringIO(csv_text), index_col=0)
        print(f"データフレーム形状: {df.shape}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # パラメータ検証
        if method not in ["linear", "polynomial", "multiple"]:
            raise HTTPException(
                status_code=400,
                detail="手法はlinear, polynomial, multipleから選択してください",
            )

        # 変数名の検証
        if target_variable not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"目的変数 '{target_variable}' がデータに存在しません",
            )

        explanatory_vars = [var.strip() for var in explanatory_variables.split(",")]
        for var in explanatory_vars:
            if var not in df.columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"説明変数 '{var}' がデータに存在しません",
                )

        # 単回帰の場合は説明変数が1つのみ
        if method == "linear" and len(explanatory_vars) > 1:
            raise HTTPException(
                status_code=400,
                detail="単回帰分析では説明変数は1つのみ指定してください",
            )

        # 重回帰の場合は説明変数が2つ以上
        if method == "multiple" and len(explanatory_vars) < 2:
            raise HTTPException(
                status_code=400,
                detail="重回帰分析では説明変数を2つ以上指定してください",
            )

        # 多項式回帰の次数検証
        if method == "polynomial":
            if polynomial_degree < 1 or polynomial_degree > 6:
                raise HTTPException(
                    status_code=400,
                    detail="多項式の次数は1以上6以下で設定してください",
                )
            if len(explanatory_vars) > 1:
                raise HTTPException(
                    status_code=400,
                    detail="多項式回帰では説明変数は1つのみ指定してください",
                )

        # テストサイズの検証
        if test_size <= 0 or test_size >= 1:
            raise HTTPException(
                status_code=400,
                detail="テストサイズは0より大きく1より小さい値で設定してください",
            )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行（因子分析と同じパターンを使用）
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
            method=method,
            target_variable=target_variable,
            explanatory_variables=explanatory_vars,
            polynomial_degree=polynomial_degree,
            test_size=test_size,
            random_state=random_state,
            include_intercept=include_intercept,
            standardize=standardize,
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
            status_code=500, detail=f"分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/sessions/{session_id}")
async def get_regression_session_detail(
    session_id: int,
    db: Session = Depends(get_db),
):
    """回帰分析セッション詳細を取得（因子分析を参考に追加）"""
    try:
        print(f"📊 回帰分析セッション詳細取得開始: {session_id}")

        # RegressionAnalyzerのインスタンスを作成
        analyzer = RegressionAnalyzer()

        # セッション詳細を取得
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
        print(f"❌ 回帰分析セッション詳細取得エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500,
            detail=f"セッション詳細の取得中にエラーが発生しました: {str(e)}",
        )


@router.get("/methods")
async def get_regression_methods():
    """回帰分析で利用可能な手法一覧を取得"""
    return {
        "methods": [
            {
                "name": "linear",
                "display_name": "単回帰分析",
                "description": "1つの説明変数を使用した線形回帰分析",
                "parameters": {
                    "target_variable": {
                        "type": "string",
                        "description": "目的変数（従属変数）",
                        "required": True,
                    },
                    "explanatory_variables": {
                        "type": "string",
                        "description": "説明変数（独立変数）- 1つのみ",
                        "required": True,
                    },
                    "include_intercept": {
                        "type": "boolean",
                        "default": True,
                        "description": "切片を含むかどうか",
                    },
                    "test_size": {
                        "type": "float",
                        "default": 0.2,
                        "min": 0.1,
                        "max": 0.5,
                        "description": "テストデータの割合",
                    },
                },
            },
            {
                "name": "multiple",
                "display_name": "重回帰分析",
                "description": "複数の説明変数を使用した線形回帰分析",
                "parameters": {
                    "target_variable": {
                        "type": "string",
                        "description": "目的変数（従属変数）",
                        "required": True,
                    },
                    "explanatory_variables": {
                        "type": "string",
                        "description": "説明変数（独立変数）- カンマ区切りで複数指定",
                        "required": True,
                    },
                    "standardize": {
                        "type": "boolean",
                        "default": False,
                        "description": "説明変数を標準化するかどうか",
                    },
                    "include_intercept": {
                        "type": "boolean",
                        "default": True,
                        "description": "切片を含むかどうか",
                    },
                    "test_size": {
                        "type": "float",
                        "default": 0.2,
                        "min": 0.1,
                        "max": 0.5,
                        "description": "テストデータの割合",
                    },
                },
            },
            {
                "name": "polynomial",
                "display_name": "多項式回帰分析",
                "description": "1つの説明変数を使用した多項式回帰分析",
                "parameters": {
                    "target_variable": {
                        "type": "string",
                        "description": "目的変数（従属変数）",
                        "required": True,
                    },
                    "explanatory_variables": {
                        "type": "string",
                        "description": "説明変数（独立変数）- 1つのみ",
                        "required": True,
                    },
                    "polynomial_degree": {
                        "type": "integer",
                        "default": 2,
                        "min": 1,
                        "max": 6,
                        "description": "多項式の次数",
                    },
                    "include_intercept": {
                        "type": "boolean",
                        "default": True,
                        "description": "切片を含むかどうか",
                    },
                    "test_size": {
                        "type": "float",
                        "default": 0.2,
                        "min": 0.1,
                        "max": 0.5,
                        "description": "テストデータの割合",
                    },
                },
            },
        ]
    }


@router.get("/parameters/validate")
async def validate_parameters(
    method: str = Query("linear", description="手法"),
    target_variable: str = Query("", description="目的変数"),
    explanatory_variables: str = Query("", description="説明変数"),
    polynomial_degree: int = Query(2, description="多項式次数"),
    test_size: float = Query(0.2, description="テストサイズ"),
):
    """パラメータの妥当性をチェック"""
    errors = []

    if method not in ["linear", "polynomial", "multiple"]:
        errors.append("手法はlinear, polynomial, multipleから選択してください")

    if not target_variable:
        errors.append("目的変数を指定してください")

    if not explanatory_variables:
        errors.append("説明変数を指定してください")

    if explanatory_variables:
        explanatory_vars = [var.strip() for var in explanatory_variables.split(",")]

        if method == "linear" and len(explanatory_vars) > 1:
            errors.append("単回帰分析では説明変数は1つのみ指定してください")

        if method == "multiple" and len(explanatory_vars) < 2:
            errors.append("重回帰分析では説明変数を2つ以上指定してください")

        if method == "polynomial" and len(explanatory_vars) > 1:
            errors.append("多項式回帰では説明変数は1つのみ指定してください")

    if method == "polynomial":
        if polynomial_degree < 1 or polynomial_degree > 6:
            errors.append("多項式の次数は1以上6以下で設定してください")

    if test_size <= 0 or test_size >= 1:
        errors.append("テストサイズは0より大きく1より小さい値で設定してください")

    return {"valid": len(errors) == 0, "errors": errors}


@router.get("/download/{session_id}/predictions")
async def download_regression_predictions(
    session_id: int, db: Session = Depends(get_db)
):
    """回帰分析の予測結果をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "regression":
            raise HTTPException(
                status_code=400, detail="回帰分析のセッションではありません"
            )

        # 予測データを取得
        predictions = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        if not predictions:
            raise HTTPException(status_code=404, detail="予測データが見つかりません")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(
            ["sample_name", "actual_value", "predicted_value", "residual", "data_type"]
        )

        # データ行
        for pred in predictions:
            actual = pred.dimension_1 if pred.dimension_1 is not None else 0
            predicted = pred.dimension_2 if pred.dimension_2 is not None else 0
            residual = actual - predicted
            writer.writerow(
                [pred.point_name, actual, predicted, residual, pred.point_type]
            )

        output.seek(0)

        # レスポンス作成
        response = StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=regression_predictions_{session_id}.csv"
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"CSV出力中にエラーが発生しました: {str(e)}"
        )


@router.get("/download/{session_id}/details")
async def download_regression_details(session_id: int, db: Session = Depends(get_db)):
    """回帰分析結果詳細をCSV形式でダウンロード"""
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

        print(f"Starting regression details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "regression":
            raise HTTPException(
                status_code=400, detail="回帰分析のセッションではありません"
            )

        print(f"Session found: {session.session_name}")

        # メタデータを取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        # 予測データを取得
        predictions_data = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        print(
            f"Found {len(metadata_entries)} metadata entries and {len(predictions_data)} predictions"
        )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # セッション情報
        writer.writerow(["セッション情報"])
        writer.writerow(["項目", "値"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(["分析手法", "回帰分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["サンプル数", session.row_count])
        writer.writerow(["変数数", session.column_count])
        writer.writerow([])

        # 回帰結果統計
        writer.writerow(["回帰分析結果"])
        writer.writerow(["指標", "値"])

        # メタデータから回帰統計を取得
        regression_found = False
        for metadata in metadata_entries:
            if metadata.metadata_type == "regression_stats":
                regression_found = True
                stats = metadata.metadata_content
                print(f"Found regression stats: {stats}")

                writer.writerow(
                    ["決定係数 (R²)", f"{stats.get('r2_score', 'N/A'):.4f}"]
                )
                writer.writerow(
                    ["調整済み決定係数", f"{stats.get('adjusted_r2', 'N/A'):.4f}"]
                )
                writer.writerow(
                    ["平均二乗誤差 (MSE)", f"{stats.get('mse', 'N/A'):.4f}"]
                )
                writer.writerow(
                    ["平均絶対誤差 (MAE)", f"{stats.get('mae', 'N/A'):.4f}"]
                )
                writer.writerow(
                    ["二乗平均平方根誤差 (RMSE)", f"{stats.get('rmse', 'N/A'):.4f}"]
                )

                if "f_statistic" in stats:
                    writer.writerow(
                        ["F統計量", f"{stats.get('f_statistic', 'N/A'):.4f}"]
                    )
                if "p_value" in stats:
                    writer.writerow(["p値", f"{stats.get('p_value', 'N/A'):.6f}"])
                break

        if not regression_found:
            writer.writerow(["回帰統計情報が見つかりませんでした"])

        writer.writerow([])

        # 回帰係数
        coefficients_found = False
        for metadata in metadata_entries:
            if metadata.metadata_type == "regression_coefficients":
                coefficients_found = True
                coeffs = metadata.metadata_content
                writer.writerow(["回帰係数"])
                writer.writerow(["変数", "係数", "標準誤差", "t値", "p値"])

                for var_name, coeff_info in coeffs.items():
                    if isinstance(coeff_info, dict):
                        writer.writerow(
                            [
                                var_name,
                                f"{coeff_info.get('coefficient', 'N/A'):.6f}",
                                f"{coeff_info.get('std_error', 'N/A'):.6f}",
                                f"{coeff_info.get('t_value', 'N/A'):.4f}",
                                f"{coeff_info.get('p_value', 'N/A'):.6f}",
                            ]
                        )
                    else:
                        writer.writerow(
                            [var_name, f"{coeff_info:.6f}", "N/A", "N/A", "N/A"]
                        )
                break

        if not coefficients_found:
            writer.writerow(["回帰係数"])
            writer.writerow(["係数情報が見つかりませんでした"])

        writer.writerow([])

        # 予測結果
        if predictions_data:
            writer.writerow(["予測結果"])
            writer.writerow(["サンプル名", "実際値", "予測値", "残差", "データ種別"])

            for pred in predictions_data:
                actual = pred.dimension_1 if pred.dimension_1 is not None else 0
                predicted = pred.dimension_2 if pred.dimension_2 is not None else 0
                residual = actual - predicted
                writer.writerow(
                    [
                        pred.point_name,
                        f"{actual:.4f}",
                        f"{predicted:.4f}",
                        f"{residual:.4f}",
                        pred.point_type,
                    ]
                )

            print(f"Added {len(predictions_data)} predictions")
            writer.writerow([])
        else:
            writer.writerow(["予測結果"])
            writer.writerow(["予測データが見つかりませんでした"])
            writer.writerow([])

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"regression_details_{session_id}.csv"

        # Responseを正しく作成
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
