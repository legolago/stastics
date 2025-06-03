# python-api/analysis/regression.py
from typing import Dict, Any, List
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error
from sklearn.preprocessing import StandardScaler
import warnings

warnings.filterwarnings("ignore")

from .base import BaseAnalyzer


class RegressionAnalyzer(BaseAnalyzer):
    """回帰分析クラス"""

    def get_analysis_type(self) -> str:
        return "regression"

    def analyze(
        self,
        df: pd.DataFrame,
        target_column: str,
        regression_type: str = "linear",
        polynomial_degree: int = 2,
        test_size: float = 0.3,
        include_intercept: bool = True,
        **kwargs,
    ) -> Dict[str, Any]:
        """回帰分析を実行"""
        try:
            print(f"=== 回帰分析開始 ===")
            print(f"入力データ:\n{df}")
            print(f"データ形状: {df.shape}")
            print(f"目的変数: {target_column}")
            print(f"回帰の種類: {regression_type}")

            # データの検証と前処理
            df_processed, X, y = self._preprocess_regression_data(df, target_column)
            print(f"前処理後データ形状: X={X.shape}, y={y.shape}")

            # 回帰分析の実行
            results = self._compute_regression_analysis(
                X,
                y,
                df_processed,
                target_column,
                regression_type,
                polynomial_degree,
                test_size,
                include_intercept,
            )

            print(f"分析結果: {list(results.keys())}")
            return results

        except Exception as e:
            print(f"回帰分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    def _preprocess_regression_data(self, df: pd.DataFrame, target_column: str):
        """回帰分析用のデータ前処理"""
        df_clean = df.copy()

        # 数値データのみを選択
        numeric_columns = df_clean.select_dtypes(include=[np.number]).columns.tolist()
        df_clean = df_clean[numeric_columns]

        # 欠損値の処理
        df_clean = df_clean.fillna(df_clean.mean())

        # 目的変数と説明変数の分離
        if target_column not in df_clean.columns:
            raise ValueError(f"目的変数 '{target_column}' が数値カラムに存在しません")

        y = df_clean[target_column]
        X = df_clean.drop(columns=[target_column])

        print(f"前処理完了: {df.shape} -> X:{X.shape}, y:{y.shape}")
        print(f"説明変数: {list(X.columns)}")

        if X.empty or len(X.columns) == 0:
            raise ValueError("有効な説明変数がありません")

        return df_clean, X, y

    def _compute_regression_analysis(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        df_processed: pd.DataFrame,
        target_column: str,
        regression_type: str,
        polynomial_degree: int,
        test_size: float,
        include_intercept: bool,
    ) -> Dict[str, Any]:
        """回帰分析の計算"""
        try:
            # データの分割
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=42
            )

            print(f"データ分割: train={X_train.shape}, test={X_test.shape}")

            # 回帰分析の種類に応じた処理
            if regression_type == "linear":
                # 単回帰分析（最も相関の高い変数を使用）
                correlations = X.corrwith(y).abs()
                best_feature = correlations.idxmax()
                X_train_selected = X_train[[best_feature]]
                X_test_selected = X_test[[best_feature]]
                X_selected = X[[best_feature]]

                print(
                    f"単回帰分析: 選択された変数 = {best_feature} (相関: {correlations[best_feature]:.3f})"
                )

            elif regression_type == "multiple":
                # 重回帰分析（全ての変数を使用）
                X_train_selected = X_train
                X_test_selected = X_test
                X_selected = X
                best_feature = None

            elif regression_type == "polynomial":
                # 多項式回帰（最も相関の高い変数を使用）
                correlations = X.corrwith(y).abs()
                best_feature = correlations.idxmax()
                X_single = X[[best_feature]]

                # 多項式特徴量の生成
                poly_features = PolynomialFeatures(
                    degree=polynomial_degree, include_bias=include_intercept
                )
                X_poly = poly_features.fit_transform(X_single)
                X_train_poly, X_test_poly = train_test_split(
                    X_poly, y, test_size=test_size, random_state=42
                )

                X_train_selected = X_train_poly
                X_test_selected = X_test_poly
                X_selected = X_poly

                print(f"多項式回帰: 変数 = {best_feature}, 次数 = {polynomial_degree}")
            else:
                raise ValueError(f"未対応の回帰タイプ: {regression_type}")

            # モデルの学習
            model = LinearRegression(
                fit_intercept=(
                    include_intercept if regression_type != "polynomial" else False
                )
            )
            model.fit(X_train_selected, y_train)

            # 予測
            y_train_pred = model.predict(X_train_selected)
            y_test_pred = model.predict(X_test_selected)

            # 評価指標の計算
            train_r2 = r2_score(y_train, y_train_pred)
            test_r2 = r2_score(y_test, y_test_pred)
            train_rmse = np.sqrt(mean_squared_error(y_train, y_train_pred))
            test_rmse = np.sqrt(mean_squared_error(y_test, y_test_pred))
            train_mae = mean_absolute_error(y_train, y_train_pred)
            test_mae = mean_absolute_error(y_test, y_test_pred)

            # 回帰係数の取得
            if regression_type == "polynomial":
                if include_intercept:
                    coefficients = model.coef_
                    intercept = 0.0  # PolynomialFeaturesでbias=Trueの場合
                else:
                    coefficients = model.coef_
                    intercept = model.intercept_
                feature_names = [
                    f"{best_feature}^{i}" for i in range(polynomial_degree + 1)
                ]
            else:
                coefficients = model.coef_
                intercept = model.intercept_
                if regression_type == "linear":
                    feature_names = [best_feature]
                else:
                    feature_names = list(X.columns)

            # 予測値の生成（プロット用）
            if regression_type == "linear":
                # 単回帰の場合
                x_plot = np.linspace(
                    X_selected.iloc[:, 0].min(), X_selected.iloc[:, 0].max(), 100
                )
                x_plot_df = pd.DataFrame({best_feature: x_plot})
                y_plot = model.predict(x_plot_df)
            elif regression_type == "polynomial":
                # 多項式回帰の場合
                x_plot = np.linspace(
                    X[[best_feature]].iloc[:, 0].min(),
                    X[[best_feature]].iloc[:, 0].max(),
                    100,
                )
                x_plot_poly = poly_features.transform(x_plot.reshape(-1, 1))
                y_plot = model.predict(x_plot_poly)
            else:
                # 重回帰の場合（2変数の場合のみプロット対応）
                x_plot = None
                y_plot = None

            results = {
                "regression_type": regression_type,
                "target_column": target_column,
                "feature_names": feature_names,
                "coefficients": (
                    coefficients.tolist()
                    if hasattr(coefficients, "tolist")
                    else [coefficients]
                ),
                "intercept": float(intercept),
                "best_feature": best_feature,
                "polynomial_degree": (
                    polynomial_degree if regression_type == "polynomial" else None
                ),
                # 評価指標
                "train_r2": float(train_r2),
                "test_r2": float(test_r2),
                "train_rmse": float(train_rmse),
                "test_rmse": float(test_rmse),
                "train_mae": float(train_mae),
                "test_mae": float(test_mae),
                # データ
                "X_train": X_train.values.tolist(),
                "X_test": X_test.values.tolist(),
                "y_train": y_train.values.tolist(),
                "y_test": y_test.values.tolist(),
                "y_train_pred": y_train_pred.tolist(),
                "y_test_pred": y_test_pred.tolist(),
                # プロット用データ
                "x_plot": x_plot.tolist() if x_plot is not None else None,
                "y_plot": y_plot.tolist() if y_plot is not None else None,
                # メタデータ
                "n_samples": len(y),
                "n_features": X.shape[1],
                "test_size": test_size,
                "include_intercept": include_intercept,
                # 統計情報
                "total_inertia": float(test_r2),  # R²をtotal_inertiaとして保存
            }

            return results

        except Exception as e:
            print(f"回帰計算エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """回帰分析のプロットを作成"""
        try:
            print("=== 回帰プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            regression_type = results["regression_type"]
            target_column = results["target_column"]

            if regression_type in ["linear", "polynomial"]:
                # 単回帰・多項式回帰のプロット
                return self._create_single_regression_plot(results, df)
            elif regression_type == "multiple":
                # 重回帰のプロット
                return self._create_multiple_regression_plot(results, df)
            else:
                raise ValueError(f"未対応の回帰タイプ: {regression_type}")

        except Exception as e:
            print(f"プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

    def _create_single_regression_plot(
        self, results: Dict[str, Any], df: pd.DataFrame
    ) -> str:
        """単回帰・多項式回帰のプロット作成"""
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
        fig.patch.set_facecolor("white")

        regression_type = results["regression_type"]
        target_column = results["target_column"]
        best_feature = results["best_feature"]

        # 元データの取得
        X_data = df[best_feature].values
        y_data = df[target_column].values

        # 予測データ
        x_plot = np.array(results["x_plot"]) if results["x_plot"] else X_data
        y_plot = np.array(results["y_plot"]) if results["y_plot"] else None

        # 1. 散布図と回帰直線
        ax1.scatter(
            X_data,
            y_data,
            alpha=0.6,
            color="#3498db",
            s=50,
            edgecolor="white",
            linewidth=0.5,
        )
        if y_plot is not None:
            ax1.plot(x_plot, y_plot, color="#e74c3c", linewidth=3, label="回帰曲線")

        title = f"{'多項式' if regression_type == 'polynomial' else ''}回帰分析"
        ax1.set_title(
            title,
            fontsize=14,
            fontweight="bold",
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax1.set_xlabel(
            best_feature,
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax1.set_ylabel(
            target_column,
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax1.grid(True, alpha=0.3)
        ax1.legend()

        # 2. 残差プロット
        y_pred_all = np.array(results["y_train_pred"] + results["y_test_pred"])
        y_true_all = np.array(results["y_train"] + results["y_test"])
        residuals = y_true_all - y_pred_all

        ax2.scatter(y_pred_all, residuals, alpha=0.6, color="#9b59b6", s=50)
        ax2.axhline(y=0, color="red", linestyle="--", alpha=0.8)
        ax2.set_title(
            "残差プロット",
            fontsize=14,
            fontweight="bold",
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax2.set_xlabel(
            "予測値",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax2.set_ylabel(
            "残差",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax2.grid(True, alpha=0.3)

        # 3. 予測値 vs 実測値
        max_val = max(y_true_all.max(), y_pred_all.max())
        min_val = min(y_true_all.min(), y_pred_all.min())

        ax3.scatter(y_true_all, y_pred_all, alpha=0.6, color="#f39c12", s=50)
        ax3.plot(
            [min_val, max_val],
            [min_val, max_val],
            color="red",
            linestyle="--",
            alpha=0.8,
        )
        ax3.set_title(
            "予測値 vs 実測値",
            fontsize=14,
            fontweight="bold",
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax3.set_xlabel(
            "実測値",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax3.set_ylabel(
            "予測値",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax3.grid(True, alpha=0.3)

        # 4. 評価指標の表示
        ax4.axis("off")

        # 回帰式の表示
        if regression_type == "polynomial":
            degree = results["polynomial_degree"]
            coeffs = results["coefficients"]
            intercept = results["intercept"]

            equation = f"y = "
            for i, coeff in enumerate(coeffs):
                if i == 0:
                    equation += f"{coeff:.3f}"
                else:
                    sign = "+" if coeff >= 0 else ""
                    equation += f" {sign}{coeff:.3f}x^{i}"
            if intercept != 0:
                sign = "+" if intercept >= 0 else ""
                equation += f" {sign}{intercept:.3f}"
        else:
            coeff = results["coefficients"][0]
            intercept = results["intercept"]
            equation = f"y = {coeff:.3f}x"
            if intercept != 0:
                sign = "+" if intercept >= 0 else ""
                equation += f" {sign}{intercept:.3f}"

        info_text = f"""
回帰式: {equation}

評価指標:
訓練データ R² = {results['train_r2']:.4f}
テストデータ R² = {results['test_r2']:.4f}
訓練データ RMSE = {results['train_rmse']:.4f}
テストデータ RMSE = {results['test_rmse']:.4f}
訓練データ MAE = {results['train_mae']:.4f}
テストデータ MAE = {results['test_mae']:.4f}

データ情報:
サンプル数: {results['n_samples']}
説明変数: {best_feature}
目的変数: {target_column}
        """.strip()

        ax4.text(
            0.05,
            0.95,
            info_text,
            transform=ax4.transAxes,
            fontsize=11,
            verticalalignment="top",
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            bbox=dict(boxstyle="round,pad=0.5", facecolor="lightgray", alpha=0.8),
        )

        plt.tight_layout()
        return self.save_plot_as_base64(fig)

    def _create_multiple_regression_plot(
        self, results: Dict[str, Any], df: pd.DataFrame
    ) -> str:
        """重回帰分析のプロット作成"""
        fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
        fig.patch.set_facecolor("white")

        target_column = results["target_column"]
        feature_names = results["feature_names"]

        # 予測値と実測値
        y_pred_all = np.array(results["y_train_pred"] + results["y_test_pred"])
        y_true_all = np.array(results["y_train"] + results["y_test"])
        residuals = y_true_all - y_pred_all

        # 1. 予測値 vs 実測値
        max_val = max(y_true_all.max(), y_pred_all.max())
        min_val = min(y_true_all.min(), y_pred_all.min())

        ax1.scatter(y_true_all, y_pred_all, alpha=0.6, color="#3498db", s=50)
        ax1.plot(
            [min_val, max_val],
            [min_val, max_val],
            color="red",
            linestyle="--",
            alpha=0.8,
        )
        ax1.set_title(
            "予測値 vs 実測値",
            fontsize=14,
            fontweight="bold",
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax1.set_xlabel(
            "実測値",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax1.set_ylabel(
            "予測値",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax1.grid(True, alpha=0.3)

        # 2. 残差プロット
        ax2.scatter(y_pred_all, residuals, alpha=0.6, color="#e74c3c", s=50)
        ax2.axhline(y=0, color="red", linestyle="--", alpha=0.8)
        ax2.set_title(
            "残差プロット",
            fontsize=14,
            fontweight="bold",
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax2.set_xlabel(
            "予測値",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax2.set_ylabel(
            "残差",
            fontsize=12,
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
        )
        ax2.grid(True, alpha=0.3)

        # 3. 回帰係数のプロット
        coefficients = results["coefficients"]
        if len(feature_names) <= 10:  # 変数が10個以下の場合のみプロット
            colors = plt.cm.Set3(np.linspace(0, 1, len(feature_names)))
            bars = ax3.bar(
                range(len(feature_names)),
                coefficients,
                color=colors,
                alpha=0.7,
                edgecolor="black",
            )
            ax3.set_title(
                "回帰係数",
                fontsize=14,
                fontweight="bold",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_xlabel(
                "説明変数",
                fontsize=12,
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_ylabel(
                "係数値",
                fontsize=12,
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_xticks(range(len(feature_names)))
            ax3.set_xticklabels(
                feature_names,
                rotation=45,
                ha="right",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.grid(True, alpha=0.3)
            ax3.axhline(y=0, color="red", linestyle="-", alpha=0.5)
        else:
            # 変数が多い場合は係数の重要度順にプロット
            coeff_importance = [
                (abs(coeff), i, name)
                for i, (coeff, name) in enumerate(zip(coefficients, feature_names))
            ]
            coeff_importance.sort(reverse=True)
            top_10 = coeff_importance[:10]

            top_coeffs = [coefficients[idx] for _, idx, _ in top_10]
            top_names = [name for _, _, name in top_10]

            colors = plt.cm.Set3(np.linspace(0, 1, len(top_coeffs)))
            bars = ax3.bar(
                range(len(top_coeffs)),
                top_coeffs,
                color=colors,
                alpha=0.7,
                edgecolor="black",
            )
            ax3.set_title(
                "回帰係数（重要度上位10変数）",
                fontsize=14,
                fontweight="bold",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_xlabel(
                "説明変数",
                fontsize=12,
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_ylabel(
                "係数値",
                fontsize=12,
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_xticks(range(len(top_names)))
            ax3.set_xticklabels(
                top_names,
                rotation=45,
                ha="right",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.grid(True, alpha=0.3)
            ax3.axhline(y=0, color="red", linestyle="-", alpha=0.5)

        # 4. 評価指標の表示
        ax4.axis("off")

        # 回帰式の表示（主要な係数のみ）
        intercept = results["intercept"]
        if len(feature_names) <= 5:
            equation = f"y = {intercept:.3f}"
            for coeff, name in zip(coefficients, feature_names):
                sign = "+" if coeff >= 0 else ""
                equation += f" {sign}{coeff:.3f}*{name}"
        else:
            equation = f"y = {intercept:.3f} + (複数変数の線形結合)"

        info_text = f"""
回帰式: {equation}

評価指標:
訓練データ R² = {results['train_r2']:.4f}
テストデータ R² = {results['test_r2']:.4f}
訓練データ RMSE = {results['train_rmse']:.4f}
テストデータ RMSE = {results['test_rmse']:.4f}
訓練データ MAE = {results['train_mae']:.4f}
テストデータ MAE = {results['test_mae']:.4f}

データ情報:
サンプル数: {results['n_samples']}
説明変数数: {results['n_features']}
目的変数: {target_column}
        """.strip()

        ax4.text(
            0.05,
            0.95,
            info_text,
            transform=ax4.transAxes,
            fontsize=11,
            verticalalignment="top",
            fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            bbox=dict(boxstyle="round,pad=0.5", facecolor="lightgray", alpha=0.8),
        )

        plt.tight_layout()
        return self.save_plot_as_base64(fig)

    def _save_regression_coordinates(
        self, db, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """回帰分析の座標データ保存"""
        try:
            from models import CoordinatesData

            # 予測値と実測値を座標として保存
            y_true_all = np.array(results["y_train"] + results["y_test"])
            y_pred_all = np.array(results["y_train_pred"] + results["y_test_pred"])

            # 訓練データとテストデータのインデックス
            n_train = len(results["y_train"])

            for i, (y_true, y_pred) in enumerate(zip(y_true_all, y_pred_all)):
                data_type = "train" if i < n_train else "test"
                point_name = f"{data_type}_{i if i < n_train else i - n_train}"

                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=point_name,
                    point_type="observation",
                    dimension_1=float(y_true),  # 実測値
                    dimension_2=float(y_pred),  # 予測値
                )
                db.add(coord_data)

            print(f"回帰分析座標データ保存完了: {len(y_true_all)}件")

        except Exception as e:
            print(f"回帰分析座標データ保存エラー: {e}")

    def _save_coordinates_data(
        self, db, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """座標データの保存（回帰分析用オーバーライド）"""
        self._save_regression_coordinates(db, session_id, df, results)

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

        # 座標データの作成（予測値vs実測値）
        y_true_all = np.array(results["y_train"] + results["y_test"])
        y_pred_all = np.array(results["y_train_pred"] + results["y_test_pred"])
        n_train = len(results["y_train"])

        coordinates = []
        for i, (y_true, y_pred) in enumerate(zip(y_true_all, y_pred_all)):
            data_type = "train" if i < n_train else "test"
            coordinates.append(
                {
                    "name": f"{data_type}_{i if i < n_train else i - n_train}",
                    "dimension_1": float(y_true),  # 実測値
                    "dimension_2": float(y_pred),  # 予測値
                    "type": data_type,
                }
            )

        return {
            "success": True,
            "session_id": session_id,
            "analysis_type": self.get_analysis_type(),
            "data": {
                "regression_type": results["regression_type"],
                "target_column": results["target_column"],
                "feature_names": results["feature_names"],
                "coefficients": results["coefficients"],
                "intercept": results["intercept"],
                "best_feature": results.get("best_feature"),
                "polynomial_degree": results.get("polynomial_degree"),
                # 評価指標
                "train_r2": results["train_r2"],
                "test_r2": results["test_r2"],
                "train_rmse": results["train_rmse"],
                "test_rmse": results["test_rmse"],
                "train_mae": results["train_mae"],
                "test_mae": results["test_mae"],
                # プロット画像
                "plot_image": plot_base64,
                # 座標データ
                "coordinates": coordinates,
                # 統計情報（他の分析との互換性のため）
                "total_inertia": results["total_inertia"],  # R²値
                "eigenvalues": [results["test_r2"]],  # R²値を固有値として
                "explained_inertia": [results["test_r2"]],
                "cumulative_inertia": [results["test_r2"]],
            },
            "metadata": {
                "session_name": session_name,
                "filename": file.filename,
                "rows": df.shape[0],
                "columns": df.shape[1],
                "n_samples": results["n_samples"],
                "n_features": results["n_features"],
                "test_size": results["test_size"],
                "include_intercept": results["include_intercept"],
            },
        }
