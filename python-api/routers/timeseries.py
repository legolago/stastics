from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from models import (
    get_db,
    AnalysisSession,
    CoordinatesData,
    AnalysisMetadata,
    OriginalData,
)
import pandas as pd
import numpy as np
import io
import csv

# LightGBMの条件付きインポート
try:
    import lightgbm as lgb

    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False

from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

router = APIRouter()


class SimpleTimeSeriesAnalyzer:
    """簡略化された時系列分析クラス"""

    def _create_features(self, df, target_column, date_column, feature_columns=None):
        """時系列特徴量を作成"""
        print("=== 特徴量作成開始 ===")

        df_features = df.copy()

        # 日付列を datetime に変換
        if date_column in df_features.columns:
            df_features[date_column] = pd.to_datetime(df_features[date_column])
            df_features = df_features.sort_values(date_column)
            df_features = df_features.reset_index(drop=True)

        # 元の特徴量を追加
        feature_cols = []
        if feature_columns:
            for col in feature_columns:
                if col in df_features.columns and col != target_column:
                    feature_cols.append(col)
                    print(f"元の特徴量を追加: {col}")

        # ラグ特徴量を作成
        for lag in [1, 3, 7]:
            if len(df_features) > lag:
                lag_col = f"{target_column}_lag_{lag}"
                df_features[lag_col] = df_features[target_column].shift(lag)
                feature_cols.append(lag_col)
                print(f"ラグ特徴量作成: {lag_col}")

        # 移動平均特徴量を作成
        for window in [3, 7]:
            if len(df_features) >= window:
                ma_col = f"{target_column}_ma_{window}"
                df_features[ma_col] = (
                    df_features[target_column]
                    .rolling(window=window, min_periods=1)
                    .mean()
                )
                feature_cols.append(ma_col)
                print(f"移動平均特徴量作成: {ma_col}")

        # 日付特徴量を作成（分散が0でない場合のみ）
        if date_column in df_features.columns:
            month_vals = df_features[date_column].dt.month
            quarter_vals = df_features[date_column].dt.quarter
            dow_vals = df_features[date_column].dt.dayofweek

            # 分散チェック
            if month_vals.var() > 0:
                df_features["month"] = month_vals
                feature_cols.append("month")
                print(f"日付特徴量追加: month (分散={month_vals.var():.4f})")
            else:
                print("月特徴量をスキップ: 分散が0")

            if quarter_vals.var() > 0:
                df_features["quarter"] = quarter_vals
                feature_cols.append("quarter")
                print(f"日付特徴量追加: quarter (分散={quarter_vals.var():.4f})")
            else:
                print("四半期特徴量をスキップ: 分散が0")

            if dow_vals.var() > 0:
                df_features["day_of_week"] = dow_vals
                feature_cols.append("day_of_week")
                print(f"日付特徴量追加: day_of_week (分散={dow_vals.var():.4f})")
            else:
                print("曜日特徴量をスキップ: 分散が0")

        # 日付列とターゲット列を特徴量から除外
        feature_cols = [
            col for col in feature_cols if col != date_column and col != target_column
        ]

        # 存在しない列を除外
        feature_cols = [col for col in feature_cols if col in df_features.columns]

        print(f"最終的な特徴量: {feature_cols}")

        # NaN値を削除
        initial_rows = len(df_features)
        df_features = df_features.dropna()
        final_rows = len(df_features)
        print(f"NaN削除後: {initial_rows} -> {final_rows} 行")

        # 数値型に変換
        for col in feature_cols:
            if col in df_features.columns:
                df_features[col] = pd.to_numeric(df_features[col], errors="coerce")

        df_features = df_features.dropna()

        # 特徴量の分散をチェック（分散が極小の特徴量を除外）
        print("=== 特徴量の分散チェック ===")
        filtered_features = []
        for col in feature_cols:
            if col in df_features.columns:
                variance = df_features[col].var()
                mean_val = df_features[col].mean()

                # 分散が極小（1e-8未満）の特徴量を除外
                if variance > 1e-8:
                    filtered_features.append(col)
                    print(f"{col}: mean={mean_val:.4f}, var={variance:.4f} ✓")
                else:
                    print(
                        f"{col}: mean={mean_val:.4f}, var={variance:.4f} ✗ (分散が小さすぎるため除外)"
                    )

        feature_cols = filtered_features
        print(f"分散フィルタ後の特徴量: {feature_cols}")
        print(f"特徴量作成完了: {len(feature_cols)}個の特徴量, {len(df_features)}行")
        return df_features, feature_cols


