from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import io
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session  # ← この行を追加
from .base import BaseAnalyzer


class PCAAnalyzer(BaseAnalyzer):
    """主成分分析クラス"""

    def get_analysis_type(self) -> str:
        return "pca"

    # 既存のメソッドは変更なし
    def analyze(
        self,
        df: pd.DataFrame,
        n_components: int = 2,
        standardize: bool = True,
        **kwargs,
    ) -> Dict[str, Any]:
        """主成分分析を実行"""
        try:
            print(f"=== PCA分析開始 ===")
            print(f"入力データ:\n{df.head()}")
            print(f"データ形状: {df.shape}")
            print(f"標準化: {standardize}")

            # データの前処理
            df_processed = self._preprocess_pca_data(df)
            print(f"前処理後データ形状: {df_processed.shape}")

            # PCA分析の実行
            results = self._compute_pca(df_processed, n_components, standardize)

            print(f"PCA分析結果: {list(results.keys())}")
            return results

        except Exception as e:
            print(f"PCA分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    def _preprocess_pca_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """PCA用のデータ前処理"""
        df_clean = self.preprocess_data(df)  # 基底クラスの前処理を使用

        # 定数列の除去
        for col in df_clean.columns:
            if df_clean[col].std() == 0:
                print(f"警告: 定数列 '{col}' を除去します")
                df_clean = df_clean.drop(columns=[col])

        if df_clean.empty or df_clean.shape[1] < 2:
            raise ValueError(
                "有効なデータが不足しています（最低2列の数値データが必要）"
            )

        print(f"前処理: {df.shape} -> {df_clean.shape}")
        return df_clean

    def _compute_pca(
        self, df: pd.DataFrame, n_components: int, standardize: bool
    ) -> Dict[str, Any]:
        """主成分分析の計算"""
        try:
            # データの準備
            X = df.values
            feature_names = df.columns.tolist()
            sample_names = df.index.tolist()

            # 標準化
            scaler = None
            if standardize:
                scaler = StandardScaler()
                X_scaled = scaler.fit_transform(X)
                print("データを標準化しました")
            else:
                X_scaled = X
                print("標準化をスキップしました")

            # 次元数の調整
            max_components = min(X_scaled.shape[0], X_scaled.shape[1])
            n_components = min(n_components, max_components)
            print(f"使用する主成分数: {n_components}")

            # PCA実行
            pca = PCA(n_components=n_components)
            X_pca = pca.fit_transform(X_scaled)

            # 寄与率の計算
            explained_variance_ratio = pca.explained_variance_ratio_
            cumulative_variance_ratio = np.cumsum(explained_variance_ratio)

            # 主成分得点
            component_scores = X_pca

            # 主成分負荷量
            if standardize:
                # 標準化した場合の負荷量
                loadings = pca.components_.T * np.sqrt(pca.explained_variance_)
            else:
                # 標準化しない場合の負荷量
                loadings = pca.components_.T

            # 統計的検定（Bartlett球面性検定の近似）
            correlation_matrix = np.corrcoef(X_scaled.T)
            det_corr = np.linalg.det(correlation_matrix)

            # Kaiser-Meyer-Olkin (KMO) 標本妥当性の測度の簡易計算
            kmo_value = self._calculate_kmo(correlation_matrix)

            # 次元が不足している場合はゼロパディング
            if n_components == 1:
                component_scores = np.column_stack(
                    [component_scores, np.zeros(component_scores.shape[0])]
                )
                loadings = np.column_stack([loadings, np.zeros(loadings.shape[0])])

            results = {
                "n_components": n_components,
                "n_samples": X_scaled.shape[0],
                "n_features": X_scaled.shape[1],
                "standardized": standardize,
                "explained_variance_ratio": explained_variance_ratio.tolist(),
                "cumulative_variance_ratio": cumulative_variance_ratio.tolist(),
                "eigenvalues": pca.explained_variance_.tolist(),
                "component_scores": component_scores,
                "loadings": loadings,
                "feature_names": feature_names,
                "sample_names": sample_names,
                "kmo": float(kmo_value),
                "determinant": float(det_corr),
                "total_inertia": float(cumulative_variance_ratio[-1]),  # 総寄与率
            }

            return results

        except Exception as e:
            print(f"PCA計算エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def _calculate_kmo(self, correlation_matrix):
        """KMO標本妥当性の測度を計算"""
        try:
            corr_inv = np.linalg.inv(correlation_matrix)
            numer_sum = 0
            denom_sum = 0

            for i in range(correlation_matrix.shape[0]):
                for j in range(correlation_matrix.shape[1]):
                    if i != j:
                        numer_sum += correlation_matrix[i, j] ** 2
                        denom_sum += correlation_matrix[i, j] ** 2 + corr_inv[i, j] ** 2

            if denom_sum == 0:
                return 0.5

            kmo = numer_sum / denom_sum
            return max(0, min(1, kmo))  # 0-1の範囲に制限
        except:
            return 0.5  # デフォルト値

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """PCAプロットの作成"""
        try:
            print("=== PCAプロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            component_scores = results["component_scores"]
            loadings = results["loadings"]
            explained_variance_ratio = results["explained_variance_ratio"]
            feature_names = results["feature_names"]
            sample_names = results["sample_names"]

            # サブプロットの作成
            fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
            fig.patch.set_facecolor("white")

            # 1. スコアプロット（第1-2主成分）
            scatter = ax1.scatter(
                component_scores[:, 0],
                component_scores[:, 1],
                c="#2E86AB",
                s=80,
                alpha=0.7,
                edgecolors="white",
                linewidths=0.5,
            )

            # サンプルラベル
            for i, name in enumerate(sample_names):
                ax1.annotate(
                    str(name),
                    (component_scores[i, 0], component_scores[i, 1]),
                    xytext=(3, 3),
                    textcoords="offset points",
                    fontsize=9,
                    alpha=0.8,
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                )

            ax1.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
            ax1.axvline(x=0, color="gray", linestyle="--", alpha=0.5)
            ax1.set_xlabel(
                f"第1主成分 ({explained_variance_ratio[0]*100:.1f}%)",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax1.set_ylabel(
                f"第2主成分 ({explained_variance_ratio[1]*100:.1f}%)",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax1.set_title(
                "主成分得点プロット",
                fontweight="bold",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax1.grid(True, alpha=0.3)

            # 2. ローディングプロット
            if loadings.shape[0] >= 2:  # 特徴量が2つ以上ある場合
                for i, name in enumerate(feature_names):
                    ax2.arrow(
                        0,
                        0,
                        loadings[i, 0],
                        loadings[i, 1],
                        head_width=0.03,
                        head_length=0.03,
                        fc="#A23B72",
                        ec="#A23B72",
                    )
                    ax2.text(
                        loadings[i, 0] * 1.1,
                        loadings[i, 1] * 1.1,
                        name,
                        fontsize=10,
                        ha="center",
                        va="center",
                        bbox=dict(
                            boxstyle="round,pad=0.3", facecolor="white", alpha=0.8
                        ),
                        fontfamily=[
                            "IPAexGothic",
                            "IPAGothic",
                            "DejaVu Sans",
                            "sans-serif",
                        ],
                    )

            ax2.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
            ax2.axvline(x=0, color="gray", linestyle="--", alpha=0.5)
            ax2.set_xlabel(
                f"第1主成分負荷量",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax2.set_ylabel(
                f"第2主成分負荷量",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax2.set_title(
                "主成分負荷量プロット",
                fontweight="bold",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax2.grid(True, alpha=0.3)

            # 軸の範囲を調整
            max_loading = (
                np.max(np.abs(loadings[:, :2])) if loadings.shape[0] > 0 else 1
            )
            ax2.set_xlim(-max_loading * 1.2, max_loading * 1.2)
            ax2.set_ylim(-max_loading * 1.2, max_loading * 1.2)

            # 3. 寄与率プロット
            pc_numbers = range(1, len(explained_variance_ratio) + 1)
            bars = ax3.bar(
                pc_numbers,
                np.array(explained_variance_ratio) * 100,
                color="#2E86AB",
                alpha=0.7,
                edgecolor="white",
                linewidth=0.5,
            )

            # 累積寄与率の線グラフ
            ax3_twin = ax3.twinx()
            ax3_twin.plot(
                pc_numbers,
                np.array(results["cumulative_variance_ratio"]) * 100,
                "o-",
                color="#A23B72",
                linewidth=2,
                markersize=6,
            )
            ax3_twin.set_ylabel(
                "累積寄与率 (%)",
                color="#A23B72",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3_twin.tick_params(axis="y", labelcolor="#A23B72")

            ax3.set_xlabel(
                "主成分",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_ylabel(
                "寄与率 (%)",
                color="#2E86AB",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.set_title(
                "主成分の寄与率",
                fontweight="bold",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )
            ax3.tick_params(axis="y", labelcolor="#2E86AB")
            ax3.grid(True, alpha=0.3)

            # バーの上に数値を表示
            for i, (pc, var_ratio) in enumerate(
                zip(pc_numbers, explained_variance_ratio)
            ):
                ax3.text(
                    pc,
                    var_ratio * 100 + 1,
                    f"{var_ratio*100:.1f}%",
                    ha="center",
                    va="bottom",
                    fontsize=9,
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                )

            # 4. 情報パネル
            ax4.axis("off")
            info_text = f"""主成分分析結果サマリー

データサイズ: {results['n_samples']} × {results['n_features']}
使用主成分数: {results['n_components']}
標準化: {'あり' if results['standardized'] else 'なし'}

第1-2主成分累積寄与率: {results['cumulative_variance_ratio'][1]*100:.1f}%
KMO標本妥当性: {results['kmo']:.3f}
相関行列式: {results['determinant']:.6f}

固有値:
""" + "\n".join(
                [
                    f"第{i+1}主成分: {ev:.3f}"
                    for i, ev in enumerate(results["eigenvalues"])
                ]
            )

            ax4.text(
                0.05,
                0.95,
                info_text,
                transform=ax4.transAxes,
                fontsize=11,
                verticalalignment="top",
                bbox=dict(boxstyle="round,pad=0.5", facecolor="#f8f9fa", alpha=0.8),
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )

            # KMO判定基準の追加
            kmo_interpretation = ""
            kmo = results["kmo"]
            if kmo >= 0.9:
                kmo_interpretation = "非常に良い"
            elif kmo >= 0.8:
                kmo_interpretation = "良い"
            elif kmo >= 0.7:
                kmo_interpretation = "まあまあ"
            elif kmo >= 0.6:
                kmo_interpretation = "平凡"
            else:
                kmo_interpretation = "悪い"

            ax4.text(
                0.05,
                0.3,
                f"KMO判定: {kmo_interpretation}",
                transform=ax4.transAxes,
                fontsize=12,
                fontweight="bold",
                color="green" if kmo >= 0.7 else "orange" if kmo >= 0.6 else "red",
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )

            plt.tight_layout()

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"PCAプロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

    def _save_coordinates_data(
        self, db, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """PCA特有の座標データ保存"""
        from models import CoordinatesData

        try:
            component_scores = results.get("component_scores")
            loadings = results.get("loadings")
            sample_names = results.get("sample_names", df.index.tolist())
            feature_names = results.get("feature_names", df.columns.tolist())

            # 主成分得点の保存（観測値として）
            if component_scores is not None:
                for i, name in enumerate(sample_names):
                    coord_data = CoordinatesData(
                        session_id=session_id,
                        point_name=str(name),
                        point_type="observation",  # PCA用の観測値
                        dimension_1=(
                            float(component_scores[i, 0])
                            if component_scores.shape[1] > 0
                            else 0.0
                        ),
                        dimension_2=(
                            float(component_scores[i, 1])
                            if component_scores.shape[1] > 1
                            else 0.0
                        ),
                    )
                    db.add(coord_data)

            # 主成分負荷量の保存（変数として）
            if loadings is not None:
                for i, name in enumerate(feature_names):
                    coord_data = CoordinatesData(
                        session_id=session_id,
                        point_name=str(name),
                        point_type="variable",  # PCA用の変数
                        dimension_1=(
                            float(loadings[i, 0]) if loadings.shape[1] > 0 else 0.0
                        ),
                        dimension_2=(
                            float(loadings[i, 1]) if loadings.shape[1] > 1 else 0.0
                        ),
                    )
                    db.add(coord_data)
        except Exception as e:
            print(f"PCA座標データ保存エラー: {e}")

    def create_response(
        self,
        results: Dict[str, Any],
        df: pd.DataFrame,
        session_id: int,
        session_name: str,
        file,
        plot_base64: str,
    ) -> Dict[str, Any]:
        """レスポンスデータを作成（JSON serializable対応版）"""
        try:
            component_scores = results["component_scores"]
            loadings = results["loadings"]

            # numpy配列をリストに変換する関数
            def ensure_serializable(obj):
                if isinstance(obj, np.ndarray):
                    return obj.tolist()
                elif isinstance(obj, np.integer):
                    return int(obj)
                elif isinstance(obj, np.floating):
                    return float(obj)
                elif isinstance(obj, list):
                    return [ensure_serializable(item) for item in obj]
                elif isinstance(obj, dict):
                    return {k: ensure_serializable(v) for k, v in obj.items()}
                else:
                    return obj

            # 主成分得点データを新形式で作成（serializable版）
            component_scores_data = []
            for i, (sample_name, scores) in enumerate(zip(df.index, component_scores)):
                if isinstance(scores, (list, np.ndarray)) and len(scores) > 0:
                    scores_list = ensure_serializable(scores)
                    component_scores_data.append(
                        {
                            "name": str(sample_name),
                            "sample_name": str(sample_name),
                            "pc_1": (
                                float(scores_list[0]) if len(scores_list) > 0 else 0.0
                            ),
                            "pc_2": (
                                float(scores_list[1]) if len(scores_list) > 1 else 0.0
                            ),
                            "pc_3": (
                                float(scores_list[2]) if len(scores_list) > 2 else 0.0
                            ),
                            "dimension_1": (
                                float(scores_list[0]) if len(scores_list) > 0 else 0.0
                            ),
                            "dimension_2": (
                                float(scores_list[1]) if len(scores_list) > 1 else 0.0
                            ),
                            "dimension_3": (
                                float(scores_list[2]) if len(scores_list) > 2 else 0.0
                            ),
                        }
                    )

            # 主成分負荷量データを新形式で作成（serializable版）
            component_loadings_data = []
            for i, (feature_name, loading_vals) in enumerate(zip(df.columns, loadings)):
                if (
                    isinstance(loading_vals, (list, np.ndarray))
                    and len(loading_vals) > 0
                ):
                    loading_list = ensure_serializable(loading_vals)
                    component_loadings_data.append(
                        {
                            "name": str(feature_name),
                            "variable_name": str(feature_name),
                            "pc_1": (
                                float(loading_list[0]) if len(loading_list) > 0 else 0.0
                            ),
                            "pc_2": (
                                float(loading_list[1]) if len(loading_list) > 1 else 0.0
                            ),
                            "pc_3": (
                                float(loading_list[2]) if len(loading_list) > 2 else 0.0
                            ),
                            "dimension_1": (
                                float(loading_list[0]) if len(loading_list) > 0 else 0.0
                            ),
                            "dimension_2": (
                                float(loading_list[1]) if len(loading_list) > 1 else 0.0
                            ),
                            "dimension_3": (
                                float(loading_list[2]) if len(loading_list) > 2 else 0.0
                            ),
                        }
                    )

            # 全てのnumpy配列をserializable形式に変換
            serializable_results = ensure_serializable(results)

            return {
                "success": True,
                "session_id": int(session_id),
                "analysis_type": self.get_analysis_type(),
                "data": {
                    "n_components": int(serializable_results["n_components"]),
                    "standardized": bool(serializable_results["standardized"]),
                    # 従来形式（互換性のため）- serializable版
                    "loadings": ensure_serializable(loadings),
                    "eigenvalues": ensure_serializable(
                        serializable_results["eigenvalues"]
                    ),
                    "explained_variance_ratio": ensure_serializable(
                        serializable_results["explained_variance_ratio"]
                    ),
                    "cumulative_variance_ratio": ensure_serializable(
                        serializable_results["cumulative_variance_ratio"]
                    ),
                    "component_scores": ensure_serializable(component_scores),
                    # 新形式（座標データ）
                    "component_scores_data": component_scores_data,
                    "component_loadings_data": component_loadings_data,
                    # 主成分負荷量行列（フロントエンド用）
                    "loadings_matrix": ensure_serializable(loadings),
                    # 変数・サンプル名
                    "feature_names": [
                        str(x) for x in serializable_results["feature_names"]
                    ],
                    "sample_names": [
                        str(x) for x in serializable_results["sample_names"]
                    ],
                    # 統計値
                    "kmo": float(serializable_results.get("kmo", 0.0)),
                    "determinant": float(serializable_results.get("determinant", 0.0)),
                    # プロット画像
                    "plot_image": str(plot_base64),
                    # 座標形式（従来互換）- serializable版
                    "coordinates": {
                        "scores": [
                            {
                                "name": str(name),
                                "dimension_1": (
                                    float(ensure_serializable(component_scores[i])[0])
                                    if len(ensure_serializable(component_scores[i])) > 0
                                    else 0.0
                                ),
                                "dimension_2": (
                                    float(ensure_serializable(component_scores[i])[1])
                                    if len(ensure_serializable(component_scores[i])) > 1
                                    else 0.0
                                ),
                            }
                            for i, name in enumerate(df.index)
                        ],
                        "loadings": [
                            {
                                "name": str(name),
                                "dimension_1": (
                                    float(ensure_serializable(loadings[i])[0])
                                    if len(ensure_serializable(loadings[i])) > 0
                                    else 0.0
                                ),
                                "dimension_2": (
                                    float(ensure_serializable(loadings[i])[1])
                                    if len(ensure_serializable(loadings[i])) > 1
                                    else 0.0
                                ),
                            }
                            for i, name in enumerate(df.columns)
                        ],
                    },
                },
                "metadata": {
                    "session_name": str(session_name),
                    "filename": str(file.filename),
                    "rows": int(df.shape[0]),
                    "columns": int(df.shape[1]),
                    "feature_names": [
                        str(x) for x in serializable_results["feature_names"]
                    ],
                    "sample_names": [
                        str(x) for x in serializable_results["sample_names"]
                    ],
                },
            }

        except Exception as e:
            print(f"❌ レスポンス作成エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
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
        """データベース保存処理（factor形式に合わせて修正）"""
        try:
            print("=== PCA データベース保存開始 ===")

            # 基底クラスのメソッドを呼び出し
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
                # 基底クラスにメソッドがない場合の直接保存
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

            # PCA特有のデータを追加保存
            self._save_pca_specific_data(db, session_id, results)

            # 座標データを保存
            self._save_coordinates_data(db, session_id, df, results)

            return session_id

        except Exception as e:
            print(f"❌ PCA データベース保存エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return 0

    def _save_pca_specific_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """PCA特有のデータを保存"""
        try:
            from models import AnalysisMetadata

            # 主成分負荷量メタデータ
            if "loadings" in results:
                pca_metadata = {
                    "loadings": results["loadings"],
                    "feature_names": results.get("feature_names", []),
                    "sample_names": results.get("sample_names", []),
                    "n_components": results.get("n_components", 0),
                    "standardized": results.get("standardized", True),
                }

                metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="pca_loadings",
                    metadata_content=pca_metadata,
                )
                db.add(metadata)

            # KMO統計メタデータ
            if "kmo" in results:
                kmo_metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="pca_statistics",
                    metadata_content={
                        "kmo": results["kmo"],
                        "determinant": results.get("determinant", 0),
                        "total_inertia": results.get("total_inertia", 0),
                    },
                )
                db.add(kmo_metadata)

            db.commit()

        except Exception as e:
            print(f"PCA特有データ保存エラー: {e}")

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
                # PCA特有のメタデータ
                dimensions_count=results.get("n_components", 0),
                dimension_1_contribution=(
                    results.get("explained_variance_ratio", [0])[0]
                    if results.get("explained_variance_ratio")
                    else 0
                ),
                dimension_2_contribution=(
                    results.get("explained_variance_ratio", [0, 0])[1]
                    if len(results.get("explained_variance_ratio", [])) > 1
                    else 0
                ),
                standardized=results.get("standardized", False),
            )

            db.add(session)
            db.flush()  # IDを取得するため
            session_id = session.session_id

            # タグを保存
            if tags:
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
                    plot_width=1600,
                    plot_height=1200,
                )
                db.add(visualization)

            db.commit()
            return session_id

        except Exception as e:
            print(f"❌ 直接保存エラー: {str(e)}")
            db.rollback()
            return 0

    async def get_session_detail(self, session_id: int, db: Session):
        """PCAセッション詳細を取得"""
        try:
            print(f"📊 PCA セッション詳細取得開始: {session_id}")

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

            return base_detail

        except Exception as e:
            print(f"❌ PCA セッション詳細取得エラー: {str(e)}")
            return {"success": False, "error": str(e)}

    async def _get_session_detail_directly(self, db: Session, session_id: int):
        """PCAセッション詳細を直接取得"""
        try:
            from models import (
                AnalysisSession,
                VisualizationData,
                CoordinatesData,
                EigenvalueData,
                AnalysisMetadata,
            )

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

            # 主成分得点データ（observation）と主成分負荷量データ（variable）
            component_scores = []
            component_loadings = []
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
                    "pc_1": (
                        float(coord.dimension_1)
                        if coord.dimension_1 is not None
                        else 0.0
                    ),
                    "pc_2": (
                        float(coord.dimension_2)
                        if coord.dimension_2 is not None
                        else 0.0
                    ),
                    "pc_3": (
                        float(coord.dimension_3)
                        if coord.dimension_3 is not None
                        else 0.0
                    ),
                }

                if coord.point_type == "observation":
                    coord_data["sample_name"] = coord.point_name
                    coord_data["order_index"] = len(component_scores)
                    component_scores.append(coord_data)
                    sample_names.append(coord.point_name)

                elif coord.point_type == "variable":
                    coord_data["variable_name"] = coord.point_name
                    coord_data["order_index"] = len(component_loadings)
                    component_loadings.append(coord_data)
                    feature_names.append(coord.point_name)

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
                            session, "row_count", len(component_scores)
                        )
                        or len(component_scores),
                        "column_count": getattr(
                            session, "column_count", len(component_loadings)
                        )
                        or len(component_loadings),
                        "dimensions_count": getattr(session, "dimensions_count", 2)
                        or 2,
                        "dimension_1_contribution": (
                            float(getattr(session, "dimension_1_contribution", 0))
                            if getattr(session, "dimension_1_contribution", None)
                            else 0.0
                        ),
                        "dimension_2_contribution": (
                            float(getattr(session, "dimension_2_contribution", 0))
                            if getattr(session, "dimension_2_contribution", None)
                            else 0.0
                        ),
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
                        "rows": getattr(session, "row_count", len(component_scores))
                        or len(component_scores),
                        "columns": getattr(
                            session, "column_count", len(component_loadings)
                        )
                        or len(component_loadings),
                        "sample_names": sample_names,
                        "feature_names": feature_names,
                    },
                    "analysis_data": {
                        "component_scores": component_scores,
                        "component_loadings": component_loadings,
                    },
                    "coordinates_data": component_scores
                    + component_loadings,  # 統合された座標データ
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
                        "width": visualization.width if visualization else 1600,
                        "height": visualization.height if visualization else 1200,
                    },
                },
            }

            print(f"✅ PCA セッション詳細取得完了")
            return response_data

        except Exception as e:
            print(f"❌ PCA セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}
