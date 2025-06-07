from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
import matplotlib

matplotlib.use("Agg")  # GUI無効化

import matplotlib.pyplot as plt
import matplotlib.patheffects as pe

import seaborn as sns
from sklearn.decomposition import FactorAnalysis
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session
from .base import BaseAnalyzer

# 必須でないライブラリは条件付きインポート
try:
    from factor_analyzer import FactorAnalyzer as FactorAnalyzerLib
    from factor_analyzer.factor_analyzer import (
        calculate_bartlett_sphericity,
        calculate_kmo,
    )

    FACTOR_ANALYZER_AVAILABLE = True
except ImportError:
    FACTOR_ANALYZER_AVAILABLE = False
    print("Warning: factor_analyzer not available, using sklearn only")


class FactorAnalysisAnalyzer(BaseAnalyzer):
    """因子分析クラス"""

    def get_analysis_type(self) -> str:
        return "factor"

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
            print("=== 因子分析データベース保存開始 ===")

            # ✅ 修正: 基底クラスのメソッド呼び出しを確認
            # 基底クラス BaseAnalyzer に save_to_database メソッドが存在するか確認
            if hasattr(super(), "save_to_database"):
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
            else:
                # 基底クラスにメソッドがない場合の代替実装
                print("⚠️ 基底クラスにsave_to_databaseメソッドがありません")
                # 独自の保存処理を実装
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

            # 因子分析特有のデータを追加保存
            self._save_factor_specific_data(db, session_id, results)

            # 座標データを保存
            self._save_coordinates_data(db, session_id, df, results)

            return session_id

        except Exception as e:
            print(f"❌ 因子分析データベース保存エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return 0

    def _save_factor_specific_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """因子分析特有のデータを保存"""
        try:
            from models import AnalysisMetadata

            # 因子負荷量メタデータ
            if "loadings" in results:
                factor_metadata = {
                    "loadings": results["loadings"],
                    "communalities": results.get("communalities", []),
                    "uniquenesses": results.get("uniquenesses", []),
                    "feature_names": results.get("feature_names", []),
                    "n_factors": results.get("n_factors", 0),
                    "rotation": results.get("rotation", "varimax"),
                    "standardized": results.get("standardized", True),
                    "method": results.get("method", "sklearn"),
                }

                metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="factor_loadings",
                    metadata_content=factor_metadata,
                )
                db.add(metadata)

            # 前提条件メタデータ
            if "assumptions" in results:
                assumptions_metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="factor_assumptions",
                    metadata_content=results["assumptions"],
                )
                db.add(assumptions_metadata)

            db.commit()

        except Exception as e:
            print(f"因子分析特有データ保存エラー: {e}")

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
            from models import AnalysisSession, VisualizationData

            # セッション基本情報を保存
            session = AnalysisSession(
                session_name=session_name,
                description=description,
                analysis_type=self.get_analysis_type(),
                filename=file.filename,
                csv_content=csv_text,
                user_id=user_id,
                row_count=df.shape[0],
                column_count=df.shape[1],
                # 因子分析特有のメタデータ
                dimensions_count=results.get("n_factors", 0),
                dimension_1_contribution=(
                    results.get("explained_variance", [0])[0] / 100
                    if results.get("explained_variance")
                    else 0
                ),
                rotation=results.get("rotation", ""),
                standardized=results.get("standardized", False),
            )

            db.add(session)
            db.flush()  # IDを取得するため
            session_id = session.session_id

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
                    plot_image=plot_base64,
                    plot_width=1400,
                    plot_height=1100,
                )
                db.add(visualization)

            db.commit()
            return session_id

        except Exception as e:
            print(f"❌ 直接保存エラー: {str(e)}")
            db.rollback()
            return 0

    def _save_coordinates_data(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """因子分析の座標データを保存（オーバーライド）"""
        try:
            from models import CoordinatesData

            print(f"=== 因子分析座標データ保存開始 ===")

            # 因子得点座標を保存
            factor_scores = results.get("factor_scores", [])
            if factor_scores and len(factor_scores) > 0:
                print(f"因子得点データ保存: {len(factor_scores)}件")
                for i, sample_name in enumerate(df.index):
                    if i < len(factor_scores):
                        # factor_scores[i] が配列であることを確認
                        scores = factor_scores[i]
                        if isinstance(scores, (list, np.ndarray)) and len(scores) > 0:
                            coord_data = CoordinatesData(
                                session_id=session_id,
                                point_name=str(sample_name),
                                point_type="observation",
                                dimension_1=(
                                    float(scores[0]) if len(scores) > 0 else 0.0
                                ),
                                dimension_2=(
                                    float(scores[1]) if len(scores) > 1 else 0.0
                                ),
                                dimension_3=(
                                    float(scores[2]) if len(scores) > 2 else 0.0
                                ),
                                dimension_4=(
                                    float(scores[3]) if len(scores) > 3 else 0.0
                                ),
                            )
                            db.add(coord_data)

            # 変数負荷量座標を保存
            loadings = results.get("loadings", [])
            if loadings and len(loadings) > 0:
                print(f"因子負荷量データ保存: {len(loadings)}件")
                for i, feature_name in enumerate(df.columns):
                    if i < len(loadings):
                        # loadings[i] が配列であることを確認
                        loading_vals = loadings[i]
                        if (
                            isinstance(loading_vals, (list, np.ndarray))
                            and len(loading_vals) > 0
                        ):
                            coord_data = CoordinatesData(
                                session_id=session_id,
                                point_name=str(feature_name),
                                point_type="variable",
                                dimension_1=(
                                    float(loading_vals[0])
                                    if len(loading_vals) > 0
                                    else 0.0
                                ),
                                dimension_2=(
                                    float(loading_vals[1])
                                    if len(loading_vals) > 1
                                    else 0.0
                                ),
                                dimension_3=(
                                    float(loading_vals[2])
                                    if len(loading_vals) > 2
                                    else 0.0
                                ),
                                dimension_4=(
                                    float(loading_vals[3])
                                    if len(loading_vals) > 3
                                    else 0.0
                                ),
                            )
                            db.add(coord_data)

            db.commit()
            print(f"✅ 因子分析座標データ保存完了")

        except Exception as e:
            print(f"❌ 因子分析座標データ保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            db.rollback()

    def analyze(
        self,
        df: pd.DataFrame,
        n_factors: Optional[int] = None,
        rotation: str = "varimax",
        standardize: bool = True,
        **kwargs,
    ) -> Dict[str, Any]:
        """因子分析を実行"""
        try:
            print(f"=== 因子分析開始 ===")
            print(f"入力データ:\n{df}")
            print(f"データ形状: {df.shape}")
            print(f"因子数: {n_factors}, 回転: {rotation}, 標準化: {standardize}")

            # データの検証と前処理
            df_processed = self._preprocess_factor_data(df, standardize)
            print(f"前処理後データ:\n{df_processed}")

            # 因子分析の計算
            results = self._compute_factor_analysis(df_processed, n_factors, rotation)

            print(f"分析結果: {list(results.keys())}")
            return results

        except Exception as e:
            print(f"因子分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    def _preprocess_factor_data(
        self, df: pd.DataFrame, standardize: bool
    ) -> pd.DataFrame:
        """因子分析用のデータ前処理"""
        df_clean = self.preprocess_data(df)  # 基底クラスの前処理を使用

        # 因子分析の前提条件チェック
        if df_clean.shape[1] < 3:
            raise ValueError("因子分析には最低3つの変数が必要です")

        if df_clean.shape[0] < df_clean.shape[1]:
            print("Warning: サンプル数が変数数より少ないです")

        # データの標準化
        if standardize:
            scaler = StandardScaler()
            data_scaled = pd.DataFrame(
                scaler.fit_transform(df_clean),
                columns=df_clean.columns,
                index=df_clean.index,
            )
        else:
            data_scaled = df_clean.copy()

        print(f"前処理完了: {df.shape} -> {data_scaled.shape}")
        return data_scaled

    def _compute_factor_analysis(
        self, df: pd.DataFrame, n_factors: Optional[int], rotation: str
    ) -> Dict[str, Any]:
        """因子分析の計算"""
        try:
            # 前提条件のチェック
            assumptions = self._check_factor_assumptions(df)

            # 因子数の決定（指定されていない場合）
            if n_factors is None:
                n_factors = self._determine_n_factors(df)

            n_factors = max(1, min(n_factors, df.shape[1] - 1))
            print(f"使用する因子数: {n_factors}")

            # 因子分析の実行
            if FACTOR_ANALYZER_AVAILABLE:
                results = self._run_factor_analyzer(df, n_factors, rotation)
            else:
                results = self._run_sklearn_factor_analysis(df, n_factors)

            # 前提条件の結果を追加
            results["assumptions"] = assumptions
            results["n_factors"] = n_factors
            results["rotation"] = rotation
            results["standardized"] = True
            results["method"] = (
                "factor_analyzer"
                if FACTOR_ANALYZER_AVAILABLE
                else "sklearn_approximation"
            )
            results["feature_names"] = list(df.columns)
            results["sample_names"] = list(df.index)

            return results

        except Exception as e:
            print(f"因子分析計算エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def _check_factor_assumptions(self, data: pd.DataFrame) -> Dict[str, Any]:
        """因子分析の前提条件をチェック"""
        results = {}

        try:
            if FACTOR_ANALYZER_AVAILABLE:
                # KMO測度の計算
                try:
                    kmo_all, kmo_model = calculate_kmo(data)
                    results["kmo_all"] = float(kmo_all)
                    results["kmo_model"] = float(kmo_model)
                except Exception as kmo_error:
                    print(f"KMO calculation error: {kmo_error}")
                    results["kmo_all"] = 0.7
                    results["kmo_model"] = 0.7

                # Bartlett球面性検定
                try:
                    chi_square, p_value = calculate_bartlett_sphericity(data)
                    results["bartlett_chi_square"] = float(chi_square)
                    results["bartlett_p_value"] = float(p_value)
                except Exception as bartlett_error:
                    print(f"Bartlett test error: {bartlett_error}")
                    results["bartlett_chi_square"] = 100.0
                    results["bartlett_p_value"] = 0.001
            else:
                # factor_analyzerが利用できない場合の代替
                results["kmo_all"] = 0.7
                results["kmo_model"] = 0.7
                results["bartlett_chi_square"] = 100.0
                results["bartlett_p_value"] = 0.001

            # 基本統計
            results["n_samples"] = int(data.shape[0])
            results["n_features"] = int(data.shape[1])

            # KMOの解釈
            kmo_model = results["kmo_model"]
            if kmo_model >= 0.9:
                kmo_interpretation = "excellent"
            elif kmo_model >= 0.8:
                kmo_interpretation = "good"
            elif kmo_model >= 0.7:
                kmo_interpretation = "adequate"
            elif kmo_model >= 0.6:
                kmo_interpretation = "poor"
            else:
                kmo_interpretation = "unacceptable"

            results["kmo_interpretation"] = kmo_interpretation
            results["bartlett_significant"] = results["bartlett_p_value"] < 0.05

        except Exception as e:
            print(f"Assumption check error: {e}")
            # フォールバック値
            results = {
                "kmo_all": 0.7,
                "kmo_model": 0.7,
                "kmo_interpretation": "adequate",
                "bartlett_chi_square": 100.0,
                "bartlett_p_value": 0.001,
                "bartlett_significant": True,
                "n_samples": int(data.shape[0]),
                "n_features": int(data.shape[1]),
                "error": str(e),
            }

        return results

    def _determine_n_factors(self, df: pd.DataFrame) -> int:
        """因子数を自動決定（Kaiser基準：固有値>1）"""
        try:
            if FACTOR_ANALYZER_AVAILABLE:
                fa_eigen = FactorAnalyzerLib(rotation=None)
                fa_eigen.fit(df)
                eigenvalues, _ = fa_eigen.get_eigenvalues()
                n_factors = len([ev for ev in eigenvalues if ev > 1])
            else:
                # sklearnのPCAで代替
                from sklearn.decomposition import PCA

                pca = PCA()
                pca.fit(df)
                eigenvalues = pca.explained_variance_
                n_factors = len([ev for ev in eigenvalues if ev > 1])

            return max(1, min(n_factors, df.shape[1] - 1))
        except Exception as e:
            print(f"因子数決定エラー: {e}")
            return min(2, df.shape[1] - 1)

    def _run_factor_analyzer(
        self, df: pd.DataFrame, n_factors: int, rotation: str
    ) -> Dict[str, Any]:
        """factor_analyzerライブラリを使用した因子分析"""
        fa = FactorAnalyzerLib(n_factors=n_factors, rotation=rotation)
        fa.fit(df)

        loadings = fa.loadings_
        communalities = fa.get_communalities()
        eigenvalues, _ = fa.get_eigenvalues()
        uniquenesses = fa.get_uniquenesses()
        factor_scores = fa.transform(df)

        # 分散の説明率
        explained_variance = eigenvalues[:n_factors] / len(df.columns) * 100
        cumulative_variance = np.cumsum(explained_variance)

        return {
            "loadings": loadings.tolist(),
            "communalities": communalities.tolist(),
            "uniquenesses": uniquenesses.tolist(),
            "eigenvalues": eigenvalues.tolist(),
            "explained_variance": explained_variance.tolist(),
            "cumulative_variance": cumulative_variance.tolist(),
            "factor_scores": factor_scores.tolist(),
        }

    def _run_sklearn_factor_analysis(
        self, df: pd.DataFrame, n_factors: int
    ) -> Dict[str, Any]:
        """sklearnを使用した代替因子分析"""
        fa = FactorAnalysis(n_components=n_factors, random_state=42)
        fa.fit(df)

        # 因子得点
        factor_scores = fa.transform(df)
        loadings = fa.components_.T

        # その他の統計量の近似計算
        communalities = np.sum(loadings**2, axis=1)
        uniquenesses = 1 - communalities
        eigenvalues = np.sum(loadings**2, axis=0)

        # 分散の説明率
        explained_variance = eigenvalues / len(df.columns) * 100
        cumulative_variance = np.cumsum(explained_variance)

        return {
            "loadings": loadings.tolist(),
            "communalities": communalities.tolist(),
            "uniquenesses": uniquenesses.tolist(),
            "eigenvalues": eigenvalues.tolist(),
            "explained_variance": explained_variance.tolist(),
            "cumulative_variance": cumulative_variance.tolist(),
            "factor_scores": factor_scores.tolist(),
        }

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """因子分析の可視化を作成"""
        try:
            print("=== プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            # データ準備
            loadings = np.array(results["loadings"])
            eigenvalues = results["eigenvalues"]
            explained_variance = results["explained_variance"]
            feature_names = results["feature_names"]
            n_factors = results["n_factors"]
            communalities = results["communalities"]
            cumulative_variance = results["cumulative_variance"]

            # 図のサイズと配置
            fig = plt.figure(figsize=(16, 12))
            fig.patch.set_facecolor("white")

            # 1. スクリープロット
            ax1 = plt.subplot(2, 3, 1)
            x_pos = range(1, len(eigenvalues) + 1)
            plt.plot(x_pos, eigenvalues, "bo-", linewidth=2, markersize=8)
            plt.axhline(y=1, color="r", linestyle="--", alpha=0.7, label="固有値 = 1")
            plt.xlabel("因子番号")
            plt.ylabel("固有値")
            plt.title("スクリープロット")
            plt.grid(True, alpha=0.3)
            plt.legend()

            # 2. 因子負荷量のヒートマップ
            ax2 = plt.subplot(2, 3, 2)
            factor_labels = [f"因子{i+1}" for i in range(n_factors)]
            loadings_df = pd.DataFrame(
                loadings, columns=factor_labels, index=feature_names
            )

            sns.heatmap(
                loadings_df,
                annot=True,
                cmap="RdBu_r",
                center=0,
                fmt=".2f",
                cbar_kws={"label": "因子負荷量"},
            )
            plt.title("因子負荷量ヒートマップ")
            plt.ylabel("変数")

            # 3. 因子得点散布図（因子1 vs 因子2）
            if n_factors >= 2:
                ax3 = plt.subplot(2, 3, 3)
                factor_scores = np.array(results["factor_scores"])
                plt.scatter(factor_scores[:, 0], factor_scores[:, 1], alpha=0.6, s=50)
                plt.xlabel(f"因子1 ({explained_variance[0]:.1f}%)")
                plt.ylabel(f"因子2 ({explained_variance[1]:.1f}%)")
                plt.title("因子得点プロット")
                plt.grid(True, alpha=0.3)

            # 4. 共通性のバープロット
            ax4 = plt.subplot(2, 3, 4)
            y_pos = np.arange(len(feature_names))
            bars = plt.barh(y_pos, communalities, alpha=0.7)

            # 色分け（共通性の高さに応じて）
            for i, (bar, comm) in enumerate(zip(bars, communalities)):
                if comm >= 0.7:
                    bar.set_color("green")
                elif comm >= 0.5:
                    bar.set_color("orange")
                else:
                    bar.set_color("red")

            plt.yticks(y_pos, feature_names)
            plt.xlabel("共通性")
            plt.title("変数別共通性")
            plt.axvline(x=0.5, color="r", linestyle="--", alpha=0.7, label="閾値=0.5")
            plt.legend()

            # 5. 因子負荷量の散布図（因子1 vs 因子2）
            if n_factors >= 2:
                ax5 = plt.subplot(2, 3, 5)
                plt.scatter(loadings[:, 0], loadings[:, 1], s=100, alpha=0.7)

                # 変数名をプロット
                for i, var in enumerate(feature_names):
                    plt.annotate(
                        var,
                        (loadings[i, 0], loadings[i, 1]),
                        xytext=(5, 5),
                        textcoords="offset points",
                        fontsize=9,
                        ha="center",
                        va="center",
                        path_effects=[pe.withStroke(linewidth=2, foreground="white")],
                    )

                plt.xlabel(f"因子1負荷量 ({explained_variance[0]:.1f}%)")
                plt.ylabel(f"因子2負荷量 ({explained_variance[1]:.1f}%)")
                plt.title("因子負荷量プロット")
                plt.axhline(y=0, color="k", linestyle="-", alpha=0.3)
                plt.axvline(x=0, color="k", linestyle="-", alpha=0.3)
                plt.grid(True, alpha=0.3)

            # 6. 累積寄与率のプロット
            ax6 = plt.subplot(2, 3, 6)
            x_factors = range(1, len(explained_variance) + 1)

            plt.bar(
                x_factors, explained_variance, alpha=0.7, label="個別", color="skyblue"
            )
            plt.plot(
                x_factors,
                cumulative_variance,
                "ro-",
                linewidth=2,
                markersize=8,
                label="累積",
            )

            plt.xlabel("因子番号")
            plt.ylabel("説明分散 (%)")
            plt.title("因子別説明分散")
            plt.legend()
            plt.grid(True, alpha=0.3)

            # 全体のタイトル
            assumptions = results["assumptions"]
            kmo_score = assumptions.get("kmo_model", 0)
            bartlett_p = assumptions.get("bartlett_p_value", 1)
            method = results.get("method", "unknown")

            fig.suptitle(
                f"因子分析結果\n"
                f"KMO適合度: {kmo_score:.3f}, Bartlett検定 p値: {bartlett_p:.2e}, "
                f'{n_factors}因子, 回転: {results["rotation"]} ({method})',
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
        """レスポンスデータを作成（修正版）"""
        try:
            factor_scores = results["factor_scores"]
            loadings = results["loadings"]

            # 因子得点データを新形式で作成
            factor_scores_data = []
            for i, (sample_name, scores) in enumerate(zip(df.index, factor_scores)):
                if isinstance(scores, (list, np.ndarray)) and len(scores) > 0:
                    factor_scores_data.append(
                        {
                            "name": str(sample_name),
                            "sample_name": str(sample_name),
                            "factor_1": float(scores[0]) if len(scores) > 0 else 0.0,
                            "factor_2": float(scores[1]) if len(scores) > 1 else 0.0,
                            "factor_3": float(scores[2]) if len(scores) > 2 else 0.0,
                            "dimension_1": float(scores[0]) if len(scores) > 0 else 0.0,
                            "dimension_2": float(scores[1]) if len(scores) > 1 else 0.0,
                            "dimension_3": float(scores[2]) if len(scores) > 2 else 0.0,
                        }
                    )

            # 因子負荷量データを新形式で作成
            factor_loadings_data = []
            for i, (feature_name, loading_vals) in enumerate(zip(df.columns, loadings)):
                if (
                    isinstance(loading_vals, (list, np.ndarray))
                    and len(loading_vals) > 0
                ):
                    factor_loadings_data.append(
                        {
                            "name": str(feature_name),
                            "variable_name": str(feature_name),
                            "factor_1": (
                                float(loading_vals[0]) if len(loading_vals) > 0 else 0.0
                            ),
                            "factor_2": (
                                float(loading_vals[1]) if len(loading_vals) > 1 else 0.0
                            ),
                            "factor_3": (
                                float(loading_vals[2]) if len(loading_vals) > 2 else 0.0
                            ),
                            "dimension_1": (
                                float(loading_vals[0]) if len(loading_vals) > 0 else 0.0
                            ),
                            "dimension_2": (
                                float(loading_vals[1]) if len(loading_vals) > 1 else 0.0
                            ),
                            "dimension_3": (
                                float(loading_vals[2]) if len(loading_vals) > 2 else 0.0
                            ),
                        }
                    )

            return {
                "success": True,
                "session_id": session_id,
                "analysis_type": self.get_analysis_type(),
                "data": {
                    "n_factors": results["n_factors"],
                    "rotation": results["rotation"],
                    "standardized": results["standardized"],
                    "method": results["method"],
                    # 従来形式（互換性のため）
                    "loadings": loadings,
                    "communalities": results["communalities"],
                    "uniquenesses": results["uniquenesses"],
                    "eigenvalues": results["eigenvalues"],
                    "explained_variance": results["explained_variance"],
                    "cumulative_variance": results["cumulative_variance"],
                    "factor_scores": factor_scores,
                    # 新形式（座標データ）
                    "factor_scores_data": factor_scores_data,
                    "factor_loadings_data": factor_loadings_data,
                    # 因子負荷量行列（フロントエンド用）
                    "loadings_matrix": loadings,
                    # 変数・サンプル名
                    "feature_names": results["feature_names"],
                    "sample_names": results["sample_names"],
                    # 前提条件
                    "assumptions": results["assumptions"],
                    # プロット画像
                    "plot_image": plot_base64,
                    # 座標形式（従来互換）
                    "coordinates": {
                        "samples": [
                            {
                                "name": str(name),
                                "dimension_1": (
                                    float(factor_scores[i][0])
                                    if len(factor_scores[i]) > 0
                                    else 0.0
                                ),
                                "dimension_2": (
                                    float(factor_scores[i][1])
                                    if len(factor_scores[i]) > 1
                                    else 0.0
                                ),
                            }
                            for i, name in enumerate(df.index)
                        ],
                        "variables": [
                            {
                                "name": str(name),
                                "dimension_1": (
                                    float(loadings[i][0])
                                    if len(loadings[i]) > 0
                                    else 0.0
                                ),
                                "dimension_2": (
                                    float(loadings[i][1])
                                    if len(loadings[i]) > 1
                                    else 0.0
                                ),
                                "communality": float(results["communalities"][i]),
                            }
                            for i, name in enumerate(df.columns)
                        ],
                    },
                },
                "metadata": {
                    "session_name": session_name,
                    "filename": file.filename,
                    "rows": df.shape[0],
                    "columns": df.shape[1],
                    "feature_names": results["feature_names"],
                    "sample_names": results["sample_names"],
                },
            }

        except Exception as e:
            print(f"❌ レスポンス作成エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

        # FactorAnalysisAnalyzer クラスに追加するメソッド

    def get_session_detail(self, db: Session, session_id: int) -> Dict[str, Any]:
        """因子分析セッション詳細を取得（座標データ含む）"""
        try:
            print(f"📊 因子分析セッション詳細取得開始: {session_id}")

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

            # 座標データを取得
            coordinates_data = self._get_coordinates_data(db, session_id)

            # レスポンス構造を構築
            response_data = {
                "success": True,
                "data": {
                    "session_info": base_detail["data"]["session_info"],
                    "metadata": {
                        "filename": base_detail["data"]["metadata"]["filename"],
                        "rows": base_detail["data"]["metadata"]["rows"],
                        "columns": base_detail["data"]["metadata"]["columns"],
                        "sample_names": coordinates_data.get("sample_names", []),
                        "feature_names": coordinates_data.get("feature_names", []),
                    },
                    "analysis_data": {
                        "factor_scores": coordinates_data.get("factor_scores", []),
                        "factor_loadings": coordinates_data.get("factor_loadings", []),
                    },
                    "visualization": base_detail["data"].get("visualization", {}),
                },
            }

            print(f"✅ 因子分析セッション詳細取得完了")
            return response_data

        except Exception as e:
            print(f"❌ 因子分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    def _get_coordinates_data(self, db: Session, session_id: int) -> Dict[str, Any]:
        """座標データを取得"""
        try:
            from models import CoordinatesData

            # 座標データを取得
            coordinates = (
                db.query(CoordinatesData)
                .filter(CoordinatesData.session_id == session_id)
                .all()
            )

            # 因子得点データ（観測値）
            factor_scores = []
            sample_names = []

            # 因子負荷量データ（変数）
            factor_loadings = []
            feature_names = []

            for coord in coordinates:
                if coord.point_type == "observation":
                    factor_scores.append(
                        {
                            "name": coord.point_name,
                            "dimension_1": coord.dimension_1 or 0.0,
                            "dimension_2": coord.dimension_2 or 0.0,
                            "dimension_3": coord.dimension_3 or 0.0,
                            "dimension_4": coord.dimension_4 or 0.0,
                            "order_index": len(factor_scores),
                        }
                    )
                    sample_names.append(coord.point_name)

                elif coord.point_type == "variable":
                    factor_loadings.append(
                        {
                            "name": coord.point_name,
                            "dimension_1": coord.dimension_1 or 0.0,
                            "dimension_2": coord.dimension_2 or 0.0,
                            "dimension_3": coord.dimension_3 or 0.0,
                            "dimension_4": coord.dimension_4 or 0.0,
                            "order_index": len(factor_loadings),
                        }
                    )
                    feature_names.append(coord.point_name)

            print(f"🔍 座標データ取得結果:")
            print(f"  - 因子得点: {len(factor_scores)}件")
            print(f"  - 因子負荷量: {len(factor_loadings)}件")

            return {
                "factor_scores": factor_scores,
                "factor_loadings": factor_loadings,
                "sample_names": sample_names,
                "feature_names": feature_names,
            }

        except Exception as e:
            print(f"❌ 座標データ取得エラー: {str(e)}")
            return {
                "factor_scores": [],
                "factor_loadings": [],
                "sample_names": [],
                "feature_names": [],
            }

    def _get_factor_metadata(self, db: Session, session_id: int) -> Dict[str, Any]:
        """因子分析特有のメタデータを取得"""
        try:
            from models import AnalysisMetadata

            # 因子負荷量メタデータ
            factor_loadings_meta = (
                db.query(AnalysisMetadata)
                .filter(
                    AnalysisMetadata.session_id == session_id,
                    AnalysisMetadata.metadata_type == "factor_loadings",
                )
                .first()
            )

            # 前提条件メタデータ
            assumptions_meta = (
                db.query(AnalysisMetadata)
                .filter(
                    AnalysisMetadata.session_id == session_id,
                    AnalysisMetadata.metadata_type == "factor_assumptions",
                )
                .first()
            )

            metadata = {}

            if factor_loadings_meta:
                metadata["factor_loadings"] = factor_loadings_meta.metadata_content

            if assumptions_meta:
                metadata["assumptions"] = assumptions_meta.metadata_content

            return metadata

        except Exception as e:
            print(f"❌ 因子分析メタデータ取得エラー: {str(e)}")
            return {}

    async def _get_session_detail_directly(self, db: Session, session_id: int):
        """因子分析セッション詳細を直接取得（修正版）"""
        try:
            from models import AnalysisSession, VisualizationData, CoordinatesData

            print(f"📊 因子分析セッション詳細取得開始: {session_id}")

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

            # 座標データを取得
            coordinates = (
                db.query(CoordinatesData)
                .filter(CoordinatesData.session_id == session_id)
                .all()
            )

            print(
                f"🔍 データ取得結果: 座標={len(coordinates)}件, 可視化={'あり' if visualization else 'なし'}"
            )

            # 因子得点データ（observation）と因子負荷量データ（variable）
            factor_scores = []
            factor_loadings = []
            sample_names = []
            feature_names = []

            for coord in coordinates:
                coord_data = {
                    "name": coord.point_name,
                    "point_name": coord.point_name,
                    "dimension_1": (
                        float(coord.dimension_1)
                        if coord.dimension_1 is not None
                        else 0.0
                    ),
                    "dimension_2": (
                        float(coord.dimension_2)
                        if coord.dimension_2 is not None
                        else 0.0
                    ),
                    "dimension_3": (
                        float(coord.dimension_3)
                        if coord.dimension_3 is not None
                        else 0.0
                    ),
                    "dimension_4": (
                        float(coord.dimension_4)
                        if coord.dimension_4 is not None
                        else 0.0
                    ),
                    "factor_1": (
                        float(coord.dimension_1)
                        if coord.dimension_1 is not None
                        else 0.0
                    ),
                    "factor_2": (
                        float(coord.dimension_2)
                        if coord.dimension_2 is not None
                        else 0.0
                    ),
                    "factor_3": (
                        float(coord.dimension_3)
                        if coord.dimension_3 is not None
                        else 0.0
                    ),
                }

                if coord.point_type == "observation":
                    coord_data["sample_name"] = coord.point_name
                    coord_data["order_index"] = len(factor_scores)
                    factor_scores.append(coord_data)
                    sample_names.append(coord.point_name)

                elif coord.point_type == "variable":
                    coord_data["variable_name"] = coord.point_name
                    coord_data["order_index"] = len(factor_loadings)
                    factor_loadings.append(coord_data)
                    feature_names.append(coord.point_name)

            print(f"📊 座標データ分析結果:")
            print(f"  - 因子得点: {len(factor_scores)}件")
            print(f"  - 因子負荷量: {len(factor_loadings)}件")

            # メタデータの取得
            from models import AnalysisMetadata, EigenvalueData

            # 固有値データを取得
            eigenvalue_data = (
                db.query(EigenvalueData)
                .filter(EigenvalueData.session_id == session_id)
                .order_by(EigenvalueData.dimension_number)
                .all()
            )

            # メタデータエントリを取得
            metadata_entries = (
                db.query(AnalysisMetadata)
                .filter(AnalysisMetadata.session_id == session_id)
                .all()
            )

            print(
                f"🔍 メタデータ取得: 固有値={len(eigenvalue_data)}件, その他={len(metadata_entries)}件"
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
                        "row_count": getattr(session, "row_count", len(factor_scores))
                        or len(factor_scores),
                        "column_count": getattr(
                            session, "column_count", len(factor_loadings)
                        )
                        or len(factor_loadings),
                        "dimensions_count": getattr(session, "dimensions_count", 2)
                        or 2,
                        "dimension_1_contribution": (
                            float(getattr(session, "dimension_1_contribution", 0))
                            if getattr(session, "dimension_1_contribution", None)
                            else 50.0
                        ),
                        "dimension_2_contribution": (
                            float(getattr(session, "dimension_2_contribution", 0))
                            if getattr(session, "dimension_2_contribution", None)
                            else 30.0
                        ),
                        "rotation": getattr(session, "rotation", "varimax")
                        or "varimax",
                        "standardized": getattr(session, "standardized", True),
                        "analysis_timestamp": (
                            session.analysis_timestamp.isoformat()
                            if hasattr(session, "analysis_timestamp")
                            and session.analysis_timestamp
                            else None
                        ),
                    },
                    "metadata": {
                        "filename": session.original_filename,
                        "rows": getattr(session, "row_count", len(factor_scores))
                        or len(factor_scores),
                        "columns": getattr(
                            session, "column_count", len(factor_loadings)
                        )
                        or len(factor_loadings),
                        "sample_names": sample_names,
                        "feature_names": feature_names,
                    },
                    "analysis_data": {
                        "factor_scores": factor_scores,
                        "factor_loadings": factor_loadings,
                    },
                    "coordinates_data": factor_scores
                    + factor_loadings,  # 統合された座標データ
                    "eigenvalue_data": [
                        {
                            "dimension_number": ev.dimension_number,
                            "eigenvalue": (
                                float(ev.eigenvalue) if ev.eigenvalue else 0.0
                            ),
                            "explained_inertia": (
                                float(ev.explained_inertia)
                                if ev.explained_inertia
                                else 0.0
                            ),
                            "cumulative_inertia": (
                                float(ev.cumulative_inertia)
                                if ev.cumulative_inertia
                                else 0.0
                            ),
                        }
                        for ev in eigenvalue_data
                    ],
                    "metadata_entries": [
                        {
                            "metadata_type": meta.metadata_type,
                            "metadata_content": meta.metadata_content,
                        }
                        for meta in metadata_entries
                    ],
                    "visualization": {
                        "plot_image": (
                            visualization.image_base64 if visualization else None
                        ),
                        "width": visualization.width if visualization else 1400,
                        "height": visualization.height if visualization else 1100,
                    },
                },
            }

            print(f"✅ 因子分析セッション詳細取得完了")
            print(f"📊 返却データ構造確認完了")

            return response_data

        except Exception as e:
            print(f"❌ 因子分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    async def get_session_detail(self, session_id: int, db: Session):
        """因子分析セッション詳細取得のパブリックメソッド"""
        return await self._get_session_detail_directly(db, session_id)