@router.post("/timeseries/features")
async def extract_features_only(
    file: UploadFile = File(...),
    target_column: str = Form(...),
    date_column: str = Form(...),
    feature_columns: str = Form(None),
):
    """特徴量のみを抽出して返す（モデル訓練なし）"""
    try:
        print("=== 特徴量抽出API開始 ===")

        # CSVファイルを読み込み
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode("utf-8")))

        # 元の特徴量列を解析
        original_features = []
        if feature_columns:
            original_features = [col.strip() for col in feature_columns.split(",")]

        # 時系列分析器を初期化
        analyzer = SimpleTimeSeriesAnalyzer()

        # 特徴量を作成
        df_features, feature_cols = analyzer._create_features(
            df, target_column, date_column, original_features
        )

        # 統計情報を計算（NumPy型変換付き）
        feature_stats = {}
        for col in feature_cols:
            if col in df_features.columns:
                values = df_features[col]
                feature_stats[col] = {
                    "mean": float(values.mean()),
                    "std": float(values.std()),
                    "min": float(values.min()),
                    "max": float(values.max()),
                    "variance": float(values.var()),
                    "non_zero_count": int((values != 0).sum()),
                    "total_count": int(len(values)),
                    "non_zero_ratio": float((values != 0).sum() / len(values)),
                }

        response = {
            "success": True,
            "data": {
                "original_shape": [int(x) for x in df.shape],
                "processed_shape": [int(x) for x in df_features.shape],
                "target_column": target_column,
                "date_column": date_column,
                "feature_columns": feature_cols,
                "feature_statistics": feature_stats,
                "data_info": {
                    "total_samples": int(len(df_features)),
                    "feature_count": int(len(feature_cols)),
                    "original_columns": list(df.columns),
                    "processed_columns": list(df_features.columns),
                    "rows_removed": int(len(df) - len(df_features)),
                },
                "sample_data": df_features[feature_cols + [target_column]]
                .head()
                .to_dict("records"),
            },
        }

        print("=== 特徴量抽出API完了 ===")
        return response

    except Exception as e:
        print(f"特徴量抽出エラー: {e}")
        import traceback

        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.post("/timeseries/analyze")
