from typing import Dict, Any, Optional, List, Tuple
import pandas as pd
import numpy as np
import matplotlib

matplotlib.use("Agg")  # GUI無効化

import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import seaborn as sns
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sqlalchemy.orm import Session
from .base import BaseAnalyzer
import warnings
from datetime import datetime

warnings.filterwarnings("ignore")

# LightGBMの条件付きインポート
try:
    import lightgbm as lgb

    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False
    print("Warning: LightGBM not available, using alternative methods")


class TimeSeriesAnalyzer(BaseAnalyzer):
    """時系列分析クラス（LightGBMベース）"""

    def get_analysis_type(self) -> str:
        return "timeseries"

    def save_to_database(
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
        try:
            print("=== 時系列分析データベース保存開始 ===")

            # まず基本セッションを保存
            session_id = self._save_session_directly(
                db,
                session_name,
                description,
                tags,
                user_id,
                file,
                csv_text,
                df,
                results,
                plot_base64,
            )

            print(f"基本セッション保存完了: session_id = {session_id}")

            if session_id and session_id > 0:
                # 時系列分析特有のデータを追加保存
                self._save_timeseries_specific_data(db, session_id, results)

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

            ## 特徴量重要度のデバッグ出力
            feature_importance = results.get("feature_importance", [])
            print(f"🔍 保存する特徴量重要度数: {len(feature_importance)}")
            if feature_importance:
                print(f"🔍 上位5個の特徴量重要度:")
                for feat, imp in feature_importance[:5]:
                    print(f"  {feat}: {imp}")

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
        """基底クラスのメソッドがない場合の直接保存（DB互換性対応版）"""
        try:
            from models import AnalysisSession, VisualizationData

            # 🆕 既存のデータベーススキーマに合わせてインポート
            from sqlalchemy import text

            print(f"📊 セッション直接保存開始")

            # セッション基本情報を保存（analysis_typeを明示的に指定）
            session = AnalysisSession(
                session_name=session_name,
                description=description,
                analysis_type="timeseries",  # 🆕 明示的に指定
                original_filename=file.filename,
                user_id=user_id,
                row_count=df.shape[0],
                column_count=df.shape[1],
                tags=tags,
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

            # タグを保存（既存のカラム名'tag'を使用）
            if tags and session_id:
                try:
                    for tag in tags:
                        if tag.strip():
                            db.execute(
                                text(
                                    "INSERT INTO session_tags (session_id, tag, created_at) VALUES (:session_id, :tag, :created_at)"
                                ),
                                {
                                    "session_id": session_id,
                                    "tag": tag.strip(),
                                    "created_at": datetime.utcnow(),
                                },
                            )
                    print(f"✅ session_tagsテーブルにもタグ保存完了: {len(tags)}件")
                except Exception as tag_error:
                    print(
                        f"⚠️ session_tagsテーブルへのタグ保存エラー（スキップ）: {tag_error}"
                    )
                    # タグ保存に失敗してもセッションは保存する

            # プロット画像を保存
            if plot_base64:
                try:
                    visualization = VisualizationData(
                        session_id=session_id,
                        image_base64=plot_base64,
                        image_size=len(plot_base64),
                        width=1400,
                        height=1100,
                    )
                    db.add(visualization)
                    db.flush()
                    print("✅ 可視化データ保存完了")
                except Exception as viz_error:
                    print(f"⚠️ 可視化データ保存エラー（スキップ）: {viz_error}")

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

            # 時系列分析の計算
            results = self._compute_timeseries_analysis(
                df_processed, target_column, forecast_periods, test_size, **kwargs
            )

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
        """時系列分析用のデータ前処理（修正版）"""
        df_clean = df.copy()

        # 日付列の処理
        if date_column and date_column in df_clean.columns:
            try:
                df_clean[date_column] = pd.to_datetime(df_clean[date_column])
                df_clean = df_clean.sort_values(date_column)
                df_clean.set_index(date_column, inplace=True)
                print(f"✅ 日付列 '{date_column}' をインデックスに設定")
            except Exception as e:
                print(f"⚠️ 日付列の処理でエラー: {e}")
                print("インデックスをそのまま使用します")
        else:
            print("日付列が指定されていません。インデックスを時系列として使用します。")

        # 目的変数の存在確認
        if target_column not in df_clean.columns:
            raise ValueError(f"目的変数 '{target_column}' が見つかりません")

        # 数値データのみを抽出
        numeric_columns = df_clean.select_dtypes(include=[np.number]).columns.tolist()

        if target_column not in numeric_columns:
            raise ValueError(f"目的変数 '{target_column}' は数値型である必要があります")

        # 🆕 特徴量の選択（数値列のみ）
        if feature_columns:
            available_features = [
                col
                for col in feature_columns
                if col in numeric_columns and col != target_column
            ]
            print(f"🔍 指定された特徴量のうち利用可能: {available_features}")

            # 利用できない特徴量があった場合の警告
            unavailable_features = [
                col
                for col in feature_columns
                if col not in numeric_columns or col not in df_clean.columns
            ]
            if unavailable_features:
                print(f"⚠️ 利用できない特徴量: {unavailable_features}")
        else:
            available_features = [
                col for col in numeric_columns if col != target_column
            ]
            print(f"🔍 自動選択された特徴量: {available_features}")

        # 欠損値の処理
        df_clean = df_clean.dropna(subset=[target_column])
        if df_clean.empty:
            raise ValueError("目的変数の欠損値を除去した結果、データが空になりました")

        print(f"前処理完了: {df.shape} -> {df_clean.shape}")
        print(f"使用する特徴量: {available_features}")

        # 🆕 利用可能な特徴量リストを保存（後で使用するため）
        df_clean._available_features = available_features

        return df_clean

    def _compute_timeseries_analysis(
        self,
        df: pd.DataFrame,
        target_column: str,
        forecast_periods: int,
        test_size: float,
        **kwargs,
    ) -> Dict[str, Any]:
        """時系列分析の計算（修正版）"""
        try:
            # 🆕 前処理で保存された特徴量リストを取得
            feature_columns = getattr(df, "_available_features", [])

            # 時系列特徴量の作成
            df_features = self._create_time_features(df, target_column, feature_columns)

            # 🆕 LightGBM用のデータ型確認
            print(f"🔍 LightGBM投入前のデータ型確認:")
            problematic_columns = []
            for col in df_features.columns:
                dtype = df_features[col].dtype
                print(f"  {col}: {dtype}")

                # LightGBMが受け付けないデータ型をチェック
                if dtype == "object" or dtype.name.startswith("datetime"):
                    if col != target_column:  # 目的変数以外
                        problematic_columns.append(col)

            # 問題のある列を削除
            if problematic_columns:
                print(f"🗑️ LightGBM非対応列を削除: {problematic_columns}")
                df_features = df_features.drop(columns=problematic_columns)

            # データ分割
            split_index = int(len(df_features) * (1 - test_size))
            train_data = df_features.iloc[:split_index]
            test_data = df_features.iloc[split_index:]

            print(f"📊 データ分割: train={len(train_data)}, test={len(test_data)}")
            print(f"📊 最終特徴量: {list(df_features.columns)}")

            # モデル学習
            if LIGHTGBM_AVAILABLE:
                results = self._train_lightgbm_model(
                    train_data, test_data, target_column
                )
            else:
                results = self._train_alternative_model(
                    train_data, test_data, target_column
                )

            # 未来予測
            future_predictions = self._generate_future_predictions(
                df_features, results["model"], target_column, forecast_periods
            )

            # 結果の統合
            results.update(
                {
                    "forecast_periods": forecast_periods,
                    "test_size": test_size,
                    "data_info": {
                        "total_samples": len(df_features),
                        "train_samples": len(train_data),
                        "test_samples": len(test_data),
                        "feature_count": len(df_features.columns) - 1,  # 目的変数を除く
                        "target_column": target_column,
                        "feature_columns": [
                            col for col in df_features.columns if col != target_column
                        ],
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

            return results

        except Exception as e:
            print(f"時系列分析計算エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def _create_time_features(
        self, df: pd.DataFrame, target_column: str, feature_columns: List[str]
    ) -> pd.DataFrame:
        """時系列特徴量を作成（データ型修正版）"""
        df_features = df.copy()

        # ラグ特徴量
        for lag in [1, 2, 3, 5, 7, 14, 21, 30]:
            if len(df) > lag:
                df_features[f"{target_column}_lag_{lag}"] = df_features[
                    target_column
                ].shift(lag)

        # 移動平均特徴量
        for window in [3, 5, 7, 14, 21, 30]:
            if len(df) > window:
                df_features[f"{target_column}_ma_{window}"] = (
                    df_features[target_column].rolling(window=window).mean()
                )
        # 差分特徴量
        for diff in [1, 7, 30]:
            if len(df) > diff:
                df_features[f"{target_column}_diff_{diff}"] = df_features[
                    target_column
                ].diff(diff)

        # 時間ベースの特徴量（日付インデックスがある場合）
        if hasattr(df.index, "month"):
            df_features["month"] = df.index.month
            df_features["quarter"] = df.index.quarter
            df_features["day_of_week"] = df.index.dayofweek
            df_features["day_of_year"] = df.index.dayofyear
            df_features["week_of_year"] = df.index.isocalendar().week
            df_features["is_weekend"] = (df.index.dayofweek >= 5).astype(int)
            df_features["is_month_start"] = df.index.is_month_start.astype(int)
            df_features["is_month_end"] = df.index.is_month_end.astype(int)

        # 🆕 既存の数値特徴量を追加（日付列は除外）
        for col in feature_columns:
            if col in df.columns:
                if df[col].dtype in ["int64", "float64", "int32", "float32"]:
                    df_features[col] = df[col]
                    # 特徴量のラグも作成
                    for lag in [1, 3, 7]:
                        if len(df) > lag:
                            df_features[f"{col}_lag_{lag}"] = df_features[col].shift(
                                lag
                            )

        # 🆕 元の日付列を削除（もし含まれている場合）
        date_columns_to_remove = []
        for col in df_features.columns:
            if df_features[col].dtype == "object" or df_features[
                col
            ].dtype.name.startswith("datetime"):
                if col != target_column:  # 目的変数は保持
                    date_columns_to_remove.append(col)

        if date_columns_to_remove:
            print(f"🗑️ 日付/文字列列を削除: {date_columns_to_remove}")
            df_features = df_features.drop(columns=date_columns_to_remove)

        # 🆕 データ型の最終確認と変換
        for col in df_features.columns:
            if col != target_column:  # 目的変数は除く
                if df_features[col].dtype == "object":
                    try:
                        # 文字列を数値に変換を試行
                        df_features[col] = pd.to_numeric(
                            df_features[col], errors="coerce"
                        )
                        print(f"✅ 列 {col} を数値に変換")
                    except:
                        # 変換できない場合は削除
                        print(f"⚠️ 列 {col} を削除（数値変換不可）")
                        df_features = df_features.drop(columns=[col])

        # 欠損値を除去
        df_features = df_features.dropna()

        print(f"🔍 最終的な特徴量データ型:")
        for col in df_features.columns:
            print(f"  {col}: {df_features[col].dtype}")

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
            "seed": 42,  # 再現性のため追加
            "min_child_samples": 20,  # 過学習防止
        }

        # モデル学習
        model = lgb.train(
            params,
            train_dataset,
            valid_sets=[valid_dataset],
            num_boost_round=1000,
            callbacks=[lgb.early_stopping(100), lgb.log_evaluation(0)],
        )

        # 予測
        y_pred_train = model.predict(X_train)
        y_pred_test = model.predict(X_test)

        # 評価指標の計算
        train_metrics = self._calculate_metrics(y_train, y_pred_train)
        test_metrics = self._calculate_metrics(y_test, y_pred_test)

        # 特徴量重要度（複数の方法で取得）
        importance_gain = model.feature_importance(importance_type="gain")
        importance_split = model.feature_importance(importance_type="split")

        # ゼロでない重要度を確保
        feature_importance = []
        for i, col in enumerate(X_train.columns):
            # gainがゼロの場合はsplitを使用
            importance = (
                importance_gain[i] if importance_gain[i] > 0 else importance_split[i]
            )
            feature_importance.append((col, float(importance)))
            feature_importance.sort(key=lambda x: x[1], reverse=True)

        return {
            "model": model,
            "model_type": "lightgbm",
            "model_metrics": {
                "train": train_metrics,
                "test": test_metrics,
                "r2_score": test_metrics["r2"],
                "rmse": test_metrics["rmse"],
                "mae": test_metrics["mae"],
            },
            "feature_importance": feature_importance,
            "predictions": [
                (str(idx), pred, actual)
                for idx, pred, actual in zip(test_data.index, y_pred_test, y_test)
            ],
            "actual_values": [
                (str(idx), val) for idx, val in zip(train_data.index, y_train)
            ],
        }

    def _train_alternative_model(
        self, train_data: pd.DataFrame, test_data: pd.DataFrame, target_column: str
    ) -> Dict[str, Any]:
        """LightGBMが利用できない場合の代替モデル（線形回帰）"""
        from sklearn.linear_model import LinearRegression
        from sklearn.preprocessing import StandardScaler

        # 特徴量とターゲットの分離
        X_train = train_data.drop(columns=[target_column])
        y_train = train_data[target_column]
        X_test = test_data.drop(columns=[target_column])
        y_test = test_data[target_column]

        # 特徴量を標準化（係数の比較のため）
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        # モデル学習
        model = LinearRegression()
        model.fit(X_train, y_train)

        # 予測
        y_pred_train = model.predict(X_train)
        y_pred_test = model.predict(X_test)

        # 評価指標の計算
        train_metrics = self._calculate_metrics(y_train, y_pred_train)
        test_metrics = self._calculate_metrics(y_test, y_pred_test)

        # 特徴量重要度（標準化された係数の絶対値）
        feature_importance = []
        for i, col in enumerate(X_train.columns):
            importance = abs(model.coef_[i])
            feature_importance.append((col, float(importance)))

        feature_importance.sort(key=lambda x: x[1], reverse=True)

        # デバッグ出力
        print(f"🔍 線形回帰の特徴量重要度（上位5個）:")
        for feat, imp in feature_importance[:5]:
            print(f"  {feat}: {imp:.4f}")

        return {
            "model": model,
            "model_type": "linear_regression",
            "model_metrics": {
                "train": train_metrics,
                "test": test_metrics,
                "r2_score": test_metrics["r2"],
                "rmse": test_metrics["rmse"],
                "mae": test_metrics["mae"],
            },
            "feature_importance": feature_importance,
            "predictions": [
                (str(idx), pred, actual)
                for idx, pred, actual in zip(test_data.index, y_pred_test, y_test)
            ],
            "actual_values": [
                (str(idx), val) for idx, val in zip(train_data.index, y_train)
            ],
        }

    def _calculate_metrics(
        self, y_true: np.ndarray, y_pred: np.ndarray
    ) -> Dict[str, float]:
        """評価指標を計算"""
        return {
            "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
            "mae": float(mean_absolute_error(y_true, y_pred)),
            "r2": float(r2_score(y_true, y_pred)),
            "mape": (
                float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100)
                if np.all(y_true != 0)
                else 0.0
            ),
        }

    def _generate_future_predictions(
        self, df: pd.DataFrame, model, target_column: str, forecast_periods: int
    ) -> List[Tuple[str, float]]:
        """未来予測を生成"""
        future_predictions = []

        try:
            # 最新のデータを使用して予測
            last_data = df.iloc[-1:].drop(columns=[target_column])

            # 日付インデックスの処理
            if hasattr(df.index, "freq") and df.index.freq is not None:
                freq = df.index.freq
            else:
                freq = pd.infer_freq(df.index) or "D"

            last_date = df.index[-1]

            for i in range(1, forecast_periods + 1):
                # 未来の日付を生成
                if hasattr(last_date, "strftime"):
                    future_date = last_date + pd.Timedelta(days=i)
                else:
                    future_date = len(df) + i

                # 特徴量を更新（簡単な例）
                if LIGHTGBM_AVAILABLE and hasattr(model, "predict"):
                    pred_value = model.predict(last_data)[0]
                else:
                    pred_value = model.predict(last_data)[0]

                future_predictions.append((str(future_date), float(pred_value)))

                # 次の予測のためにデータを更新（ラグ特徴量など）
                # 簡略化のため、同じ特徴量を使用

        except Exception as e:
            print(f"未来予測生成エラー: {e}")
            # エラーの場合は空のリストを返す

        return future_predictions

    def _infer_frequency(self, index) -> str:
        """時系列の頻度を推定"""
        try:
            if hasattr(index, "freq") and index.freq:
                return str(index.freq)
            return pd.infer_freq(index) or "Unknown"
        except:
            return "Unknown"

    def _analyze_trend(self, series: pd.Series) -> str:
        """トレンドを分析"""
        try:
            # 線形回帰でトレンドを判定
            x = np.arange(len(series))
            slope = np.polyfit(x, series.values, 1)[0]

            if slope > 0.01:
                return "上昇トレンド"
            elif slope < -0.01:
                return "下降トレンド"
            else:
                return "横ばい"
        except:
            return "不明"

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """時系列分析の可視化を作成"""
        try:
            print("=== プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            # データ準備
            model_metrics = results["model_metrics"]
            feature_importance = results["feature_importance"]
            predictions = results["predictions"]
            actual_values = results["actual_values"]
            future_predictions = results.get("future_predictions", [])

            # 図のサイズと配置
            fig = plt.figure(figsize=(16, 12))
            fig.patch.set_facecolor("white")

            # 1. 時系列プロット（実測値・予測値・未来予測）
            ax1 = plt.subplot(2, 3, 1)

            # 実測値
            if actual_values:
                dates_actual = [
                    pd.to_datetime(x[0]) if isinstance(x[0], str) else x[0]
                    for x in actual_values
                ]
                values_actual = [x[1] for x in actual_values]
                plt.plot(dates_actual, values_actual, "b-", label="実測値", linewidth=2)

            # 予測値
            if predictions:
                dates_pred = [
                    pd.to_datetime(x[0]) if isinstance(x[0], str) else x[0]
                    for x in predictions
                ]
                values_pred = [x[1] for x in predictions]
                plt.plot(dates_pred, values_pred, "r--", label="予測値", linewidth=2)

            # 未来予測
            if future_predictions:
                dates_future = [
                    pd.to_datetime(x[0]) if isinstance(x[0], str) else x[0]
                    for x in future_predictions
                ]
                values_future = [x[1] for x in future_predictions]
                plt.plot(
                    dates_future, values_future, "g:", label="未来予測", linewidth=2
                )

            plt.xlabel("時間")
            plt.ylabel("値")
            plt.title("時系列予測結果")
            plt.legend()
            plt.grid(True, alpha=0.3)
            plt.xticks(rotation=45)

            # 2. 予測精度のプロット
            ax2 = plt.subplot(2, 3, 2)
            if predictions:
                actual_test = [x[2] for x in predictions]
                pred_test = [x[1] for x in predictions]
                plt.scatter(actual_test, pred_test, alpha=0.6)

                # 対角線
                min_val = min(min(actual_test), min(pred_test))
                max_val = max(max(actual_test), max(pred_test))
                plt.plot([min_val, max_val], [min_val, max_val], "r--", alpha=0.8)

                plt.xlabel("実測値")
                plt.ylabel("予測値")
                plt.title(f'予測精度\nR² = {model_metrics["r2_score"]:.3f}')
                plt.grid(True, alpha=0.3)

            # 3. 残差プロット
            ax3 = plt.subplot(2, 3, 3)
            if predictions:
                residuals = [x[2] - x[1] for x in predictions]
                pred_values = [x[1] for x in predictions]
                plt.scatter(pred_values, residuals, alpha=0.6)
                plt.axhline(y=0, color="r", linestyle="--", alpha=0.8)
                plt.xlabel("予測値")
                plt.ylabel("残差")
                plt.title("残差プロット")
                plt.grid(True, alpha=0.3)

            # 4. 特徴量重要度
            ax4 = plt.subplot(2, 3, 4)
            if feature_importance:
                top_features = feature_importance[:10]  # 上位10個
                feature_names = [x[0] for x in top_features]
                importance_values = [x[1] for x in top_features]

                y_pos = np.arange(len(feature_names))
                plt.barh(y_pos, importance_values, alpha=0.7)
                plt.yticks(y_pos, feature_names)
                plt.xlabel("重要度")
                plt.title("特徴量重要度")
                plt.gca().invert_yaxis()

            # 5. 評価指標
            ax5 = plt.subplot(2, 3, 5)
            metrics_names = ["RMSE", "MAE", "R²", "MAPE"]
            test_metrics = model_metrics["test"]
            metrics_values = [
                test_metrics["rmse"],
                test_metrics["mae"],
                test_metrics["r2"],
                test_metrics.get("mape", 0),
            ]

            bars = plt.bar(
                metrics_names,
                metrics_values,
                alpha=0.7,
                color=["skyblue", "lightgreen", "orange", "pink"],
            )
            plt.ylabel("値")
            plt.title("モデル評価指標")
            plt.xticks(rotation=45)

            # 値をバーの上に表示
            for bar, value in zip(bars, metrics_values):
                plt.text(
                    bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + 0.01,
                    f"{value:.3f}",
                    ha="center",
                    va="bottom",
                )

            # 6. データ情報とサマリー
            ax6 = plt.subplot(2, 3, 6)
            plt.axis("off")

            data_info = results.get("data_info", {})
            timeseries_info = results.get("timeseries_info", {})

            info_text = f"""
データ情報:
• 総サンプル数: {data_info.get('total_samples', 0)}
• 訓練データ: {data_info.get('train_samples', 0)}
• テストデータ: {data_info.get('test_samples', 0)}
• 特徴量数: {data_info.get('feature_count', 0)}

時系列情報:
• 開始日: {timeseries_info.get('start_date', 'N/A')}
• 終了日: {timeseries_info.get('end_date', 'N/A')}
• 頻度: {timeseries_info.get('frequency', 'N/A')}
• トレンド: {timeseries_info.get('trend', 'N/A')}

モデル性能:
• R²スコア: {model_metrics['r2_score']:.3f}
• RMSE: {model_metrics['rmse']:.3f}
• MAE: {model_metrics['mae']:.3f}
• モデル: {results.get('model_type', 'N/A')}
            """

            plt.text(
                0.1,
                0.9,
                info_text,
                fontsize=10,
                verticalalignment="top",
                bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.5),
            )

            # 全体のタイトル
            model_type = results.get("model_type", "unknown")
            target_col = data_info.get("target_column", "unknown")

            fig.suptitle(
                f"時系列分析結果 - {model_type.upper()}\n"
                f"目的変数: {target_col}, "
                f"R² = {model_metrics['r2_score']:.3f}, "
                f"予測期間: {results.get('forecast_periods', 0)}期間",
                fontsize=14,
                y=0.98,
            )

            plt.tight_layout()
            plt.subplots_adjust(top=0.92)

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

    def create_response(
        self,
        results: Dict[str, Any],
        df: pd.DataFrame,
        session_id: int,
        session_name: str,
        file,
        plot_base64: str,
    ) -> Dict[str, Any]:
        """レスポンスデータを作成"""
        try:
            predictions = results["predictions"]
            actual_values = results["actual_values"]
            future_predictions = results.get("future_predictions", [])

            # 予測データを新形式で作成
            prediction_data = []
            for i, (timestamp, pred_value, actual_value) in enumerate(predictions):
                prediction_data.append(
                    {
                        "timestamp": str(timestamp),
                        "predicted_value": float(pred_value),
                        "actual_value": float(actual_value),
                        "residual": float(actual_value - pred_value),
                        "order_index": i,
                    }
                )

            # 実測データを新形式で作成
            actual_data = []
            for i, (timestamp, value) in enumerate(actual_values):
                actual_data.append(
                    {
                        "timestamp": str(timestamp),
                        "value": float(value),
                        "order_index": i,
                    }
                )

            # 未来予測データを新形式で作成
            forecast_data = []
            for i, (timestamp, pred_value) in enumerate(future_predictions):
                forecast_data.append(
                    {
                        "timestamp": str(timestamp),
                        "predicted_value": float(pred_value),
                        "order_index": len(predictions) + i,
                    }
                )

            return {
                "success": True,
                "session_id": session_id,
                "analysis_type": self.get_analysis_type(),
                "data": {
                    "model_type": results["model_type"],
                    "target_column": results["data_info"]["target_column"],
                    "feature_columns": results["data_info"]["feature_columns"],
                    "forecast_periods": results["forecast_periods"],
                    # モデル性能
                    "model_metrics": results["model_metrics"],
                    "feature_importance": results["feature_importance"],
                    # 予測結果
                    "predictions": prediction_data,
                    "actual_values": actual_data,
                    "future_predictions": forecast_data,
                    # 時系列情報
                    "timeseries_info": results["timeseries_info"],
                    "data_info": results["data_info"],
                    # プロット画像
                    "plot_image": plot_base64,
                    # 従来互換性のための座標形式
                    "coordinates": {
                        "actual": [
                            {
                                "timestamp": str(timestamp),
                                "value": float(value),
                            }
                            for timestamp, value in actual_values
                        ],
                        "predictions": [
                            {
                                "timestamp": str(timestamp),
                                "predicted": float(pred_value),
                                "actual": float(actual_value),
                                "residual": float(actual_value - pred_value),
                            }
                            for timestamp, pred_value, actual_value in predictions
                        ],
                        "forecast": [
                            {
                                "timestamp": str(timestamp),
                                "predicted": float(pred_value),
                            }
                            for timestamp, pred_value in future_predictions
                        ],
                    },
                },
                "metadata": {
                    "session_name": session_name,
                    "filename": file.filename,
                    "rows": df.shape[0],
                    "columns": df.shape[1],
                    "target_column": results["data_info"]["target_column"],
                    "feature_columns": results["data_info"]["feature_columns"],
                },
            }

        except Exception as e:
            print(f"❌ レスポンス作成エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def get_session_detail(self, db: Session, session_id: int) -> Dict[str, Any]:
        """時系列分析セッション詳細を取得"""
        try:
            print(f"📊 時系列分析セッション詳細取得開始: {session_id}")

            # 基底クラスのメソッドが存在するかチェック
            if hasattr(super(), "get_session_detail"):
                try:
                    base_detail = super().get_session_detail(db, session_id)
                except Exception as e:
                    print(f"⚠️ 基底クラスのget_session_detailエラー: {e}")
                    base_detail = self._get_session_detail_directly(db, session_id)
            else:
                print("⚠️ 基底クラスにget_session_detailメソッドがありません")
                base_detail = self._get_session_detail_directly(db, session_id)

            if not base_detail or not base_detail.get("success"):
                return base_detail

            # 時系列特有のデータを取得
            timeseries_data = self._get_timeseries_data(db, session_id)

            # レスポンス構造を構築
            response_data = {
                "success": True,
                "data": {
                    "session_info": base_detail["data"]["session_info"],
                    "metadata": {
                        "filename": base_detail["data"]["metadata"]["filename"],
                        "rows": base_detail["data"]["metadata"]["rows"],
                        "columns": base_detail["data"]["metadata"]["columns"],
                        "target_column": timeseries_data.get("target_column", ""),
                        "feature_columns": timeseries_data.get("feature_columns", []),
                    },
                    "analysis_data": {
                        "predictions": timeseries_data.get("predictions", []),
                        "actual_values": timeseries_data.get("actual_values", []),
                        "future_predictions": timeseries_data.get(
                            "future_predictions", []
                        ),
                        "model_metrics": timeseries_data.get("model_metrics", {}),
                        "feature_importance": timeseries_data.get(
                            "feature_importance", []
                        ),
                    },
                    "visualization": base_detail["data"].get("visualization", {}),
                },
            }

            print(f"✅ 時系列分析セッション詳細取得完了")
            return response_data

        except Exception as e:
            print(f"❌ 時系列分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    def _get_timeseries_data(self, db: Session, session_id: int) -> Dict[str, Any]:
        """時系列分析特有のデータを取得"""
        try:
            from models import CoordinatesData, AnalysisMetadata

            # 座標データを取得
            coordinates = (
                db.query(CoordinatesData)
                .filter(CoordinatesData.session_id == session_id)
                .all()
            )

            # 実測値データ
            actual_values = []
            predictions = []
            future_predictions = []

            for coord in coordinates:
                coord_data = {
                    "timestamp": coord.point_name,
                    "order_index": int(coord.dimension_4) if coord.dimension_4 else 0,
                }

                if coord.point_type == "train":  # 実測値（訓練データ）
                    coord_data["value"] = (
                        float(coord.dimension_1) if coord.dimension_1 else 0.0
                    )
                    actual_values.append(coord_data)

                elif coord.point_type == "test":  # 予測値（テストデータ）
                    coord_data.update(
                        {
                            "predicted_value": (
                                float(coord.dimension_1) if coord.dimension_1 else 0.0
                            ),
                            "actual_value": (
                                float(coord.dimension_3) if coord.dimension_3 else 0.0
                            ),
                            "residual": (
                                float(coord.dimension_2) if coord.dimension_2 else 0.0
                            ),
                        }
                    )
                    predictions.append(coord_data)

                elif coord.point_type == "variable":  # 未来予測
                    coord_data["predicted_value"] = (
                        float(coord.dimension_1) if coord.dimension_1 else 0.0
                    )
                    future_predictions.append(coord_data)

            # メタデータを取得
            metadata_entries = (
                db.query(AnalysisMetadata)
                .filter(AnalysisMetadata.session_id == session_id)
                .all()
            )

            model_metrics = {}
            feature_importance = []
            target_column = ""
            feature_columns = []

            for meta in metadata_entries:
                if meta.metadata_type == "timeseries_metrics":
                    content = meta.metadata_content
                    model_metrics = content.get("metrics", {})
                    feature_importance = content.get("feature_importance", [])
                    print(f"🔍 保存する特徴量重要度: {feature_importance}")
                    target_column = content.get("forecast_parameters", {}).get(
                        "target_column", ""
                    )
                    feature_columns = content.get("data_info", {}).get(
                        "feature_columns", []
                    )

            print(f"🔍 時系列データ取得結果:")
            print(f"  - 実測値: {len(actual_values)}件")
            print(f"  - 予測値: {len(predictions)}件")
            print(f"  - 未来予測: {len(future_predictions)}件")

            return {
                "actual_values": actual_values,
                "predictions": predictions,
                "future_predictions": future_predictions,
                "model_metrics": model_metrics,
                "feature_importance": feature_importance,
                "target_column": target_column,
                "feature_columns": feature_columns,
            }

        except Exception as e:
            print(f"❌ 時系列データ取得エラー: {str(e)}")
            return {
                "actual_values": [],
                "predictions": [],
                "future_predictions": [],
                "model_metrics": {},
                "feature_importance": [],
                "target_column": "",
                "feature_columns": [],
            }

    def _get_session_detail_directly(self, db: Session, session_id: int):
        """時系列分析セッション詳細を直接取得"""
        try:
            from models import AnalysisSession, VisualizationData

            print(f"📊 時系列分析セッション詳細取得開始: {session_id}")

            # セッション基本情報を取得
            session = (
                db.query(AnalysisSession)
                .filter(AnalysisSession.id == session_id)
                .first()
            )

            if not session:
                return {
                    "success": False,
                    "error": f"セッション {session_id} が見つかりません",
                }

            print(f"✅ セッション基本情報取得: {session.session_name}")

            # 可視化データを取得
            visualization = (
                db.query(VisualizationData)
                .filter(VisualizationData.session_id == session_id)
                .first()
            )

            # レスポンス構造を構築
            response_data = {
                "success": True,
                "data": {
                    "session_info": {
                        "session_id": session.id,
                        "session_name": session.session_name,
                        "description": getattr(session, "description", "") or "",
                        "filename": session.original_filename,
                        "row_count": getattr(session, "row_count", 0) or 0,
                        "column_count": getattr(session, "column_count", 0) or 0,
                        "analysis_timestamp": (
                            session.analysis_timestamp.isoformat()
                            if hasattr(session, "analysis_timestamp")
                            and session.analysis_timestamp
                            else None
                        ),
                    },
                    "metadata": {
                        "filename": session.original_filename,
                        "rows": getattr(session, "row_count", 0) or 0,
                        "columns": getattr(session, "column_count", 0) or 0,
                    },
                    "visualization": {
                        "plot_image": (
                            visualization.image_base64 if visualization else None
                        ),
                        "width": visualization.width if visualization else 1400,
                        "height": visualization.height if visualization else 1100,
                    },
                },
            }

            print(f"✅ 時系列分析セッション詳細取得完了")
            return response_data

        except Exception as e:
            print(f"❌ 時系列分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}
