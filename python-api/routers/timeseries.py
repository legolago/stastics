from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query, Form
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import io
import csv
from typing import Optional, List

from models import get_db
from analysis.timeseries import TimeSeriesAnalyzer

# LightGBMの利用可能性チェック
try:
    import lightgbm as lgb

    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False

router = APIRouter(prefix="/timeseries", tags=["timeseries"])


@router.post("/analyze")
async def analyze_timeseries(
    file: UploadFile = File(...),
    session_name: str = Form(..., description="分析セッション名"),
    description: Optional[str] = Form(None, description="分析の説明"),
    tags: Optional[str] = Form(None, description="タグ（カンマ区切り）"),
    user_id: str = Form("default", description="ユーザーID"),
    target_column: str = Form(..., description="目的変数列名"),
    date_column: Optional[str] = Form(None, description="日付列名"),
    feature_columns: Optional[str] = Form(
        None, description="説明変数列名（カンマ区切り）"
    ),
    forecast_periods: int = Form(30, description="予測期間数"),
    test_size: float = Form(0.2, description="テストデータの割合"),
    db: Session = Depends(get_db),
):
    """時系列分析を実行"""
    try:
        print(f"=== 時系列分析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"目的変数: {target_column}, 日付列: {date_column}")
        print(f"予測期間: {forecast_periods}, テストサイズ: {test_size}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            csv_text = contents.decode("shift_jis")

        print(f"CSVテキスト:\n{csv_text[:500]}...")

        df = pd.read_csv(io.StringIO(csv_text))
        print(f"データフレーム形状: {df.shape}")
        print(f"列名: {list(df.columns)}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 目的変数の存在確認
        if target_column not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"目的変数 '{target_column}' が見つかりません。利用可能な列: {list(df.columns)}",
            )

        # 数値データの確認
        if target_column not in df.select_dtypes(include=[np.number]).columns:
            raise HTTPException(
                status_code=400,
                detail=f"目的変数 '{target_column}' は数値型である必要があります",
            )

        # 日付列の確認
        if date_column and date_column not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=f"日付列 '{date_column}' が見つかりません。利用可能な列: {list(df.columns)}",
            )

        # 特徴量列の処理
        feature_list = None
        if feature_columns:
            feature_list = [col.strip() for col in feature_columns.split(",")]
            missing_features = [col for col in feature_list if col not in df.columns]
            if missing_features:
                raise HTTPException(
                    status_code=400,
                    detail=f"特徴量 {missing_features} が見つかりません",
                )

        # 欠損値の確認
        if df[target_column].isnull().all():
            raise HTTPException(
                status_code=400, detail=f"目的変数 '{target_column}' がすべて欠損値です"
            )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行
        analyzer = TimeSeriesAnalyzer()
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
            date_column=date_column,
            feature_columns=feature_list,
            forecast_periods=forecast_periods,
            test_size=test_size,
        )

        print("=== 時系列分析API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== 時系列分析API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"時系列分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_timeseries_methods():
    """時系列分析で利用可能な手法一覧を取得"""
    methods = {
        "models": [
            {
                "id": "lightgbm",
                "name": "LightGBM",
                "description": "勾配ブースティング機械学習モデル",
                "available": LIGHTGBM_AVAILABLE,
                "recommended": True,
            },
            {
                "id": "linear_regression",
                "name": "線形回帰",
                "description": "代替手法（LightGBM利用不可時）",
                "available": True,
                "recommended": False,
            },
        ],
        "features": {
            "lag_features": "ラグ特徴量（1, 3, 7, 14期間前の値）",
            "moving_averages": "移動平均特徴量（3, 7, 14期間）",
            "time_features": "時間ベース特徴量（月、四半期、曜日など）",
            "custom_features": "ユーザー指定特徴量",
        },
        "evaluation_metrics": [
            {"name": "RMSE", "description": "二乗平均平方根誤差"},
            {"name": "MAE", "description": "平均絶対誤差"},
            {"name": "R²", "description": "決定係数"},
            {"name": "MAPE", "description": "平均絶対パーセント誤差"},
        ],
        "guidelines": {
            "minimum_samples": "最低30サンプル推奨",
            "test_size_range": "0.1-0.3（テストデータ割合）",
            "forecast_periods": "元データの10-30%程度推奨",
            "required_columns": {
                "target": "予測対象の数値列（必須）",
                "date": "日付列（推奨、自動インデックス化可能）",
                "features": "説明変数（任意、自動特徴量生成も可能）",
            },
        },
        "library_status": {
            "lightgbm": LIGHTGBM_AVAILABLE,
            "sklearn_alternative": True,
            "pandas": True,
            "numpy": True,
        },
    }

    return methods


@router.get("/parameters/validate")
async def validate_timeseries_parameters(
    target_column: str = Query(..., description="目的変数列名"),
    date_column: Optional[str] = Query(None, description="日付列名"),
    feature_columns: Optional[str] = Query(None, description="特徴量列名"),
    forecast_periods: int = Query(30, description="予測期間数"),
    test_size: float = Query(0.2, description="テストデータ割合"),
):
    """時系列分析パラメータの検証"""
    validation_result = {"valid": True, "warnings": [], "errors": []}

    # 目的変数の検証
    if not target_column or not target_column.strip():
        validation_result["errors"].append("目的変数列名は必須です")
        validation_result["valid"] = False

    # 予測期間の検証
    if forecast_periods < 1:
        validation_result["errors"].append("予測期間は1以上である必要があります")
        validation_result["valid"] = False
    elif forecast_periods > 365:
        validation_result["warnings"].append(
            "予測期間が365を超えています。精度が低下する可能性があります"
        )

    # テストサイズの検証
    if test_size <= 0 or test_size >= 1:
        validation_result["errors"].append(
            "テストサイズは0より大きく1より小さい値である必要があります"
        )
        validation_result["valid"] = False
    elif test_size < 0.1 or test_size > 0.4:
        validation_result["warnings"].append(
            "テストサイズは0.1-0.4の範囲が推奨されます"
        )

    # 特徴量列の検証
    if feature_columns:
        feature_list = [col.strip() for col in feature_columns.split(",")]
        if len(feature_list) > 50:
            validation_result["warnings"].append(
                "特徴量が多すぎます。モデルの複雑性が増加する可能性があります"
            )

    return validation_result


@router.get("/interpretation")
async def get_interpretation_guide():
    """時系列分析結果の解釈ガイドを取得"""
    return {
        "model_metrics": {
            "rmse": {
                "description": "二乗平均平方根誤差 - 予測誤差の大きさ",
                "interpretation": "値が小さいほど良好。目的変数の標準偏差と比較",
            },
            "mae": {
                "description": "平均絶対誤差 - 平均的な予測誤差",
                "interpretation": "実際の値の単位で解釈しやすい誤差指標",
            },
            "r2_score": {
                "description": "決定係数 - モデルの説明力",
                "ranges": {
                    "0.9以上": "非常に良好",
                    "0.7-0.9": "良好",
                    "0.5-0.7": "中程度",
                    "0.5未満": "要改善",
                },
            },
            "mape": {
                "description": "平均絶対パーセント誤差",
                "ranges": {
                    "5%未満": "非常に良好",
                    "5-10%": "良好",
                    "10-25%": "中程度",
                    "25%以上": "要改善",
                },
            },
        },
        "feature_importance": {
            "description": "各特徴量の予測への寄与度",
            "interpretation": {
                "lag_features": "過去の値の影響度",
                "moving_averages": "トレンドの影響度",
                "time_features": "季節性・周期性の影響度",
                "external_features": "外部要因の影響度",
            },
        },
        "residual_analysis": {
            "description": "残差（実測値 - 予測値）の分析",
            "good_signs": [
                "残差が0周辺にランダムに分布",
                "残差に明確なパターンがない",
                "残差の分散が一定",
            ],
            "warning_signs": [
                "残差に周期的なパターン",
                "残差の分散が時間で変化",
                "外れ値が多数存在",
            ],
        },
        "forecast_reliability": {
            "description": "予測の信頼性評価",
            "factors": [
                "モデルの性能指標（R²、RMSE等）",
                "予測期間の長さ（短期ほど信頼性高）",
                "データの安定性（トレンド・季節性）",
                "外部要因の変化可能性",
            ],
        },
    }


@router.get("/sessions/{session_id}")
async def get_timeseries_session_detail(
    session_id: int,
    db: Session = Depends(get_db),
):
    """時系列分析セッション詳細を取得"""
    try:
        print(f"📊 時系列分析セッション詳細取得開始: {session_id}")

        # TimeSeriesAnalyzerのインスタンスを作成
        analyzer = TimeSeriesAnalyzer()

        # セッション詳細を取得
        session_detail = analyzer.get_session_detail(db, session_id)

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
        print(f"❌ 時系列分析セッション詳細取得エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500,
            detail=f"セッション詳細の取得中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/details")
async def download_timeseries_details(session_id: int, db: Session = Depends(get_db)):
    """時系列分析結果詳細をCSV形式でダウンロード"""
    try:
        from models import (
            AnalysisSession,
            AnalysisMetadata,
            CoordinatesData,
        )

        print(f"Starting timeseries details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "timeseries":
            raise HTTPException(
                status_code=400, detail="時系列分析のセッションではありません"
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

        print(
            f"Found {len(metadata_entries)} metadata entries, {len(coordinates_data)} coordinates"
        )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # セッション情報
        writer.writerow(["セッション情報"])
        writer.writerow(["項目", "値"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(["分析手法", "時系列分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["サンプル数", session.row_count])
        writer.writerow(["変数数", session.column_count])
        writer.writerow([])

        # モデル性能指標
        model_metrics = {}
        feature_importance = []
        for meta in metadata_entries:
            if meta.metadata_type == "timeseries_metrics":
                content = meta.metadata_content
                model_metrics = content.get("metrics", {})
                feature_importance = content.get("feature_importance", [])
                break

        if model_metrics:
            writer.writerow(["モデル性能指標"])
            writer.writerow(["指標", "訓練データ", "テストデータ"])

            train_metrics = model_metrics.get("train", {})
            test_metrics = model_metrics.get("test", {})

            for metric in ["rmse", "mae", "r2", "mape"]:
                train_val = train_metrics.get(metric, 0)
                test_val = test_metrics.get(metric, 0)
                writer.writerow([metric.upper(), f"{train_val:.6f}", f"{test_val:.6f}"])
            writer.writerow([])

        # 特徴量重要度
        if feature_importance:
            writer.writerow(["特徴量重要度"])
            writer.writerow(["特徴量名", "重要度"])
            for feature_name, importance in feature_importance[:20]:  # 上位20個
                writer.writerow([feature_name, f"{importance:.6f}"])
            writer.writerow([])

        # 実測値データ
        actual_coords = [
            coord for coord in coordinates_data if coord.point_type == "train"
        ]
        if actual_coords:
            writer.writerow(["実測値（訓練データ）"])
            writer.writerow(["タイムスタンプ", "値"])
            for coord in sorted(actual_coords, key=lambda x: x.dimension_4 or 0):
                writer.writerow(
                    [
                        coord.point_name,
                        f"{coord.dimension_1:.6f}" if coord.dimension_1 else "0.000000",
                    ]
                )
            writer.writerow([])

        # 予測値と残差
        pred_coords = [
            coord for coord in coordinates_data if coord.point_type == "test"
        ]
        if pred_coords:
            writer.writerow(["予測結果（テストデータ）"])
            writer.writerow(["タイムスタンプ", "予測値", "実測値", "残差"])
            for coord in sorted(pred_coords, key=lambda x: x.dimension_4 or 0):
                writer.writerow(
                    [
                        coord.point_name,
                        f"{coord.dimension_1:.6f}" if coord.dimension_1 else "0.000000",
                        f"{coord.dimension_3:.6f}" if coord.dimension_3 else "0.000000",
                        f"{coord.dimension_2:.6f}" if coord.dimension_2 else "0.000000",
                    ]
                )
            writer.writerow([])

        # 未来予測値
        forecast_coords = [
            coord for coord in coordinates_data if coord.point_type == "variable"
        ]
        if forecast_coords:
            writer.writerow(["未来予測"])
            writer.writerow(["タイムスタンプ", "予測値"])
            for coord in sorted(forecast_coords, key=lambda x: x.dimension_4 or 0):
                writer.writerow(
                    [
                        coord.point_name,
                        f"{coord.dimension_1:.6f}" if coord.dimension_1 else "0.000000",
                    ]
                )
            writer.writerow([])

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"timeseries_details_{session_id}.csv"

        # Responseを作成
        return StreamingResponse(
            io.StringIO(csv_content),
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


@router.get("/download/{session_id}/predictions")
async def download_timeseries_predictions(
    session_id: int, db: Session = Depends(get_db)
):
    """予測結果をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "timeseries":
            raise HTTPException(
                status_code=400, detail="時系列分析のセッションではありません"
            )

        # 予測データを取得
        predictions = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "test",
            )
            .order_by(CoordinatesData.dimension_4)
            .all()
        )

        if not predictions:
            raise HTTPException(status_code=404, detail="予測データが見つかりません")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(["timestamp", "predicted_value", "actual_value", "residual"])

        # データ行
        for pred in predictions:
            writer.writerow(
                [
                    pred.point_name,
                    pred.dimension_1 if pred.dimension_1 is not None else 0.0,
                    pred.dimension_3 if pred.dimension_3 is not None else 0.0,
                    pred.dimension_2 if pred.dimension_2 is not None else 0.0,
                ]
            )

        output.seek(0)

        # レスポンス作成
        return StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=timeseries_predictions_{session_id}.csv"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"予測CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"予測CSV出力中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/forecast")
async def download_timeseries_forecast(session_id: int, db: Session = Depends(get_db)):
    """未来予測をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "timeseries":
            raise HTTPException(
                status_code=400, detail="時系列分析のセッションではありません"
            )

        # 未来予測データを取得
        forecasts = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "variable",
            )
            .order_by(CoordinatesData.dimension_4)
            .all()
        )

        if not forecasts:
            raise HTTPException(
                status_code=404, detail="未来予測データが見つかりません"
            )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(["timestamp", "predicted_value"])

        # データ行
        for forecast in forecasts:
            writer.writerow(
                [
                    forecast.point_name,
                    forecast.dimension_1 if forecast.dimension_1 is not None else 0.0,
                ]
            )

        output.seek(0)

        # レスポンス作成
        return StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=timeseries_forecast_{session_id}.csv"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"未来予測CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"未来予測CSV出力中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/feature_importance")
async def download_feature_importance(session_id: int, db: Session = Depends(get_db)):
    """特徴量重要度をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, AnalysisMetadata

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "timeseries":
            raise HTTPException(
                status_code=400, detail="時系列分析のセッションではありません"
            )

        # メタデータから特徴量重要度を取得
        metadata = (
            db.query(AnalysisMetadata)
            .filter(
                AnalysisMetadata.session_id == session_id,
                AnalysisMetadata.metadata_type == "timeseries_metrics",
            )
            .first()
        )

        if not metadata:
            raise HTTPException(status_code=404, detail="特徴量重要度が見つかりません")

        feature_importance = metadata.metadata_content.get("feature_importance", [])
        if not feature_importance:
            raise HTTPException(status_code=404, detail="特徴量重要度データが空です")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(["feature_name", "importance"])

        # データ行
        for feature_name, importance in feature_importance:
            writer.writerow([feature_name, importance])

        output.seek(0)

        # レスポンス作成
        return StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=feature_importance_{session_id}.csv"
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"特徴量重要度CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"特徴量重要度CSV出力中にエラーが発生しました: {str(e)}",
        )


# timeseries.py（FastAPIルーター）に追加


@router.get("/sessions")
async def get_timeseries_sessions(
    user_id: str = Query("default", description="ユーザーID"),
    limit: int = Query(50, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    search: Optional[str] = Query(None, description="検索クエリ"),
    db: Session = Depends(get_db),
):
    """時系列分析のセッション一覧を取得"""
    try:
        from models import AnalysisSession
        from sqlalchemy import or_, and_, text

        print(f"🔍 時系列分析セッション一覧取得開始")
        print(
            f"Parameters: user_id={user_id}, limit={limit}, offset={offset}, search={search}"
        )

        # ベースクエリ（時系列分析のみ）
        query = db.query(AnalysisSession).filter(
            and_(
                AnalysisSession.user_id == user_id,
                AnalysisSession.analysis_type == "timeseries",
            )
        )

        # 検索条件を追加
        if search:
            search_filter = or_(
                AnalysisSession.session_name.ilike(f"%{search}%"),
                AnalysisSession.original_filename.ilike(f"%{search}%"),
                AnalysisSession.description.ilike(f"%{search}%"),
            )
            query = query.filter(search_filter)

        # 結果取得
        sessions = (
            query.order_by(AnalysisSession.analysis_timestamp.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        print(f"📊 取得されたセッション数: {len(sessions)}")

        # レスポンス形式に変換
        sessions_data = []
        for session in sessions:
            # タグ情報を取得（ARRAY型のtagsカラムを優先使用）
            tags = []
            try:
                # analysis_sessionsテーブルのtagsカラム（ARRAY型）を使用
                if hasattr(session, "tags") and session.tags:
                    tags = list(session.tags)  # PostgreSQL ARRAYをPythonリストに変換

                # もしARRAY型が空なら、session_tagsテーブルからも確認
                if not tags:
                    tag_result = db.execute(
                        text(
                            "SELECT tag FROM session_tags WHERE session_id = :session_id"
                        ),
                        {"session_id": session.id},
                    ).fetchall()
                    tags = [row[0] for row in tag_result if row[0]]

            except Exception as tag_error:
                print(
                    f"⚠️ セッション{session.id}のタグ取得エラー（スキップ）: {tag_error}"
                )
                tags = []

            session_data = {
                "session_id": session.id,
                "session_name": session.session_name,
                "description": getattr(session, "description", "") or "",
                "filename": session.original_filename,
                "analysis_type": session.analysis_type,
                "analysis_timestamp": (
                    session.analysis_timestamp.isoformat()
                    if hasattr(session, "analysis_timestamp")
                    and session.analysis_timestamp
                    else None
                ),
                "user_id": session.user_id,
                "row_count": getattr(session, "row_count", 0) or 0,
                "column_count": getattr(session, "column_count", 0) or 0,
                "tags": tags,
                # 時系列分析特有のフィールド
                "dimension_1_contribution": float(
                    getattr(session, "dimension_1_contribution", 0) or 0
                ),
                "dimensions_count": getattr(session, "dimensions_count", 1) or 1,
            }
            sessions_data.append(session_data)

        response_data = {
            "success": True,
            "data": sessions_data,
            "total": len(sessions_data),
            "offset": offset,
            "limit": limit,
        }

        print(f"✅ 時系列分析セッション一覧取得完了: {len(sessions_data)}件")
        return response_data

    except Exception as e:
        print(f"❌ 時系列分析セッション取得エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        return {"success": False, "error": str(e), "data": []}