async def analyze_timeseries(
    file: UploadFile = File(...),
    session_name: str = Form(...),
    user_id: str = Form(None),
    target_column: str = Form(...),
    date_column: str = Form(...),
    feature_columns: str = Form(None),
    forecast_periods: int = Form(5),
    test_size: float = Form(0.2),
):
    """時系列分析を実行"""
    try:
        print("=== 時系列分析API開始 ===")

        # CSVファイルを読み込み
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode("utf-8")))

        # 特徴量列を解析
        feature_list = []
        if feature_columns:
            feature_list = [col.strip() for col in feature_columns.split(",")]

        # 分析器を初期化
        analyzer = SimpleTimeSeriesAnalyzer()

        # 特徴量作成
        df_features, feature_cols = analyzer._create_features(
            df, target_column, date_column, feature_list
        )

        # データサイズチェック
        if len(df_features) < 10:
            return {
                "success": False,
                "error": f"データが不足しています: {len(df_features)}行（最低10行必要）",
            }

        # 特徴量とターゲットを分離
        X_features = df_features[feature_cols].copy()
        y_target = df_features[target_column].copy()

        print(f"=== 特徴量データ確認 ===")
        for col in feature_cols:
            values = X_features[col]
            print(
                f"{col}: mean={values.mean():.4f}, std={values.std():.4f}, var={values.var():.4f}"
            )

        # データ分割
        split_idx = int(len(X_features) * (1 - test_size))
        X_train = X_features.iloc[:split_idx]
        X_test = X_features.iloc[split_idx:]
        y_train = y_target.iloc[:split_idx]
        y_test = y_target.iloc[split_idx:]

        print(f"データ分割: 訓練={len(X_train)}行, テスト={len(X_test)}行")

        # モデル訓練
        if LIGHTGBM_AVAILABLE and len(X_train) > 5:
            print("=== LightGBMモデル訓練開始 ===")

            # 過学習対策を強化したパラメータ
            model = lgb.LGBMRegressor(
                objective="regression",
                metric="rmse",
                verbose=-1,
                random_state=42,
                n_estimators=50,  # 減少
                max_depth=3,  # 減少
                learning_rate=0.05,  # 減少
                num_leaves=7,  # 大幅減少
                min_child_samples=10,  # 増加
                feature_fraction=0.6,  # 減少
                bagging_fraction=0.7,  # 減少
                bagging_freq=1,
                reg_alpha=0.1,  # L1正則化追加
                reg_lambda=0.1,  # L2正則化追加
                min_split_gain=0.01,  # 分割時の最小ゲイン
                subsample_for_bin=200000,
                class_weight=None,
                min_child_weight=0.001,
                subsample_freq=0,
                colsample_bytree=1.0,
                reg_sqrt=False,
                boost_from_average=True,
            )

            model.fit(X_train, y_train)
            train_pred = model.predict(X_train)
            test_pred = model.predict(X_test)

            # 特徴量重要度（gain, split, coverageで確認）
            importance_gain = model.feature_importances_

            print(f"=== 特徴量重要度詳細 ===")
            feature_importance = []
            for i, col in enumerate(feature_cols):
                importance = float(importance_gain[i])
                feature_importance.append((col, importance))
                print(f"{col}: {importance:.6f}")

            feature_importance.sort(key=lambda x: x[1], reverse=True)
            model_type = "lightgbm"

        else:
            print("=== 線形回帰モデル訓練開始 ===")
            model = LinearRegression()
            model.fit(X_train, y_train)
            train_pred = model.predict(X_train)
            test_pred = model.predict(X_test)

            # 特徴量重要度（係数の絶対値）
            coeffs = np.abs(model.coef_)

            print(f"=== 特徴量重要度詳細 ===")
            feature_importance = []
            for i, col in enumerate(feature_cols):
                importance = float(coeffs[i])
                feature_importance.append((col, importance))
                print(f"{col}: {importance:.6f}")

            feature_importance.sort(key=lambda x: x[1], reverse=True)
            model_type = "linear_regression"

        # 評価指標計算
        def calculate_metrics(y_true, y_pred):
            y_true = np.array(y_true)
            y_pred = np.array(y_pred)

            rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
            mae = float(mean_absolute_error(y_true, y_pred))
            r2 = float(r2_score(y_true, y_pred))

            # MAPE計算（ゼロ除算対策）
            mask = y_true != 0
            if mask.sum() > 0:
                mape = float(
                    np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100
                )
            else:
                mape = 0.0

            return {
                "rmse": rmse,
                "mae": mae,
                "r2": r2,
                "mape": mape,
            }

        train_metrics = calculate_metrics(y_train, train_pred)
        test_metrics = calculate_metrics(y_test, test_pred)

        print(f"=== モデル性能 ===")
        print(
            f"訓練 - RMSE: {train_metrics['rmse']:.4f}, R²: {train_metrics['r2']:.4f}"
        )
        print(
            f"テスト - RMSE: {test_metrics['rmse']:.4f}, R²: {test_metrics['r2']:.4f}"
        )

        # 過学習チェック
        if train_metrics["r2"] > 0.8 and test_metrics["r2"] < 0.3:
            print("⚠️ 過学習の可能性があります")

        # 予測データを構築
        predictions = []
        for i, (idx, pred, actual) in enumerate(zip(X_test.index, test_pred, y_test)):
            predictions.append(
                {
                    "timestamp": str(idx),
                    "predicted_value": float(pred),
                    "actual_value": float(actual),
                    "residual": float(actual - pred),
                    "order_index": int(i),
                }
            )

        # 実測値データを構築
        actual_values = []
        for i, (idx, value) in enumerate(y_train.items()):
            actual_values.append(
                {
                    "timestamp": str(idx),
                    "value": float(value),
                    "order_index": int(i),
                }
            )

        # レスポンス作成
        response = {
            "success": True,
            "session_id": None,  # データベース保存は後で実装
            "analysis_type": "timeseries",
            "data": {
                "model_type": model_type,
                "target_column": target_column,
                "feature_columns": feature_cols,
                "forecast_periods": int(forecast_periods),
                "model_metrics": {
                    "train": train_metrics,
                    "test": test_metrics,
                    "r2_score": test_metrics["r2"],
                    "rmse": test_metrics["rmse"],
                    "mae": test_metrics["mae"],
                    "overfitting_risk": (
                        "high"
                        if (train_metrics["r2"] > 0.8 and test_metrics["r2"] < 0.3)
                        else "low"
                    ),
                },
                "feature_importance": feature_importance,
                "predictions": predictions,
                "actual_values": actual_values,
                "future_predictions": [],
                "data_info": {
                    "total_samples": int(len(X_features)),
                    "train_samples": int(len(X_train)),
                    "test_samples": int(len(X_test)),
                    "feature_count": int(len(feature_cols)),
                    "target_column": target_column,
                    "feature_columns": feature_cols,
                },
            },
            "metadata": {
                "session_name": session_name,
                "filename": file.filename,
                "rows": int(df.shape[0]),
                "columns": int(df.shape[1]),
                "target_column": target_column,
                "feature_columns": feature_cols,
            },
        }

        print("=== 時系列分析API処理完了 ===")
        return response

    except Exception as e:
        print(f"時系列分析エラー: {e}")
        import traceback

        traceback.print_exc()
        return {"success": False, "error": str(e)}


@router.get("/timeseries/sessions")
async def get_timeseries_sessions(
    analysis_type: str = "timeseries",
    user_id: str = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """時系列分析のセッション一覧を取得"""
    try:
        query = db.query(AnalysisSession).filter(
            AnalysisSession.analysis_type == analysis_type
        )

        if user_id:
            query = query.filter(AnalysisSession.user_id == user_id)

        sessions = (
            query.order_by(AnalysisSession.analysis_timestamp.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        session_list = []
        for session in sessions:
            session_data = {
                "id": int(session.id),
                "session_name": session.session_name,
                "analysis_type": session.analysis_type,
                "original_filename": session.original_filename,
                "row_count": int(session.row_count) if session.row_count else 0,
                "column_count": (
                    int(session.column_count) if session.column_count else 0
                ),
                "analysis_timestamp": (
                    session.analysis_timestamp.isoformat()
                    if session.analysis_timestamp
                    else None
                ),
                "user_id": session.user_id,
            }

            if session.analysis_parameters:
                session_data["parameters"] = session.analysis_parameters

            session_list.append(session_data)

        return {
            "success": True,
            "sessions": session_list,
            "total": int(len(session_list)),
        }

    except Exception as e:
        print(f"セッション一覧取得エラー: {e}")
        return {"success": False, "error": str(e)}
