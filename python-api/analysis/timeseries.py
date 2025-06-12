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
from sklearn.preprocessing import StandardScaler

# LightGBMの条件付きインポート
try:
    import lightgbm as lgb

    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False

<<<<<<< HEAD
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

router = APIRouter()
=======
                # 座標データを保存
                self._save_coordinates_data(db, session_id, df, results)
            else:
                print(f"❌ セッション保存に失敗: session_id = {session_id}")

            return session_id

        except Exception as e:
            print(f"❌ 時系列分析データベース保存エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return 0

    def _save_timeseries_specific_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """時系列分析特有のデータを保存"""
        try:
            from models import AnalysisMetadata

            print(f"=== 時系列分析特有データ保存開始 ===")
            print(f"Session ID: {session_id}")

            # session_idが有効かチェック
            if not session_id or session_id == 0:
                print(f"❌ 無効なsession_id: {session_id}")
                return

            # モデル性能メタデータ
            if "model_metrics" in results:
                metrics_metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="timeseries_metrics",
                    metadata_content={
                        "metrics": results["model_metrics"],
                        "feature_importance": results.get("feature_importance", []),
                        "forecast_parameters": results.get("forecast_parameters", {}),
                        "model_type": results.get("model_type", "lightgbm"),
                        "data_info": results.get("data_info", {}),
                    },
                )
                db.add(metrics_metadata)

            # 時系列データ詳細
            if "timeseries_info" in results:
                ts_info_metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="timeseries_info",
                    metadata_content=results["timeseries_info"],
                )
                db.add(ts_info_metadata)

            # コミット前にflushでエラーチェック
            db.flush()
            db.commit()
            print(f"✅ 時系列分析特有データ保存完了")

        except Exception as e:
            print(f"時系列分析特有データ保存エラー: {e}")
            try:
                db.rollback()
                print("データベースをロールバックしました")
            except Exception as rollback_error:
                print(f"ロールバックエラー: {rollback_error}")

    def _save_session_directly(
        self,
        db: Session,
        session_name: str,
        description: Optional[str],
        tags: List[str],
        user_id: str,
        file,
        csv_text: str,
        df: pd.DataFrame,
        results: Dict[str, Any],
        plot_base64: str,
    ) -> int:
        """基底クラスのメソッドがない場合の直接保存"""
        try:
            from models import AnalysisSession, VisualizationData, SessionTag

            print(f"📊 セッション直接保存開始")

            # セッション基本情報を保存
            session = AnalysisSession(
                session_name=session_name,
                description=description,
                analysis_type=self.get_analysis_type(),
                original_filename=file.filename,
                user_id=user_id,
                row_count=df.shape[0],
                column_count=df.shape[1],
                # 時系列分析特有のメタデータ
                dimensions_count=1,  # 予測値
                dimension_1_contribution=(
                    results.get("model_metrics", {}).get("r2_score", 0)
                    if results.get("model_metrics")
                    else 0
                ),
            )

            db.add(session)
            db.flush()  # IDを取得するためflush
            session_id = session.id
            print(f"✅ セッション保存完了: session_id = {session_id}")

            # タグを保存
            if tags:
                for tag in tags:
                    if tag.strip():
                        session_tag = SessionTag(
                            session_id=session_id, tag_name=tag.strip()
                        )
                        db.add(session_tag)

            # プロット画像を保存（一時的にスキップ）
            if plot_base64:
                try:
                    # デフォルト値で保存を試行
                    visualization = VisualizationData(
                        session_id=session_id,
                        image_base64=plot_base64,
                        image_size=len(plot_base64),
                        width=1400,
                        height=1100,
                    )
                    db.add(visualization)
                    db.flush()  # 可視化データの保存を試行
                    print("✅ 可視化データ保存完了")
                except Exception as viz_error:
                    print(f"⚠️ 可視化データ保存エラー（スキップ）: {viz_error}")
                    # 可視化データの保存に失敗してもセッションは保存する
                    # エラーログに詳細を出力
                    import traceback

                    print(f"可視化エラーの詳細:\n{traceback.format_exc()}")
            else:
                print("プロット画像なし")

            db.commit()
            print(f"✅ 全体のコミット完了: session_id = {session_id}")
            return session_id

        except Exception as e:
            print(f"❌ 直接保存エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            try:
                db.rollback()
                print("データベースをロールバックしました")
            except Exception as rollback_error:
                print(f"ロールバックエラー: {rollback_error}")
            return 0

    def _save_coordinates_data(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """時系列分析の座標データを保存（実測値・予測値・残差）"""
        try:
            from models import CoordinatesData

            print(f"=== 時系列分析座標データ保存開始 ===")
            print(f"Session ID: {session_id}")

            # session_idが有効かチェック
            if not session_id or session_id == 0:
                print(f"❌ 無効なsession_id: {session_id}")
                return

            # 実測値を保存（訓練データとして）
            actual_values = results.get("actual_values", [])
            if actual_values:
                print(f"実測値データ保存: {len(actual_values)}件")
                for i, (timestamp, value) in enumerate(actual_values):
                    coord_data = CoordinatesData(
                        session_id=session_id,
                        point_name=str(timestamp),
                        point_type="train",  # 訓練データとして保存
                        dimension_1=float(value),
                        dimension_2=0.0,  # 実測値なので予測誤差は0
                        dimension_4=float(i),  # 時系列の順序
                    )
                    db.add(coord_data)

            # 予測値を保存（テストデータとして）
            predictions = results.get("predictions", [])
            if predictions:
                print(f"予測値データ保存: {len(predictions)}件")
                for i, (timestamp, pred_value, actual_value) in enumerate(predictions):
                    residual = (
                        actual_value - pred_value if actual_value is not None else 0.0
                    )
                    coord_data = CoordinatesData(
                        session_id=session_id,
                        point_name=str(timestamp),
                        point_type="test",  # テストデータとして保存
                        dimension_1=float(pred_value),
                        dimension_2=float(residual),
                        dimension_3=(
                            float(actual_value) if actual_value is not None else None
                        ),
                        dimension_4=float(i),  # 時系列の順序
                    )
                    db.add(coord_data)

            # 未来予測値を保存（変数として）
            future_predictions = results.get("future_predictions", [])
            if future_predictions:
                print(f"未来予測値データ保存: {len(future_predictions)}件")
                for i, (timestamp, pred_value) in enumerate(future_predictions):
                    coord_data = CoordinatesData(
                        session_id=session_id,
                        point_name=str(timestamp),
                        point_type="variable",  # 変数として保存
                        dimension_1=float(pred_value),
                        dimension_2=0.0,  # 未来なので残差は不明
                        dimension_4=float(len(predictions) + i),  # 時系列の順序
                    )
                    db.add(coord_data)

            # コミット前にflushでエラーチェック
            db.flush()
            db.commit()
            print(f"✅ 時系列分析座標データ保存完了")

        except Exception as e:
            print(f"❌ 時系列分析座標データ保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            try:
                db.rollback()
                print("データベースをロールバックしました")
            except Exception as rollback_error:
                print(f"ロールバックエラー: {rollback_error}")

    def analyze(
        self,
        df: pd.DataFrame,
        target_column: str,
        date_column: Optional[str] = None,
        feature_columns: Optional[List[str]] = None,
        forecast_periods: int = 30,
        test_size: float = 0.2,
        **kwargs,
    ) -> Dict[str, Any]:
        """時系列分析を実行"""
        try:
            print(f"=== 時系列分析開始 ===")
            print(f"入力データ:\n{df}")
            print(f"データ形状: {df.shape}")
            print(f"目的変数: {target_column}, 日付列: {date_column}")
            print(f"予測期間: {forecast_periods}, テストサイズ: {test_size}")

            # データの検証と前処理
            df_processed = self._preprocess_timeseries_data(
                df, target_column, date_column, feature_columns
            )
            print(f"前処理後データ:\n{df_processed}")
>>>>>>> parent of 4e9bd04... 20250612_1355


<<<<<<< HEAD
class SimpleTimeSeriesAnalyzer:
    """簡略化された時系列分析クラス"""
=======
            print(f"分析結果: {list(results.keys())}")
            return results

        except Exception as e:
            print(f"時系列分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    def _preprocess_timeseries_data(
        self,
        df: pd.DataFrame,
        target_column: str,
        date_column: Optional[str],
        feature_columns: Optional[List[str]],
    ) -> pd.DataFrame:
        """時系列分析用のデータ前処理"""
        df_clean = df.copy()

        # 日付列の処理
        if date_column and date_column in df_clean.columns:
            df_clean[date_column] = pd.to_datetime(df_clean[date_column])
            df_clean = df_clean.sort_values(date_column)
            df_clean.set_index(date_column, inplace=True)
        else:
            # 日付列が指定されていない場合、インデックスを使用
            print("日付列が指定されていません。インデックスを時系列として使用します。")
>>>>>>> parent of 4e9bd04... 20250612_1355

    def _create_features(self, df, target_column, date_column, feature_columns=None):
        """時系列特徴量を作成"""
        print("=== 特徴量作成開始 ===")

        df_features = df.copy()

        # 日付列を datetime に変換
        if date_column in df_features.columns:
            df_features[date_column] = pd.to_datetime(df_features[date_column])
            df_features = df_features.sort_values(date_column)
            df_features = df_features.reset_index(drop=True)

<<<<<<< HEAD
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
=======
        # 特徴量の選択
        if feature_columns:
            available_features = [
                col
                for col in feature_columns
                if col in numeric_columns and col != target_column
            ]
        else:
            available_features = [
                col for col in numeric_columns if col != target_column
            ]

        # 欠損値の処理
        df_clean = df_clean.dropna(subset=[target_column])
        if df_clean.empty:
            raise ValueError("目的変数の欠損値を除去した結果、データが空になりました")

        print(f"前処理完了: {df.shape} -> {df_clean.shape}")
        print(f"使用する特徴量: {available_features}")
        return df_clean

    def _compute_timeseries_analysis(
        self,
        df: pd.DataFrame,
        target_column: str,
        forecast_periods: int,
        test_size: float,
        **kwargs,
    ) -> Dict[str, Any]:
        """時系列分析の計算"""
        try:
            # 特徴量とターゲットの分離
            numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
            feature_columns = [col for col in numeric_columns if col != target_column]

            # 時系列特徴量の作成
            df_features = self._create_time_features(df, target_column, feature_columns)

            # データ分割
            split_index = int(len(df_features) * (1 - test_size))
            train_data = df_features.iloc[:split_index]
            test_data = df_features.iloc[split_index:]

            # モデル学習
            if LIGHTGBM_AVAILABLE:
                results = self._train_lightgbm_model(
                    train_data, test_data, target_column
>>>>>>> parent of 4e9bd04... 20250612_1355
                )
                feature_cols.append(ma_col)
                print(f"移動平均特徴量作成: {ma_col}")

        # 差分特徴量を追加（トレンドキャプチャのため）
        if len(df_features) > 1:
            diff_col = f"{target_column}_diff_1"
            df_features[diff_col] = df_features[target_column].diff()
            feature_cols.append(diff_col)
            print(f"差分特徴量作成: {diff_col}")

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

<<<<<<< HEAD
            if dow_vals.var() > 0:
                df_features["day_of_week"] = dow_vals
                feature_cols.append("day_of_week")
                print(f"日付特徴量追加: day_of_week (分散={dow_vals.var():.4f})")
            else:
                print("曜日特徴量をスキップ: 分散が0")
=======
            # 結果の統合
            results.update(
                {
                    "forecast_periods": forecast_periods,
                    "test_size": test_size,
                    "data_info": {
                        "total_samples": len(df_features),
                        "train_samples": len(train_data),
                        "test_samples": len(test_data),
                        "feature_count": len(feature_columns),
                        "target_column": target_column,
                        "feature_columns": feature_columns,
                    },
                    "future_predictions": future_predictions,
                    "timeseries_info": {
                        "start_date": (
                            str(df.index[0])
                            if hasattr(df.index[0], "strftime")
                            else str(df.index[0])
                        ),
                        "end_date": (
                            str(df.index[-1])
                            if hasattr(df.index[-1], "strftime")
                            else str(df.index[-1])
                        ),
                        "frequency": self._infer_frequency(df.index),
                        "trend": self._analyze_trend(df[target_column]),
                    },
                }
            )
>>>>>>> parent of 4e9bd04... 20250612_1355

        # 日付列とターゲット列を特徴量から除外
        feature_cols = [
            col for col in feature_cols if col != date_column and col != target_column
        ]

        # 存在しない列を除外
        feature_cols = [col for col in feature_cols if col in df_features.columns]

        print(f"最終的な特徴量: {feature_cols}")

<<<<<<< HEAD
        # NaN値を削除
        initial_rows = len(df_features)
        df_features = df_features.dropna()
        final_rows = len(df_features)
        print(f"NaN削除後: {initial_rows} -> {final_rows} 行")
=======
    def _create_time_features(
        self, df: pd.DataFrame, target_column: str, feature_columns: List[str]
    ) -> pd.DataFrame:
        """時系列特徴量を作成"""
        df_features = df.copy()
>>>>>>> parent of 4e9bd04... 20250612_1355

        # 数値型に変換
        for col in feature_cols:
            if col in df_features.columns:
                df_features[col] = pd.to_numeric(df_features[col], errors="coerce")

<<<<<<< HEAD
        df_features = df_features.dropna()

        # 特徴量の分散をチェック（より緩い閾値に変更）
        print("=== 特徴量の分散チェック ===")
        filtered_features = []
        for col in feature_cols:
            if col in df_features.columns:
                variance = df_features[col].var()
                mean_val = df_features[col].mean()

                # 分散の閾値を緩和（1e-12未満のみ除外）
                if variance > 1e-12:
                    filtered_features.append(col)
                    print(f"{col}: mean={mean_val:.4f}, var={variance:.8f} ✓")
                else:
                    print(
                        f"{col}: mean={mean_val:.4f}, var={variance:.8f} ✗ (分散が小さすぎるため除外)"
                    )
=======
        # 時間ベースの特徴量（日付インデックスがある場合）
        if hasattr(df.index, "month"):
            df_features["month"] = df.index.month
            df_features["quarter"] = df.index.quarter
            df_features["day_of_week"] = df.index.dayofweek
            df_features["day_of_year"] = df.index.dayofyear

        # 既存の特徴量を追加
        for col in feature_columns:
            if col in df.columns:
                df_features[col] = df[col]

        # 欠損値を除去
        df_features = df_features.dropna()

        return df_features

    def _train_lightgbm_model(
        self, train_data: pd.DataFrame, test_data: pd.DataFrame, target_column: str
    ) -> Dict[str, Any]:
        """LightGBMモデルの学習"""
        # 特徴量とターゲットの分離
        X_train = train_data.drop(columns=[target_column])
        y_train = train_data[target_column]
        X_test = test_data.drop(columns=[target_column])
        y_test = test_data[target_column]

        # LightGBMデータセットの作成
        train_dataset = lgb.Dataset(X_train, label=y_train)
        valid_dataset = lgb.Dataset(X_test, label=y_test, reference=train_dataset)

        # パラメータ設定
        params = {
            "objective": "regression",
            "metric": "rmse",
            "boosting_type": "gbdt",
            "num_leaves": 31,
            "learning_rate": 0.05,
            "feature_fraction": 0.9,
            "bagging_fraction": 0.8,
            "bagging_freq": 5,
            "verbose": -1,
        }

        # モデル学習
        model = lgb.train(
            params,
            train_dataset,
            valid_sets=[valid_dataset],
            num_boost_round=1000,
            callbacks=[lgb.early_stopping(100), lgb.log_evaluation(0)],
        )
>>>>>>> parent of 4e9bd04... 20250612_1355

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
                f"{col}: mean={values.mean():.4f}, std={values.std():.4f}, var={values.var():.8f}"
            )

        # データ分割
        split_idx = int(len(X_features) * (1 - test_size))
        X_train = X_features.iloc[:split_idx]
        X_test = X_features.iloc[split_idx:]
        y_train = y_target.iloc[:split_idx]
        y_test = y_target.iloc[split_idx:]

        print(f"データ分割: 訓練={len(X_train)}行, テスト={len(X_test)}行")

        # 特徴量の正規化（StandardScaler使用）
        scaler = StandardScaler()
        X_train_scaled = pd.DataFrame(
            scaler.fit_transform(X_train), columns=X_train.columns, index=X_train.index
        )
        X_test_scaled = pd.DataFrame(
            scaler.transform(X_test), columns=X_test.columns, index=X_test.index
        )

        print("=== 正規化後の特徴量確認 ===")
        for col in feature_cols:
            values = X_train_scaled[col]
            print(f"{col}: mean={values.mean():.4f}, std={values.std():.4f}")

        # モデル訓練（正規化されたデータを使用）
        if LIGHTGBM_AVAILABLE and len(X_train) > 5:
            print("=== LightGBMモデル訓練開始 ===")

            # データサイズに応じたパラメータ調整（より積極的な設定）
            data_size = len(X_train)

            if data_size < 20:
                # 小さなデータセット用
                params = {
                    "objective": "regression",
                    "metric": "rmse",
                    "verbose": -1,
                    "random_state": 42,
                    "n_estimators": 100,  # 増加
                    "max_depth": 6,  # 増加
                    "learning_rate": 0.1,
                    "num_leaves": 31,  # 増加
                    "min_child_samples": 1,  # 減少
                    "feature_fraction": 1.0,  # すべての特徴量を使用
                    "bagging_fraction": 1.0,  # すべてのサンプルを使用
                    "bagging_freq": 0,  # バギング無効
                    "reg_alpha": 0.0,  # 正則化を無効
                    "reg_lambda": 0.0,  # 正則化を無効
                    "min_split_gain": 0.0,  # 分割制限を緩和
                    "force_col_wise": True,  # カラム単位で処理
                }
            elif data_size < 100:
                # 中サイズデータセット用
                params = {
                    "objective": "regression",
                    "metric": "rmse",
                    "verbose": -1,
                    "random_state": 42,
                    "n_estimators": 150,
                    "max_depth": 8,
                    "learning_rate": 0.1,
                    "num_leaves": 63,
                    "min_child_samples": 2,
                    "feature_fraction": 0.9,
                    "bagging_fraction": 0.9,
                    "bagging_freq": 1,
                    "reg_alpha": 0.01,
                    "reg_lambda": 0.01,
                    "force_col_wise": True,
                }
            else:
                # 大きなデータセット用
                params = {
                    "objective": "regression",
                    "metric": "rmse",
                    "verbose": -1,
                    "random_state": 42,
                    "n_estimators": 200,
                    "max_depth": 10,
                    "learning_rate": 0.1,
                    "num_leaves": 127,
                    "min_child_samples": 5,
                    "feature_fraction": 0.8,
                    "bagging_fraction": 0.8,
                    "bagging_freq": 1,
                    "reg_alpha": 0.05,
                    "reg_lambda": 0.05,
                    "force_col_wise": True,
                }

            print(f"データサイズ: {data_size}, パラメータセット適用")

            model = lgb.LGBMRegressor(**params)
            model.fit(X_train_scaled, y_train)
            train_pred = model.predict(X_train_scaled)
            test_pred = model.predict(X_test_scaled)

            # 特徴量重要度（複数の種類を取得）
            importance_gain = model.feature_importances_

            print(f"=== 特徴量重要度詳細 ===")
            feature_importance = []
            for i, col in enumerate(feature_cols):
                importance = float(importance_gain[i])
                feature_importance.append((col, importance))
                print(f"{col}: {importance:.6f}")

            # 重要度が0の場合の対処
            total_importance = sum(imp[1] for imp in feature_importance)
            if total_importance == 0:
                print("⚠️ すべての特徴量重要度が0です。線形回帰にフォールバック")
                # 線形回帰を使用
                model = LinearRegression()
                model.fit(X_train_scaled, y_train)
                train_pred = model.predict(X_train_scaled)
                test_pred = model.predict(X_test_scaled)

                # 係数の絶対値を重要度として使用
                coeffs = np.abs(model.coef_)
                feature_importance = []
                for i, col in enumerate(feature_cols):
                    importance = float(coeffs[i])
                    feature_importance.append((col, importance))
                    print(f"{col} (係数): {importance:.6f}")

                model_type = "linear_regression"
            else:
                feature_importance.sort(key=lambda x: x[1], reverse=True)
                model_type = "lightgbm"

        else:
            print("=== 線形回帰モデル訓練開始 ===")
            model = LinearRegression()
            model.fit(X_train_scaled, y_train)
            train_pred = model.predict(X_train_scaled)
            test_pred = model.predict(X_test_scaled)

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
        overfitting_risk = "low"
        if train_metrics["r2"] > 0.9 and test_metrics["r2"] < 0.5:
            overfitting_risk = "high"
        elif train_metrics["r2"] > 0.8 and test_metrics["r2"] < 0.3:
            overfitting_risk = "medium"

        if overfitting_risk != "low":
            print(f"⚠️ 過学習リスク: {overfitting_risk}")

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
                    "overfitting_risk": overfitting_risk,
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
                    "normalization_applied": True,
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
