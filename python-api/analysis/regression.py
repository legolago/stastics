from typing import Dict, Any, List, Tuple, Optional
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    mean_squared_error,
    mean_absolute_error,
    r2_score,
)
import scipy.stats as stats
import seaborn as sns
from .base import BaseAnalyzer
from sqlalchemy.orm import Session


class RegressionAnalyzer(BaseAnalyzer):
    """回帰分析を実行するクラス"""

    def get_analysis_type(self) -> str:
        return "regression"

    def analyze(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """回帰分析を実行"""
        method = kwargs.get("method", "linear")
        target_variable = kwargs.get("target_variable")
        explanatory_variables = kwargs.get("explanatory_variables", [])
        polynomial_degree = kwargs.get("polynomial_degree", 2)
        test_size = kwargs.get("test_size", 0.2)
        random_state = kwargs.get("random_state", 42)
        include_intercept = kwargs.get("include_intercept", True)
        standardize = kwargs.get("standardize", False)

        return self.perform_analysis(
            df,
            method,
            target_variable,
            explanatory_variables,
            polynomial_degree,
            test_size,
            random_state,
            include_intercept,
            standardize,
        )

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """回帰分析プロットを作成"""
        return self.create_regression_plot(df, results)

    def run_full_analysis(
        self,
        df,
        db,
        session_name,
        description,
        tags,
        user_id,
        file,
        csv_text,
        method,
        target_variable,
        explanatory_variables,
        polynomial_degree,
        test_size,
        random_state,
        include_intercept,
        standardize,
    ):
        """完全な回帰分析を実行（因子分析を参考に修正）"""
        try:
            print("=== 回帰分析実行開始 ===")

            # 分析実行
            results = self.perform_analysis(
                df,
                method,
                target_variable,
                explanatory_variables,
                polynomial_degree,
                test_size,
                random_state,
                include_intercept,
                standardize,
            )

            # プロット作成
            plot_base64 = self.create_plot(results, df)
            print(f"プロット作成完了: {len(plot_base64)} 文字")

            # データベース保存（因子分析と同じパターンを使用）
            session_id = self.save_to_database(
                db=db,
                session_name=session_name,
                description=description,
                tags=tags,
                user_id=user_id,
                file=file,
                csv_text=csv_text,
                df=df,
                results=results,
                plot_base64=plot_base64,
            )

            print(f"データベース保存完了: session_id={session_id}")

            # レスポンス作成
            response_data = self.create_response(
                results, df, session_id, session_name, file, plot_base64
            )

            print("=== 回帰分析実行完了 ===")
            return response_data

        except Exception as e:
            print(f"回帰分析エラー: {e}")
            import traceback

            traceback.print_exc()
            raise

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
        """回帰分析データベース保存（因子分析を参考に修正）"""
        try:
            print("=== 回帰分析データベース保存開始 ===")

            # 基底クラスのメソッド呼び出しを確認
            if hasattr(super(), "save_to_database"):
                try:
                    session_id = super().save_to_database(
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
                    print(f"基底クラス保存成功: session_id={session_id}")
                except Exception as e:
                    print(f"⚠️ 基底クラスのsave_to_databaseエラー: {e}")
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
            else:
                print("⚠️ 基底クラスにsave_to_databaseメソッドがありません")
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

            if session_id == 0:
                raise Exception("session_idが0です。保存に失敗した可能性があります。")

            # 回帰分析特有のデータを追加保存
            self._save_regression_specific_data(db, session_id, results)

            # 座標データを保存（予測結果）
            self._save_coordinates_data(db, session_id, df, results)

            print(f"=== 回帰分析データベース保存完了: session_id={session_id} ===")
            return session_id

        except Exception as e:
            print(f"❌ 回帰分析データベース保存エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return 0

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
        """基底クラスのメソッドがない場合の直接保存（因子分析を参考）"""
        try:
            from models import AnalysisSession, VisualizationData

            # セッション基本情報を保存
            session = AnalysisSession(
                session_name=session_name,
                description=description,
                analysis_type=self.get_analysis_type(),
                original_filename=file.filename,
                user_id=user_id,
                row_count=df.shape[0],
                column_count=df.shape[1],
                # 回帰分析特有のメタデータ
                dimensions_count=len(results.get("explanatory_variables", [])),
                dimension_1_contribution=results.get("r2_all", 0.0),
                standardized=results.get("standardize", False),
            )

            db.add(session)
            db.flush()  # IDを取得するため
            session_id = session.id

            print(f"セッション作成成功: session_id={session_id}")

            # タグを保存
            if tags:
                from models import SessionTag

                for tag in tags:
                    if tag.strip():
                        session_tag = SessionTag(
                            session_id=session_id, tag_name=tag.strip()
                        )
                        db.add(session_tag)

            # プロット画像を保存
            if plot_base64:
                visualization = VisualizationData(
                    session_id=session_id,
                    image_base64=plot_base64,
                    width=1400,
                    height=1100,
                    image_type="regression_plot",
                )
                db.add(visualization)

            db.commit()
            print(f"直接保存完了: session_id={session_id}")
            return session_id

        except Exception as e:
            print(f"❌ 直接保存エラー: {str(e)}")
            db.rollback()
            return 0

    def _save_regression_specific_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """回帰分析特有のメタデータを保存"""
        try:
            from models import AnalysisMetadata

            # 回帰統計メタデータ
            stats_data = {
                "r2_score": float(results.get("r2_all", 0.0)),
                "adjusted_r2": float(results.get("adjusted_r2", 0.0)),
                "mse": float(
                    mean_squared_error(results["y_processed"], results["y_pred_all"])
                ),
                "mae": float(
                    mean_absolute_error(results["y_processed"], results["y_pred_all"])
                ),
                "rmse": float(
                    np.sqrt(
                        mean_squared_error(
                            results["y_processed"], results["y_pred_all"]
                        )
                    )
                ),
                "method": results.get("method", "linear"),
                "target_variable": results.get("target_variable", ""),
                "explanatory_variables": results.get("explanatory_variables", []),
            }

            # F統計量とp値を追加（存在する場合）
            if results.get("f_statistic") is not None:
                stats_data["f_statistic"] = float(results["f_statistic"])
            if results.get("p_value") is not None:
                stats_data["p_value"] = float(results["p_value"])

            stats_metadata = AnalysisMetadata(
                session_id=session_id,
                metadata_type="regression_stats",
                metadata_content=stats_data,
            )
            db.add(stats_metadata)

            # 回帰係数メタデータ
            if "coefficients" in results:
                coeffs_metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="regression_coefficients",
                    metadata_content=results["coefficients"],
                )
                db.add(coeffs_metadata)

            db.commit()
            print(f"回帰特有メタデータ保存完了: session_id={session_id}")

        except Exception as e:
            print(f"回帰特有メタデータ保存エラー: {e}")
            db.rollback()

    def _save_coordinates_data(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """回帰分析の予測結果保存（因子分析を参考に修正）"""
        try:
            from models import CoordinatesData

            y_true = results["y_processed"]
            y_pred = results["y_pred_all"]
            train_idx = results["y_train"].index
            test_idx = results["y_test"].index

            print(f"=== 回帰予測データ保存開始 ===")
            print(f"予測結果: {len(y_pred)} 件")

            # 予測結果を座標データとして保存
            for i, sample_name in enumerate(y_true.index):
                actual_val = float(y_true.iloc[i])
                predicted_val = float(y_pred[i])
                residual = actual_val - predicted_val
                data_type = "train" if sample_name in train_idx else "test"

                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(sample_name),
                    point_type=data_type,
                    dimension_1=actual_val,  # 実際値
                    dimension_2=predicted_val,  # 予測値
                    dimension_3=residual,  # 残差
                )
                db.add(coord_data)

            db.commit()
            print(f"✅ 回帰予測データ保存完了: {len(y_pred)} 件")

        except Exception as e:
            print(f"❌ 回帰予測データ保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            db.rollback()

    def perform_analysis(
        self,
        df,
        method,
        target_variable,
        explanatory_variables,
        polynomial_degree,
        test_size,
        random_state,
        include_intercept,
        standardize,
    ):
        """回帰分析実行"""
        print(
            f"分析開始: method={method}, target={target_variable}, explanatory={explanatory_variables}"
        )

        # データ準備
        y = df[target_variable].copy()
        X = df[explanatory_variables].copy()

        # 元のXを保存（プロット用）
        original_X = X.copy()

        # 欠損値の確認と除去
        data_combined = pd.concat([X, y], axis=1)
        data_combined = data_combined.dropna()

        if len(data_combined) == 0:
            raise ValueError("欠損値を除去した結果、有効なデータがありません")

        X = data_combined[explanatory_variables]
        y = data_combined[target_variable]

        print(f"有効データ数: {len(X)}")

        # 標準化
        scaler = None
        if standardize and method in ["multiple"]:
            scaler = StandardScaler()
            X = pd.DataFrame(scaler.fit_transform(X), index=X.index, columns=X.columns)

        # 多項式特徴量生成
        poly_features = None
        if method == "polynomial":
            poly_features = PolynomialFeatures(
                degree=polynomial_degree, include_bias=include_intercept
            )
            X_poly = poly_features.fit_transform(X)
            X = pd.DataFrame(
                X_poly,
                index=X.index,
                columns=[f"x^{i}" for i in range(X_poly.shape[1])],
            )

        # 訓練・テストデータ分割
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=random_state
        )

        # 回帰モデル構築
        model = LinearRegression(
            fit_intercept=include_intercept and method != "polynomial"
        )
        model.fit(X_train, y_train)

        # 予測
        y_train_pred = model.predict(X_train)
        y_test_pred = model.predict(X_test)
        y_pred_all = model.predict(X)

        # 評価指標計算
        r2_train = r2_score(y_train, y_train_pred)
        r2_test = r2_score(y_test, y_test_pred)
        r2_all = r2_score(y, y_pred_all)

        mse_train = mean_squared_error(y_train, y_train_pred)
        mse_test = mean_squared_error(y_test, y_test_pred)
        mae_train = mean_absolute_error(y_train, y_train_pred)
        mae_test = mean_absolute_error(y_test, y_test_pred)

        rmse_train = np.sqrt(mse_train)
        rmse_test = np.sqrt(mse_test)

        # 調整済み決定係数
        n = len(X)
        p = X.shape[1]
        adjusted_r2 = 1 - (1 - r2_all) * (n - 1) / (n - p - 1) if n > p + 1 else r2_all

        # 回帰係数と統計的検定
        coefficients = self.calculate_coefficient_statistics(
            X, y, model, include_intercept
        )

        # F統計量とp値
        f_stat, p_value = self.calculate_f_statistic(y, y_pred_all, X.shape[1])

        print(
            f"評価指標 - R²: {r2_all:.4f}, RMSE: {np.sqrt(mean_squared_error(y, y_pred_all)):.4f}"
        )

        return {
            "method": method,
            "target_variable": target_variable,
            "explanatory_variables": explanatory_variables,
            "polynomial_degree": polynomial_degree if method == "polynomial" else None,
            "include_intercept": include_intercept,
            "standardize": standardize,
            "model": model,
            "scaler": scaler,
            "poly_features": poly_features,
            "original_X": original_X,
            "X_train": X_train,
            "X_test": X_test,
            "y_train": y_train,
            "y_test": y_test,
            "y_train_pred": y_train_pred,
            "y_test_pred": y_test_pred,
            "y_pred_all": y_pred_all,
            "X_processed": X,
            "y_processed": y,
            "r2_train": r2_train,
            "r2_test": r2_test,
            "r2_all": r2_all,
            "adjusted_r2": adjusted_r2,
            "mse_train": mse_train,
            "mse_test": mse_test,
            "mae_train": mae_train,
            "mae_test": mae_test,
            "rmse_train": rmse_train,
            "rmse_test": rmse_test,
            "coefficients": coefficients,
            "f_statistic": f_stat,
            "p_value": p_value,
        }

    def calculate_coefficient_statistics(self, X, y, model, include_intercept):
        """回帰係数の統計的検定を計算"""
        try:
            n = len(X)
            p = X.shape[1]

            # 予測値と残差
            y_pred = model.predict(X)
            residuals = y - y_pred

            # 残差の標準誤差
            mse = np.sum(residuals**2) / (n - p - (1 if include_intercept else 0))

            # デザイン行列
            if include_intercept:
                X_design = np.column_stack([np.ones(n), X])
                coef_names = ["切片"] + list(X.columns)
                coeffs = np.concatenate([[model.intercept_], model.coef_])
            else:
                X_design = X.values
                coef_names = list(X.columns)
                coeffs = model.coef_

            # 共分散行列
            try:
                cov_matrix = mse * np.linalg.inv(X_design.T @ X_design)
                std_errors = np.sqrt(np.diag(cov_matrix))

                # t統計量とp値
                t_values = coeffs / std_errors
                df = n - len(coeffs)
                p_values = 2 * (1 - stats.t.cdf(np.abs(t_values), df))

                result = {}
                for i, name in enumerate(coef_names):
                    result[name] = {
                        "coefficient": float(coeffs[i]),
                        "std_error": float(std_errors[i]),
                        "t_value": float(t_values[i]),
                        "p_value": float(p_values[i]),
                    }

                return result

            except np.linalg.LinAlgError:
                # 特異行列の場合は係数のみ返す
                result = {}
                for i, name in enumerate(coef_names):
                    result[name] = {
                        "coefficient": float(coeffs[i]),
                        "std_error": None,
                        "t_value": None,
                        "p_value": None,
                    }
                return result

        except Exception as e:
            print(f"係数統計計算エラー: {e}")
            # フォールバック: 係数のみ
            if include_intercept:
                return {
                    "切片": {"coefficient": float(model.intercept_)},
                    **{
                        col: {"coefficient": float(coef)}
                        for col, coef in zip(X.columns, model.coef_)
                    },
                }
            else:
                return {
                    col: {"coefficient": float(coef)}
                    for col, coef in zip(X.columns, model.coef_)
                }

    def calculate_f_statistic(self, y_true, y_pred, p):
        """F統計量とp値を計算"""
        try:
            n = len(y_true)

            # 全平均
            y_mean = np.mean(y_true)

            # 平方和
            sst = np.sum((y_true - y_mean) ** 2)  # 総平方和
            ssr = np.sum((y_pred - y_mean) ** 2)  # 回帰平方和
            sse = np.sum((y_true - y_pred) ** 2)  # 誤差平方和

            # 自由度
            df_reg = p  # 回帰の自由度
            df_res = n - p - 1  # 残差の自由度

            if df_res <= 0:
                return None, None

            # F統計量
            msr = ssr / df_reg  # 回帰平均平方
            mse = sse / df_res  # 誤差平均平方

            if mse == 0:
                return None, None

            f_stat = msr / mse

            # p値
            p_value = 1 - stats.f.cdf(f_stat, df_reg, df_res)

            return float(f_stat), float(p_value)

        except Exception as e:
            print(f"F統計量計算エラー: {str(e)}")
            return None, None

    def create_regression_plot(self, df, results):
        """回帰分析プロット画像を生成してbase64で返す"""
        import warnings

        warnings.filterwarnings("ignore")

        try:
            print("=== 回帰プロット画像生成開始 ===")

            method = results["method"]
            target_var = results["target_variable"]
            explanatory_vars = results["explanatory_variables"]

            # 日本語フォント設定
            self.setup_japanese_font()

            # 図のサイズ設定
            fig = plt.figure(figsize=(16, 12))

            if method == "linear" or (
                method == "polynomial" and len(explanatory_vars) == 1
            ):
                # 単回帰・多項式回帰の場合（2x2レイアウト）

                # 1. 散布図と回帰直線/曲線
                ax1 = plt.subplot(2, 2, 1)
                self.plot_regression_line(results, ax1)

                # 2. 残差プロット
                ax2 = plt.subplot(2, 2, 2)
                self.plot_residuals(results, ax2)

                # 3. Q-Qプロット
                ax3 = plt.subplot(2, 2, 3)
                self.plot_qq(results, ax3)

                # 4. 評価指標まとめ
                ax4 = plt.subplot(2, 2, 4)
                self.plot_regression_metrics(results, ax4)

            else:
                # 重回帰の場合（2x2レイアウト）

                # 1. 実測値 vs 予測値
                ax1 = plt.subplot(2, 2, 1)
                self.plot_actual_vs_predicted(results, ax1)

                # 2. 残差プロット
                ax2 = plt.subplot(2, 2, 2)
                self.plot_residuals_multiple(results, ax2)

                # 3. 係数の重要度
                ax3 = plt.subplot(2, 2, 3)
                self.plot_coefficients(results, ax3)

                # 4. 評価指標まとめ
                ax4 = plt.subplot(2, 2, 4)
                self.plot_regression_metrics(results, ax4)

            plt.tight_layout()

            # 画像をbase64エンコード
            return self.save_plot_as_base64(fig)

        except Exception as e:
            print(f"回帰プロット生成エラー: {e}")
            import traceback

            traceback.print_exc()
            return ""

    def plot_regression_line(self, results, ax):
        """回帰直線/曲線プロット（単回帰・多項式回帰用）"""
        try:
            X = results["X_processed"]
            y = results["y_processed"]
            y_pred = results["y_pred_all"]
            method = results["method"]

            if method == "polynomial":
                # 多項式回帰の場合、元の説明変数を取得
                explanatory_var = results["explanatory_variables"][0]

                # 元のデータフレームから説明変数の値を取得
                original_X = results.get("original_X")
                if original_X is not None and explanatory_var in original_X.columns:
                    x_values = original_X[explanatory_var].values
                else:
                    # フォールバック: インデックスから推測
                    x_values = np.arange(len(y))

                # データを結合してソート
                combined_data = pd.DataFrame(
                    {"x": x_values, "y_actual": y.values, "y_pred": y_pred}
                )
                combined_data = combined_data.sort_values("x")

                ax.scatter(
                    combined_data["x"],
                    combined_data["y_actual"],
                    alpha=0.6,
                    label="実測値",
                    color="blue",
                )
                ax.plot(
                    combined_data["x"],
                    combined_data["y_pred"],
                    color="red",
                    linewidth=2,
                    label=f"多項式回帰(次数={results['polynomial_degree']})",
                )

                ax.set_xlabel(explanatory_var, fontsize=12)
            else:
                # 単回帰の場合
                x_values = X.iloc[:, 0].values
                y_values = y.values

                # ソートしてプロット
                sort_idx = np.argsort(x_values)
                x_sorted = x_values[sort_idx]
                y_sorted = y_values[sort_idx]
                y_pred_sorted = y_pred[sort_idx]

                ax.scatter(x_values, y_values, alpha=0.6, label="実測値", color="blue")
                ax.plot(
                    x_sorted, y_pred_sorted, color="red", linewidth=2, label="回帰直線"
                )

                ax.set_xlabel(results["explanatory_variables"][0], fontsize=12)

            ax.set_ylabel(results["target_variable"], fontsize=12)
            ax.set_title(
                f"回帰分析結果 (R² = {results['r2_all']:.3f})",
                fontsize=14,
                fontweight="bold",
            )
            ax.legend()
            ax.grid(True, alpha=0.3)

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"回帰直線プロットエラー: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_actual_vs_predicted(self, results, ax):
        """実測値 vs 予測値プロット（重回帰用）"""
        try:
            y_true = results["y_processed"]
            y_pred = results["y_pred_all"]

            # 訓練・テストデータの区別
            train_idx = results["y_train"].index
            test_idx = results["y_test"].index

            # 安全なインデックス操作
            y_true_values = y_true.values
            train_positions = []
            test_positions = []

            for i, idx in enumerate(y_true.index):
                if idx in train_idx:
                    train_positions.append(i)
                elif idx in test_idx:
                    test_positions.append(i)

            train_positions = np.array(train_positions)
            test_positions = np.array(test_positions)

            if len(train_positions) > 0:
                ax.scatter(
                    y_true_values[train_positions],
                    y_pred[train_positions],
                    alpha=0.6,
                    label="訓練データ",
                    color="blue",
                )
            if len(test_positions) > 0:
                ax.scatter(
                    y_true_values[test_positions],
                    y_pred[test_positions],
                    alpha=0.6,
                    label="テストデータ",
                    color="red",
                )

            # 理想線（y=x）
            min_val = min(y_true_values.min(), y_pred.min())
            max_val = max(y_true_values.max(), y_pred.max())
            ax.plot(
                [min_val, max_val],
                [min_val, max_val],
                "k--",
                linewidth=1,
                label="理想線 (y=x)",
            )

            ax.set_xlabel("実測値", fontsize=12)
            ax.set_ylabel("予測値", fontsize=12)
            ax.set_title(
                f"実測値 vs 予測値 (R² = {results['r2_all']:.3f})",
                fontsize=14,
                fontweight="bold",
            )
            ax.legend()
            ax.grid(True, alpha=0.3)

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"実測値 vs 予測値プロットエラー: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_residuals(self, results, ax):
        """残差プロット（単回帰・多項式回帰用）"""
        try:
            y_true = results["y_processed"]
            y_pred = results["y_pred_all"]
            residuals = y_true.values - y_pred

            if results["method"] == "polynomial":
                # 多項式回帰の場合、元の説明変数を使用
                original_X = results.get("original_X")
                explanatory_var = results["explanatory_variables"][0]

                if original_X is not None and explanatory_var in original_X.columns:
                    x_vals = original_X[explanatory_var].values
                else:
                    x_vals = np.arange(len(residuals))
            else:
                X = results["X_processed"]
                x_vals = X.iloc[:, 0].values

            ax.scatter(x_vals, residuals, alpha=0.6, color="blue")
            ax.axhline(y=0, color="red", linestyle="--", linewidth=1)

            ax.set_xlabel(results["explanatory_variables"][0], fontsize=12)
            ax.set_ylabel("残差", fontsize=12)
            ax.set_title("残差プロット", fontsize=14, fontweight="bold")
            ax.grid(True, alpha=0.3)

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"残差プロットエラー: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_residuals_multiple(self, results, ax):
        """残差プロット（重回帰用）"""
        try:
            y_pred = results["y_pred_all"]
            y_true = results["y_processed"]
            residuals = y_true.values - y_pred

            ax.scatter(y_pred, residuals, alpha=0.6, color="blue")
            ax.axhline(y=0, color="red", linestyle="--", linewidth=1)

            ax.set_xlabel("予測値", fontsize=12)
            ax.set_ylabel("残差", fontsize=12)
            ax.set_title("残差プロット", fontsize=14, fontweight="bold")
            ax.grid(True, alpha=0.3)

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"残差プロットエラー: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_qq(self, results, ax):
        """Q-Qプロット（正規性の確認）"""
        try:
            y_true = results["y_processed"]
            y_pred = results["y_pred_all"]
            residuals = y_true.values - y_pred

            stats.probplot(residuals, dist="norm", plot=ax)
            ax.set_title("Q-Qプロット（残差の正規性）", fontsize=14, fontweight="bold")
            ax.grid(True, alpha=0.3)

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"Q-Qプロットエラー: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_coefficients(self, results, ax):
        """回帰係数の重要度プロット"""
        try:
            coefficients = results["coefficients"]

            # 切片以外の係数を取得
            coef_data = {
                k: v["coefficient"]
                for k, v in coefficients.items()
                if k != "切片" and "coefficient" in v
            }

            if not coef_data:
                ax.text(
                    0.5,
                    0.5,
                    "表示可能な係数がありません",
                    transform=ax.transAxes,
                    ha="center",
                    va="center",
                )
                return

            names = list(coef_data.keys())
            values = list(coef_data.values())
            colors = ["red" if v < 0 else "blue" for v in values]

            bars = ax.barh(names, values, color=colors, alpha=0.7)

            # 値をバーの端に表示
            for bar, value in zip(bars, values):
                width = bar.get_width()
                ax.text(
                    width + (0.01 * max(abs(min(values)), abs(max(values)))),
                    bar.get_y() + bar.get_height() / 2,
                    f"{value:.3f}",
                    ha="left" if width >= 0 else "right",
                    va="center",
                )

            ax.axvline(x=0, color="black", linestyle="-", linewidth=0.5)
            ax.set_xlabel("回帰係数", fontsize=12)
            ax.set_title("回帰係数", fontsize=14, fontweight="bold")
            ax.grid(True, alpha=0.3, axis="x")

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"係数プロットエラー: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_regression_metrics(self, results, ax):
        """評価指標まとめプロット"""
        try:
            metrics = {
                "R²": results["r2_all"],
                "調整済みR²": results["adjusted_r2"],
                "RMSE": np.sqrt(
                    mean_squared_error(results["y_processed"], results["y_pred_all"])
                ),
            }

            # 正規化（0-1スケール）
            normalized_metrics = {}
            normalized_metrics["R²"] = max(0, metrics["R²"])
            normalized_metrics["調整済みR²"] = max(0, metrics["調整済みR²"])

            # RMSEは標準偏差で正規化
            y_std = results["y_processed"].std()
            normalized_metrics["RMSE"] = max(0, 1 - (metrics["RMSE"] / y_std))

            names = list(normalized_metrics.keys())
            values = list(normalized_metrics.values())
            colors = ["#2E86AB", "#A23B72", "#F18F01"]

            bars = ax.bar(
                names, values, color=colors, alpha=0.8, edgecolor="black", linewidth=1
            )

            # 元の値をバーの上に表示
            for bar, name in zip(bars, names):
                height = bar.get_height()
                original_val = metrics[name]
                ax.text(
                    bar.get_x() + bar.get_width() / 2.0,
                    height + 0.01,
                    f"{original_val:.3f}",
                    ha="center",
                    va="bottom",
                    fontweight="bold",
                )

            ax.set_ylabel("正規化スコア", fontsize=12)
            ax.set_title("評価指標", fontsize=14, fontweight="bold")
            ax.set_ylim(0, 1.2)
            ax.grid(True, alpha=0.3, axis="y")

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"評価指標プロットエラー: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def create_response(self, results, df, session_id, session_name, file, plot_base64):
        """レスポンスデータを作成"""
        try:
            # 予測結果の作成
            predictions = []
            y_true = results["y_processed"]
            y_pred = results["y_pred_all"]
            train_idx = results["y_train"].index
            test_idx = results["y_test"].index

            for i, sample_name in enumerate(y_true.index):
                actual_val = float(y_true.iloc[i])
                predicted_val = float(y_pred[i])
                residual = actual_val - predicted_val
                data_type = "train" if sample_name in train_idx else "test"

                predictions.append(
                    {
                        "sample_name": str(sample_name),
                        "actual_value": actual_val,
                        "predicted_value": predicted_val,
                        "residual": residual,
                        "data_type": data_type,
                    }
                )

            # 評価指標の計算
            evaluation_metrics = {
                "r2_score": float(results["r2_all"]),
                "adjusted_r2": float(results["adjusted_r2"]),
                "mse": float(mean_squared_error(y_true.values, y_pred)),
                "mae": float(mean_absolute_error(y_true.values, y_pred)),
                "rmse": float(np.sqrt(mean_squared_error(y_true.values, y_pred))),
                "train_r2": float(results["r2_train"]),
                "test_r2": float(results["r2_test"]),
                "train_rmse": float(results["rmse_train"]),
                "test_rmse": float(results["rmse_test"]),
            }

            # F統計量とp値を追加（存在する場合）
            if results.get("f_statistic") is not None:
                evaluation_metrics["f_statistic"] = float(results["f_statistic"])
            if results.get("p_value") is not None:
                evaluation_metrics["p_value"] = float(results["p_value"])

            # 可視化データ
            visualization_data = {
                "plot_image": plot_base64,
                "predictions": predictions,
                "coefficients": self._serialize_dict(results.get("coefficients", {})),
                "evaluation_metrics": evaluation_metrics,
            }

            response_data = {
                "status": "success",
                "success": True,
                "message": "回帰分析が完了しました",
                "session_id": session_id,
                "session_name": session_name,
                "analysis_type": "regression",
                "metadata": {
                    "session_name": session_name,
                    "original_filename": file.filename,
                    "analysis_type": "regression",
                    "rows": int(len(y_true)),
                    "columns": int(df.shape[1]),
                    "column_names": [str(col) for col in df.columns.tolist()],
                },
                "analysis_results": {
                    "method": results["method"],
                    "target_variable": results["target_variable"],
                    "explanatory_variables": results["explanatory_variables"],
                    "polynomial_degree": results.get("polynomial_degree"),
                    "r2_score": float(results["r2_all"]),
                    "adjusted_r2": float(results["adjusted_r2"]),
                    "rmse": float(np.sqrt(mean_squared_error(y_true.values, y_pred))),
                    "coefficients": self._serialize_dict(
                        results.get("coefficients", {})
                    ),
                    "evaluation_metrics": evaluation_metrics,
                },
                "data_info": {
                    "original_filename": file.filename,
                    "rows": int(len(y_true)),
                    "columns": int(df.shape[1]),
                    "column_names": [str(col) for col in df.columns.tolist()],
                    "target_variable": results["target_variable"],
                    "explanatory_variables": results["explanatory_variables"],
                },
                "visualization": visualization_data,
            }

            print(f"レスポンスデータ作成完了: session_id={session_id}")
            return response_data

        except Exception as e:
            print(f"レスポンスデータ作成エラー: {e}")
            import traceback

            traceback.print_exc()
            raise

    def _serialize_dict(self, data):
        """辞書内のnumpy型をPythonネイティブ型に変換"""
        import numpy as np

        if isinstance(data, dict):
            return {str(k): self._serialize_dict(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._serialize_dict(item) for item in data]
        elif isinstance(data, (np.integer, np.int32, np.int64)):
            return int(data)
        elif isinstance(data, (np.floating, np.float32, np.float64)):
            return float(data)
        elif isinstance(data, np.ndarray):
            return data.tolist()
        else:
            return data

    async def get_session_detail(self, session_id: int, db: Session):
        """回帰分析セッション詳細取得（因子分析を参考に追加）"""
        try:
            print(f"📊 回帰分析セッション詳細取得開始: {session_id}")

            # 基底クラスのメソッドが存在するかチェック
            if hasattr(super(), "get_session_detail"):
                try:
                    base_detail = super().get_session_detail(db, session_id)
                except Exception as e:
                    print(f"⚠️ 基底クラスのget_session_detailエラー: {e}")
                    base_detail = await self._get_session_detail_directly(
                        db, session_id
                    )
            else:
                print("⚠️ 基底クラスにget_session_detailメソッドがありません")
                base_detail = await self._get_session_detail_directly(db, session_id)

            if not base_detail or not base_detail.get("success"):
                return base_detail

            print(f"✅ 回帰分析セッション詳細取得完了")
            return base_detail

        except Exception as e:
            print(f"❌ 回帰分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    async def _get_session_detail_directly(self, db: Session, session_id: int):
        """回帰分析セッション詳細を直接取得"""
        try:
            from models import (
                AnalysisSession,
                VisualizationData,
                CoordinatesData,
                AnalysisMetadata,
            )

            print(f"📊 回帰分析セッション詳細取得開始: {session_id}")

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

            # 予測結果データを取得
            predictions = (
                db.query(CoordinatesData)
                .filter(CoordinatesData.session_id == session_id)
                .all()
            )

            # メタデータを取得
            metadata_entries = (
                db.query(AnalysisMetadata)
                .filter(AnalysisMetadata.session_id == session_id)
                .all()
            )

            print(
                f"🔍 データ取得結果: 予測={len(predictions)}件, 可視化={'あり' if visualization else 'なし'}, メタデータ={len(metadata_entries)}件"
            )

            # 予測結果データの整理
            prediction_data = []
            for pred in predictions:
                actual = pred.dimension_1 if pred.dimension_1 is not None else 0
                predicted = pred.dimension_2 if pred.dimension_2 is not None else 0
                residual = (
                    pred.dimension_3
                    if pred.dimension_3 is not None
                    else (actual - predicted)
                )

                prediction_data.append(
                    {
                        "sample_name": pred.point_name,
                        "actual_value": float(actual),
                        "predicted_value": float(predicted),
                        "residual": float(residual),
                        "data_type": pred.point_type,
                    }
                )

            # メタデータの整理
            regression_stats = {}
            regression_coefficients = {}

            for meta in metadata_entries:
                if meta.metadata_type == "regression_stats":
                    regression_stats = meta.metadata_content
                elif meta.metadata_type == "regression_coefficients":
                    regression_coefficients = meta.metadata_content

            # レスポンス構造を構築
            response_data = {
                "success": True,
                "data": {
                    "session_info": {
                        "session_id": session.id,
                        "session_name": session.session_name,
                        "description": getattr(session, "description", "") or "",
                        "filename": session.original_filename,
                        "row_count": getattr(
                            session, "row_count", len(prediction_data)
                        ),
                        "column_count": getattr(session, "column_count", 2),
                        "analysis_timestamp": (
                            session.analysis_timestamp.isoformat()
                            if hasattr(session, "analysis_timestamp")
                            and session.analysis_timestamp
                            else None
                        ),
                        "method": regression_stats.get("method", "linear"),
                        "target_variable": regression_stats.get("target_variable", ""),
                        "explanatory_variables": regression_stats.get(
                            "explanatory_variables", []
                        ),
                    },
                    "metadata": {
                        "filename": session.original_filename,
                        "rows": getattr(session, "row_count", len(prediction_data)),
                        "columns": getattr(session, "column_count", 2),
                        "analysis_type": "regression",
                    },
                    "analysis_results": {
                        "evaluation_metrics": regression_stats,
                        "coefficients": regression_coefficients,
                        "predictions": prediction_data,
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

            print(f"✅ 回帰分析セッション詳細取得完了")
            return response_data

        except Exception as e:
            print(f"❌ 回帰分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}
