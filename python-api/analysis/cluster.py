# python-api/analysis/cluster.py
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    silhouette_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_samples,
)
from sklearn.decomposition import PCA
from scipy.cluster.hierarchy import dendrogram, linkage
from scipy.spatial.distance import pdist
import seaborn as sns
from .base import BaseAnalyzer


# 簡易版のコンストラクタ（必要に応じて）
def __init__(self):
    """ClusterAnalyzerのコンストラクタ"""
    super().__init__()
    print("ClusterAnalyzer初期化完了")


class ClusterAnalyzer(BaseAnalyzer):
    """クラスター解析クラス"""

    def get_analysis_type(self) -> str:
        return "cluster"

    def analyze(
        self,
        df: pd.DataFrame,
        method: str = "kmeans",
        n_clusters: int = 3,
        standardize: bool = True,
        **kwargs,
    ) -> Dict[str, Any]:
        """クラスター解析を実行"""
        try:
            print(f"=== クラスター分析開始 ===")
            print(f"入力データ:\n{df}")
            print(f"データ形状: {df.shape}")
            print(f"手法: {method}, クラスター数: {n_clusters}, 標準化: {standardize}")

            # データの検証と前処理
            df_processed = self._preprocess_cluster_data(df, standardize)
            print(f"前処理後データ:\n{df_processed}")

            # クラスター分析の計算
            results = self._compute_cluster_analysis(
                df_processed, method, n_clusters, **kwargs
            )

            # 元のデータフレームとの対応を保持
            results["original_data"] = df
            results["processed_data"] = df_processed

            print(f"分析結果: {list(results.keys())}")
            return results

        except Exception as e:
            print(f"分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    def _preprocess_cluster_data(
        self, df: pd.DataFrame, standardize: bool = True
    ) -> pd.DataFrame:
        """クラスター分析用のデータ前処理"""
        df_clean = self.preprocess_data(df)  # 基底クラスの前処理を使用

        # 数値データのみを抽出
        numeric_cols = df_clean.select_dtypes(include=[np.number]).columns
        if len(numeric_cols) == 0:
            raise ValueError("数値データが見つかりません")

        df_numeric = df_clean[numeric_cols]

        # 標準化
        if standardize:
            scaler = StandardScaler()
            df_scaled = pd.DataFrame(
                scaler.fit_transform(df_numeric),
                index=df_numeric.index,
                columns=df_numeric.columns,
            )
            print(f"データを標準化しました: {df_numeric.shape} -> {df_scaled.shape}")
            return df_scaled

        return df_numeric

    def _compute_cluster_analysis(
        self, df: pd.DataFrame, method: str, n_clusters: int, **kwargs
    ) -> Dict[str, Any]:
        """修正版クラスター分析の計算"""
        try:
            print(f"クラスター分析計算開始: method={method}, n_clusters={n_clusters}")
            print(f"データ形状: {df.shape}")

            # クラスタリングアルゴリズムの実行
            if method == "kmeans":
                cluster_result = self._compute_kmeans(df, n_clusters, **kwargs)
            elif method == "hierarchical":
                cluster_result = self._compute_hierarchical_fixed(
                    df, n_clusters, **kwargs
                )  # 修正版を使用
            elif method == "dbscan":
                cluster_result = self._compute_dbscan(df, **kwargs)
                n_clusters = len(np.unique(cluster_result["labels"]))
            else:
                raise ValueError(f"サポートされていない手法です: {method}")

            labels = cluster_result["labels"]
            centers = cluster_result.get("centers", None)
            dendrogram_data = cluster_result.get("dendrogram_data", None)

            print(f"クラスタリング完了: {len(np.unique(labels))} クラスター")
            print(
                f"デンドログラムデータ: {'有' if dendrogram_data is not None else '無'}"
            )

            # クラスター評価指標の計算
            evaluation_metrics = self._compute_evaluation_metrics(df, labels)

            # 主成分分析による次元削減（可視化用）
            pca_result = self._compute_pca_for_visualization(df)

            # 結果の整理
            results = {
                "method": method,
                "n_clusters": n_clusters,
                "labels": labels.tolist(),
                "cluster_centers": centers.tolist() if centers is not None else None,
                "evaluation_metrics": evaluation_metrics,
                "pca_coordinates": pca_result["coordinates"],
                "pca_explained_variance_ratio": pca_result["explained_variance_ratio"],
                "pca_components": pca_result["components"],
                "cluster_sizes": [int(np.sum(labels == i)) for i in range(n_clusters)],
                "sample_names": df.index.tolist(),
                "feature_names": df.columns.tolist(),
                "eigenvalues": pca_result["explained_variance_ratio"],
                "explained_inertia": pca_result["explained_variance_ratio"],
                "cumulative_inertia": np.cumsum(
                    pca_result["explained_variance_ratio"]
                ).tolist(),
                "total_inertia": float(np.sum(pca_result["explained_variance_ratio"])),
            }

            # 階層クラスタリングの場合はデンドログラムデータを追加
            if method == "hierarchical":
                results["dendrogram_data"] = dendrogram_data

            return results

        except Exception as e:
            print(f"計算エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def _compute_kmeans(
        self, df: pd.DataFrame, n_clusters: int, **kwargs
    ) -> Dict[str, Any]:
        """K-meansクラスタリング"""
        random_state = kwargs.get("random_state", 42)
        max_iter = kwargs.get("max_iter", 300)

        kmeans = KMeans(
            n_clusters=n_clusters,
            random_state=random_state,
            max_iter=max_iter,
            n_init=10,
        )
        labels = kmeans.fit_predict(df)

        return {
            "labels": labels,
            "centers": kmeans.cluster_centers_,
            "inertia": kmeans.inertia_,
        }

    def _compute_hierarchical_fixed(
        self, df: pd.DataFrame, n_clusters: int, **kwargs
    ) -> Dict[str, Any]:
        """修正版階層クラスタリング - デンドログラム安定化"""
        linkage_method = kwargs.get("linkage", "ward")

        try:
            print(f"階層クラスタリング開始: method={linkage_method}, samples={len(df)}")

            # 階層クラスタリング実行
            from sklearn.cluster import AgglomerativeClustering

            clustering = AgglomerativeClustering(
                n_clusters=n_clusters, linkage=linkage_method
            )
            labels = clustering.fit_predict(df)
            print(f"sklearn clustering完了: {len(np.unique(labels))} クラスター")

            # デンドログラム用のリンケージ行列を計算
            linkage_matrix = None

            try:
                # サンプル数チェック
                n_samples = len(df)

                if n_samples > 150:
                    print(
                        f"サンプル数が多すぎます({n_samples})。デンドログラム計算をスキップ。"
                    )
                    linkage_matrix = None
                else:
                    from scipy.cluster.hierarchy import linkage
                    from scipy.spatial.distance import pdist
                    import numpy as np

                    # データ型の確認と修正
                    data_array = df.values.astype(np.float64)
                    print(
                        f"データ配列形状: {data_array.shape}, dtype: {data_array.dtype}"
                    )

                    # NaNや無限値のチェック
                    if np.any(np.isnan(data_array)) or np.any(np.isinf(data_array)):
                        print("NaNまたは無限値を検出。データをクリーニングします。")
                        data_array = np.nan_to_num(
                            data_array, nan=0.0, posinf=1e10, neginf=-1e10
                        )

                    # リンケージ計算
                    if linkage_method == "ward":
                        print("Ward法でリンケージ計算中...")
                        linkage_matrix = linkage(
                            data_array, method="ward", metric="euclidean"
                        )
                    else:
                        print(f"{linkage_method}法でリンケージ計算中...")
                        # 距離行列を事前計算
                        distances = pdist(data_array, metric="euclidean")

                        # 距離に問題がないかチェック
                        if np.any(np.isnan(distances)) or np.any(np.isinf(distances)):
                            print(
                                "距離計算に問題があります。ユークリッド距離を再計算します。"
                            )
                            distances = np.nan_to_num(
                                distances, nan=1.0, posinf=1e10, neginf=0.0
                            )

                        linkage_matrix = linkage(distances, method=linkage_method)

                    print(f"リンケージ行列計算完了: {linkage_matrix.shape}")

                    # リンケージ行列の妥当性チェック
                    if linkage_matrix is not None:
                        if np.any(np.isnan(linkage_matrix)) or np.any(
                            np.isinf(linkage_matrix)
                        ):
                            print(
                                "リンケージ行列に無効な値があります。None に設定します。"
                            )
                            linkage_matrix = None
                        elif linkage_matrix.shape[0] != n_samples - 1:
                            print(
                                f"リンケージ行列のサイズが不正です: {linkage_matrix.shape[0]} != {n_samples - 1}"
                            )
                            linkage_matrix = None
                        else:
                            print("リンケージ行列は正常です。")

            except Exception as linkage_error:
                print(f"リンケージ計算エラー: {linkage_error}")
                import traceback

                print(f"リンケージエラー詳細:\n{traceback.format_exc()}")
                linkage_matrix = None

            return {
                "labels": labels,
                "centers": None,  # 階層クラスタリングには中心点がない
                "dendrogram_data": linkage_matrix,
            }

        except Exception as e:
            print(f"階層クラスタリング全体エラー: {e}")
            import traceback

            print(f"階層エラー詳細:\n{traceback.format_exc()}")

            # フォールバック: K-meansに切り替え
            print("フォールバック: K-meansを使用します")
            try:
                from sklearn.cluster import KMeans

                kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                labels = kmeans.fit_predict(df)

                return {
                    "labels": labels,
                    "centers": kmeans.cluster_centers_,
                    "dendrogram_data": None,
                }
            except Exception as fallback_error:
                print(f"フォールバックエラー: {fallback_error}")
                raise

    def _compute_dbscan(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """DBSCANクラスタリング"""
        eps = kwargs.get("eps", 0.5)
        min_samples = kwargs.get("min_samples", 5)

        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        labels = dbscan.fit_predict(df)

        return {
            "labels": labels,
            "centers": None,  # DBSCANには明示的な中心点がない
        }

    def _compute_evaluation_metrics(
        self, df: pd.DataFrame, labels: np.ndarray
    ) -> Dict[str, float]:
        """クラスター評価指標の計算"""
        metrics = {}

        try:
            # ノイズポイント（-1ラベル）を除外
            valid_mask = labels != -1
            if np.sum(valid_mask) < 2:
                return {"error": "有効なクラスターが不足しています"}

            valid_data = df[valid_mask]
            valid_labels = labels[valid_mask]

            # クラスター数
            n_clusters = len(np.unique(valid_labels))
            metrics["n_clusters"] = n_clusters

            if n_clusters > 1:
                # シルエット係数
                silhouette_avg = silhouette_score(valid_data, valid_labels)
                metrics["silhouette_score"] = float(silhouette_avg)

                # Calinski-Harabasz指標
                ch_score = calinski_harabasz_score(valid_data, valid_labels)
                metrics["calinski_harabasz_score"] = float(ch_score)

                # Davies-Bouldin指標
                db_score = davies_bouldin_score(valid_data, valid_labels)
                metrics["davies_bouldin_score"] = float(db_score)

            # ノイズポイントの割合（DBSCANの場合）
            noise_ratio = np.sum(labels == -1) / len(labels)
            metrics["noise_ratio"] = float(noise_ratio)

        except Exception as e:
            print(f"評価指標計算エラー: {e}")
            metrics["error"] = str(e)

        return metrics

    def _compute_pca_for_visualization(self, df: pd.DataFrame) -> Dict[str, Any]:
        """可視化用の主成分分析"""
        try:
            pca = PCA(n_components=min(2, df.shape[1], df.shape[0] - 1))
            coordinates = pca.fit_transform(df)

            return {
                "coordinates": coordinates,
                "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
                "components": pca.components_.tolist(),
            }
        except Exception as e:
            print(f"PCA計算エラー: {e}")
            # フォールバック: 最初の2列を使用
            if df.shape[1] >= 2:
                return {
                    "coordinates": df.iloc[:, :2].values,
                    "explained_variance_ratio": [1.0, 0.0],
                    "components": [[1.0, 0.0], [0.0, 1.0]],
                }
            else:
                return {
                    "coordinates": np.column_stack(
                        [df.iloc[:, 0].values, np.zeros(len(df))]
                    ),
                    "explained_variance_ratio": [1.0, 0.0],
                    "components": [[1.0], [0.0]],
                }

    def create_plot_with_fixed_dendrogram(
        self, results: Dict[str, Any], df: pd.DataFrame
    ) -> str:
        """デンドログラム修正版の包括プロット作成"""
        try:
            print("=== 修正版プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            method = results["method"]
            labels = np.array(results["labels"])
            pca_coordinates = np.array(results["pca_coordinates"])
            explained_variance_ratio = results["pca_explained_variance_ratio"]
            n_clusters = results["n_clusters"]

            # レイアウトを少し調整（デンドログラム問題対応）
            if method == "hierarchical":
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_dendro = fig.add_subplot(gs[0, 1])  # デンドログラム or 代替
                ax_elbow = fig.add_subplot(gs[1, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[0, 2])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[1, 2])  # 評価指標
            else:
                # 他の手法では元のレイアウト
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_elbow = fig.add_subplot(gs[0, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[1, 1])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[0, 2])  # 評価指標
                ax_extra = fig.add_subplot(gs[1, 2])  # 追加分析

            # 背景設定
            fig.patch.set_facecolor("white")
            colors = plt.cm.Set3(np.linspace(0, 1, max(n_clusters, 3)))

            # 1. メインのクラスター散布図
            self._create_enhanced_cluster_scatter_plot(
                ax_main,
                pca_coordinates,
                labels,
                colors,
                explained_variance_ratio,
                method,
                results,
                df,
            )

            # 2. 手法別の追加プロット（修正版）
            if method == "hierarchical":
                # デンドログラム（修正版 - エラー処理強化）
                dendrogram_data = results.get("dendrogram_data")
                if dendrogram_data is not None:
                    self._create_dendrogram_plot(ax_dendro, results, df)
                else:
                    # 代替表示
                    self._create_simple_dendrogram_fallback(ax_dendro, df, results)

                # その他のプロット
                self._create_elbow_plot(ax_elbow, df, results)
                self._create_silhouette_analysis_plot(
                    ax_silhouette, df, labels, results
                )
                self._create_metrics_comparison_plot(ax_metrics, results)

            elif method == "kmeans":
                self._create_elbow_plot(ax_elbow, df, results)
                self._create_silhouette_analysis_plot(
                    ax_silhouette, df, labels, results
                )
                self._create_metrics_comparison_plot(ax_metrics, results)
                self._create_cluster_centers_plot(ax_extra, results, df)

            else:  # DBSCAN
                self._create_density_plot(ax_elbow, pca_coordinates, labels)
                self._create_noise_analysis_plot(ax_silhouette, labels, results)
                self._create_metrics_comparison_plot(ax_metrics, results)
                self._create_parameter_sensitivity_plot(ax_extra, results)

            # レイアウト調整
            plt.tight_layout()

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"修正版プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"修正版プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

    def _create_dendrogram_alternative(self, ax, results, df):
        """デンドログラム代替表示"""
        try:
            ax.set_facecolor("white")

            # クラスター情報を表示
            labels = results.get("labels", [])
            n_clusters = results.get("n_clusters", 0)
            method = results.get("method", "unknown")

            if len(labels) > 0:
                # クラスター別サンプル数
                cluster_counts = {}
                for i in range(n_clusters):
                    count = np.sum(np.array(labels) == i)
                    cluster_counts[f"クラスター {i+1}"] = count

                # 横棒グラフで表示
                names = list(cluster_counts.keys())
                values = list(cluster_counts.values())

                colors = plt.cm.Set3(np.linspace(0, 1, len(names)))
                bars = ax.barh(
                    names, values, color=colors, alpha=0.7, edgecolor="black"
                )

                # 値をバーの右端に表示
                for bar, value in zip(bars, values):
                    width = bar.get_width()
                    ax.text(
                        width + 0.1,
                        bar.get_y() + bar.get_height() / 2,
                        f"{value}",
                        ha="left",
                        va="center",
                        fontsize=10,
                        fontweight="bold",
                    )

                ax.set_xlabel("サンプル数", fontsize=12)
                ax.set_title(
                    "クラスター別サンプル分布\n（デンドログラム代替表示）",
                    fontsize=12,
                    fontweight="bold",
                )
                ax.grid(True, linestyle=":", alpha=0.3, axis="x")

                # 情報テキスト
                total_samples = len(labels)
                info_text = f"総サンプル数: {total_samples}\n手法: {method}\nクラスター数: {n_clusters}"
                ax.text(
                    0.98,
                    0.02,
                    info_text,
                    transform=ax.transAxes,
                    fontsize=9,
                    bbox=dict(
                        boxstyle="round,pad=0.3", facecolor="lightblue", alpha=0.8
                    ),
                    verticalalignment="bottom",
                    horizontalalignment="right",
                )

            else:
                # データがない場合
                ax.text(
                    0.5,
                    0.5,
                    "クラスターデータが\n利用できません\n\nデンドログラムは\n表示できません",
                    ha="center",
                    va="center",
                    fontsize=12,
                    transform=ax.transAxes,
                    bbox=dict(
                        boxstyle="round,pad=0.5", facecolor="lightgray", alpha=0.8
                    ),
                )
                ax.set_title(
                    "デンドログラム（利用不可）", fontsize=12, fontweight="bold"
                )

            # 軸の調整
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)

        except Exception as e:
            print(f"代替表示エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"表示エラー:\n{str(e)}",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("表示エラー", fontsize=12, fontweight="bold")

    # analyze メソッドにもデバッグ情報を追加
    def analyze_with_debug(
        self,
        df: pd.DataFrame,
        method: str = "kmeans",
        n_clusters: int = 3,
        standardize: bool = True,
        **kwargs,
    ) -> Dict[str, Any]:
        """デバッグ情報付きクラスター解析を実行"""
        try:
            print(f"=== デバッグ付きクラスター分析開始 ===")
            print(f"入力データ:\n{df}")
            print(f"データ形状: {df.shape}")
            print(f"手法: {method}, クラスター数: {n_clusters}, 標準化: {standardize}")
            print(f"追加パラメータ: {kwargs}")

            # データの検証と前処理
            df_processed = self._preprocess_cluster_data(df, standardize)
            print(f"前処理後データ:\n{df_processed}")
            print(f"前処理後形状: {df_processed.shape}")

            # クラスター分析の計算
            results = self._compute_cluster_analysis(
                df_processed, method, n_clusters, **kwargs
            )

            # 元のデータフレームとの対応を保持
            results["original_data"] = df
            results["processed_data"] = df_processed

            print(f"分析結果キー: {list(results.keys())}")
            print(
                f"デンドログラムデータ有無: {'dendrogram_data' in results and results['dendrogram_data'] is not None}"
            )

            return results

        except Exception as e:
            print(f"デバッグ付き分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    def create_plot_fixed(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """修正版包括プロット作成"""
        try:
            print("=== 修正版プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            method = results["method"]
            labels = np.array(results["labels"])
            pca_coordinates = np.array(results["pca_coordinates"])
            explained_variance_ratio = results["pca_explained_variance_ratio"]
            n_clusters = results["n_clusters"]

            print(
                f"プロット情報: method={method}, n_clusters={n_clusters}, samples={len(labels)}"
            )

            # 手法に応じたレイアウト設定
            if method == "hierarchical":
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_dendro = fig.add_subplot(gs[0, 1])  # デンドログラム
                ax_elbow = fig.add_subplot(gs[1, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[0, 2])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[1, 2])  # 評価指標
            elif method == "kmeans":
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_elbow = fig.add_subplot(gs[0, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[1, 1])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[0, 2])  # 評価指標
                ax_center = fig.add_subplot(gs[1, 2])  # クラスター中心
            else:  # DBSCAN
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_density = fig.add_subplot(gs[0, 1])  # 密度分布
                ax_noise = fig.add_subplot(gs[1, 1])  # ノイズ分析
                ax_metrics = fig.add_subplot(gs[0, 2])  # 評価指標
                ax_param = fig.add_subplot(gs[1, 2])  # パラメータ感度

            # 背景設定
            fig.patch.set_facecolor("white")
            colors = plt.cm.Set3(np.linspace(0, 1, max(n_clusters, 3)))

            # 1. メインのクラスター散布図
            self._create_enhanced_cluster_scatter_plot(
                ax_main,
                pca_coordinates,
                labels,
                colors,
                explained_variance_ratio,
                method,
                results,
                df,
            )

            # 2. 手法別の追加プロット（修正版）
            try:
                if method == "hierarchical":
                    print("階層クラスタリングプロット作成中...")
                    self._create_dendrogram_plot_fixed(ax_dendro, results, df)
                    self._create_elbow_plot_safe(ax_elbow, df, results)
                    self._create_silhouette_analysis_plot_safe(
                        ax_silhouette, df, labels, results
                    )
                    self._create_metrics_comparison_plot(ax_metrics, results)

                elif method == "kmeans":
                    print("K-meansプロット作成中...")
                    self._create_elbow_plot_safe(ax_elbow, df, results)
                    self._create_silhouette_analysis_plot_safe(
                        ax_silhouette, df, labels, results
                    )
                    self._create_metrics_comparison_plot(ax_metrics, results)
                    self._create_cluster_centers_plot_safe(ax_center, results, df)

                else:  # DBSCAN
                    print("DBSCANプロット作成中...")
                    self._create_density_plot_safe(ax_density, pca_coordinates, labels)
                    self._create_noise_analysis_plot(ax_noise, labels, results)
                    self._create_metrics_comparison_plot(ax_metrics, results)
                    self._create_parameter_sensitivity_plot(ax_param, results)

            except Exception as subplot_error:
                print(f"サブプロット作成エラー: {subplot_error}")
                # エラーが発生したサブプロットにエラーメッセージを表示
                pass  # メインプロットは作成済みなので続行

            # レイアウト調整
            plt.tight_layout()

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"修正版プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"修正版プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")

            # フォールバック: シンプルなプロットを作成
            try:
                return self.create_simple_plot_fallback(results, df)
            except:
                return ""

    def _create_enhanced_cluster_scatter_plot(
        self,
        ax,
        coordinates,
        labels,
        colors,
        explained_variance_ratio,
        method,
        results,
        df,
    ):
        """拡張されたクラスター散布図の作成"""
        try:
            # 背景設定
            ax.set_facecolor("white")

            # 各クラスターをプロット
            unique_labels = np.unique(labels)
            for i, label in enumerate(unique_labels):
                mask = labels == label
                if label == -1:  # ノイズポイント（DBSCANの場合）
                    ax.scatter(
                        coordinates[mask, 0],
                        coordinates[mask, 1],
                        c="black",
                        marker="x",
                        s=80,
                        alpha=0.8,
                        label="ノイズ",
                        edgecolor="white",
                        linewidth=0.5,
                    )
                else:
                    ax.scatter(
                        coordinates[mask, 0],
                        coordinates[mask, 1],
                        c=[colors[label % len(colors)]],
                        marker="o",
                        s=120,
                        alpha=0.8,
                        edgecolor="white",
                        linewidth=1.5,
                        label=f"クラスター {label + 1}",
                    )

            # クラスター中心点を表示（K-meansの場合）
            if method == "kmeans" and results.get("cluster_centers") is not None:
                # PCA変換された中心点の近似計算
                from sklearn.decomposition import PCA

                pca = PCA(n_components=2)
                pca.fit(df.select_dtypes(include=[np.number]))
                centers_2d = pca.transform(np.array(results["cluster_centers"]))

                ax.scatter(
                    centers_2d[:, 0],
                    centers_2d[:, 1],
                    c="red",
                    marker="*",
                    s=400,
                    edgecolor="black",
                    linewidth=2,
                    label="クラスター中心",
                    zorder=10,
                )

            # 軸ラベルとタイトル
            if len(explained_variance_ratio) >= 2:
                ax.set_xlabel(
                    f"第1主成分 ({explained_variance_ratio[0]*100:.1f}% 説明)",
                    fontsize=14,
                    fontweight="bold",
                )
                ax.set_ylabel(
                    f"第2主成分 ({explained_variance_ratio[1]*100:.1f}% 説明)",
                    fontsize=14,
                    fontweight="bold",
                )

            # メソッド名の日本語化
            method_names = {
                "kmeans": "K-means法",
                "hierarchical": "階層クラスタリング",
                "dbscan": "DBSCAN法",
            }
            method_name = method_names.get(method, method)

            ax.set_title(
                f"{method_name}によるクラスター分析結果",
                fontsize=18,
                fontweight="bold",
                pad=20,
            )

            # グリッドと軸線
            ax.grid(True, linestyle=":", alpha=0.6, color="gray")
            ax.axhline(y=0, color="gray", linestyle="--", alpha=0.7, linewidth=1)
            ax.axvline(x=0, color="gray", linestyle="--", alpha=0.7, linewidth=1)

            # 凡例
            ax.legend(fontsize=11, loc="best", frameon=True, framealpha=0.9)

            # 評価指標の表示
            evaluation_metrics = results.get("evaluation_metrics", {})
            if evaluation_metrics and "error" not in evaluation_metrics:
                info_text = f"クラスター数: {results['n_clusters']}\n"
                if "silhouette_score" in evaluation_metrics:
                    info_text += f"シルエット係数: {evaluation_metrics['silhouette_score']:.3f}\n"
                if "calinski_harabasz_score" in evaluation_metrics:
                    info_text += (
                        f"CH指標: {evaluation_metrics['calinski_harabasz_score']:.1f}\n"
                    )
                if "davies_bouldin_score" in evaluation_metrics:
                    info_text += (
                        f"DB指標: {evaluation_metrics['davies_bouldin_score']:.3f}"
                    )

                ax.text(
                    0.02,
                    0.98,
                    info_text,
                    transform=ax.transAxes,
                    fontsize=10,
                    bbox=dict(
                        boxstyle="round,pad=0.5",
                        facecolor="lightblue",
                        alpha=0.8,
                        edgecolor="navy",
                    ),
                    verticalalignment="top",
                )

        except Exception as e:
            print(f"散布図作成エラー: {e}")

    def _create_cluster_scatter_plot(
        self, ax, coordinates, labels, colors, explained_variance_ratio, method, results
    ):
        """元のクラスター散布図の作成（後方互換性用）"""
        try:
            # 背景設定
            ax.set_facecolor("white")

            # 各クラスターをプロット
            unique_labels = np.unique(labels)
            for i, label in enumerate(unique_labels):
                mask = labels == label
                if label == -1:  # ノイズポイント（DBSCANの場合）
                    ax.scatter(
                        coordinates[mask, 0],
                        coordinates[mask, 1],
                        c="black",
                        marker="x",
                        s=50,
                        alpha=0.6,
                        label="ノイズ",
                    )
                else:
                    ax.scatter(
                        coordinates[mask, 0],
                        coordinates[mask, 1],
                        c=[colors[label % len(colors)]],
                        marker="o",
                        s=100,
                        alpha=0.7,
                        edgecolor="white",
                        linewidth=0.5,
                        label=f"クラスター {label + 1}",
                    )

            # クラスター中心点を表示（K-meansの場合）
            if method == "kmeans" and results.get("cluster_centers") is not None:
                centers = np.array(results["cluster_centers"])
                # PCA空間に変換（近似）
                if len(explained_variance_ratio) >= 2:
                    ax.scatter(
                        centers[:, 0],
                        centers[:, 1],
                        c="red",
                        marker="*",
                        s=300,
                        edgecolor="black",
                        linewidth=2,
                        label="クラスター中心",
                        zorder=10,
                    )

            # 軸ラベルとタイトル
            if len(explained_variance_ratio) >= 2:
                ax.set_xlabel(
                    f"第1主成分 ({explained_variance_ratio[0]*100:.1f}% 説明)",
                    fontsize=12,
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                )
                ax.set_ylabel(
                    f"第2主成分 ({explained_variance_ratio[1]*100:.1f}% 説明)",
                    fontsize=12,
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                )

            # メソッド名の日本語化
            method_names = {
                "kmeans": "K-means法",
                "hierarchical": "階層クラスタリング",
                "dbscan": "DBSCAN法",
            }
            method_name = method_names.get(method, method)

            ax.set_title(
                f"{method_name}によるクラスター分析結果",
                fontsize=16,
                fontweight="bold",
                pad=20,
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
            )

            # グリッドと軸線
            ax.grid(True, linestyle=":", alpha=0.6)
            ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5)
            ax.axvline(x=0, color="gray", linestyle="--", alpha=0.5)

            # 凡例
            ax.legend(
                fontsize=10,
                loc="best",
                frameon=True,
                framealpha=0.9,
                prop={
                    "family": ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                },
            )

            # 評価指標の表示
            evaluation_metrics = results.get("evaluation_metrics", {})
            if evaluation_metrics and "error" not in evaluation_metrics:
                info_text = f"クラスター数: {results['n_clusters']}\n"
                if "silhouette_score" in evaluation_metrics:
                    info_text += f"シルエット係数: {evaluation_metrics['silhouette_score']:.3f}\n"
                if "calinski_harabasz_score" in evaluation_metrics:
                    info_text += (
                        f"CH指標: {evaluation_metrics['calinski_harabasz_score']:.1f}\n"
                    )
                if "davies_bouldin_score" in evaluation_metrics:
                    info_text += (
                        f"DB指標: {evaluation_metrics['davies_bouldin_score']:.3f}"
                    )

                ax.text(
                    0.02,
                    0.98,
                    info_text,
                    transform=ax.transAxes,
                    fontsize=9,
                    bbox=dict(
                        boxstyle="round,pad=0.5",
                        facecolor="white",
                        alpha=0.8,
                        edgecolor="gray",
                    ),
                    verticalalignment="top",
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                )

        except Exception as e:
            print(f"散布図作成エラー: {e}")

    def _create_dendrogram_plot_fixed(self, ax, results, df):
        """修正版デンドログラム作成 - 安定性向上"""
        try:
            ax.set_facecolor("white")
            dendrogram_data = results.get("dendrogram_data")

            print(f"デンドログラム作成開始: データ有無={dendrogram_data is not None}")

            if dendrogram_data is None:
                # デンドログラムデータがない場合の代替表示
                self._create_dendrogram_alternative(ax, results, df)
                return

            try:
                from scipy.cluster.hierarchy import dendrogram
                import numpy as np

                # データの妥当性再チェック
                if not isinstance(dendrogram_data, np.ndarray):
                    print("デンドログラムデータが配列ではありません")
                    self._create_dendrogram_alternative(ax, results, df)
                    return

                if dendrogram_data.shape[1] != 4:
                    print(f"デンドログラムデータの形状が不正: {dendrogram_data.shape}")
                    self._create_dendrogram_alternative(ax, results, df)
                    return

                # ラベルの準備
                n_samples = len(df)
                max_display_labels = 25  # 表示ラベル数を制限

                if n_samples <= max_display_labels:
                    labels = [str(idx) for idx in df.index]
                    truncate_mode = None
                    p_param = None
                else:
                    labels = None  # ラベルなしで描画
                    truncate_mode = "lastp"
                    p_param = max_display_labels

                print(
                    f"デンドログラム描画パラメータ: labels={len(labels) if labels else 0}, truncate={truncate_mode}"
                )

                # デンドログラム描画
                dend_params = {
                    "ax": ax,
                    "leaf_rotation": 45,
                    "leaf_font_size": 8 if labels else 10,
                    "color_threshold": 0.7 * np.max(dendrogram_data[:, 2]),
                    "above_threshold_color": "lightgray",
                }

                if labels:
                    dend_params["labels"] = labels
                if truncate_mode:
                    dend_params["truncate_mode"] = truncate_mode
                    dend_params["p"] = p_param

                # 実際に描画
                dend = dendrogram(dendrogram_data, **dend_params)

                # タイトルと軸ラベル
                ax.set_title("デンドログラム（樹形図）", fontsize=14, fontweight="bold")
                ax.set_xlabel("サンプル", fontsize=12)
                ax.set_ylabel("クラスター間距離", fontsize=12)
                ax.grid(True, linestyle=":", alpha=0.3)

                # カットラインを表示
                cut_height = 0.7 * np.max(dendrogram_data[:, 2])
                ax.axhline(
                    y=cut_height, color="red", linestyle="--", alpha=0.8, linewidth=2
                )

                # 情報ボックス
                info_text = f"サンプル数: {n_samples}\n推奨カット: {cut_height:.2f}"
                ax.text(
                    0.02,
                    0.98,
                    info_text,
                    transform=ax.transAxes,
                    fontsize=9,
                    bbox=dict(
                        boxstyle="round,pad=0.3", facecolor="lightyellow", alpha=0.9
                    ),
                    verticalalignment="top",
                )

                print("デンドログラム描画完了")

            except Exception as plot_error:
                print(f"デンドログラム描画エラー: {plot_error}")
                import traceback

                print(f"描画エラー詳細:\n{traceback.format_exc()}")
                self._create_dendrogram_alternative(ax, results, df)

        except Exception as e:
            print(f"デンドログラム全体エラー: {e}")
            self._create_dendrogram_alternative(ax, results, df)

    def _create_dendrogram_plot_enhanced(self, ax, results, df):
        """拡張版デンドログラム作成"""
        try:
            ax.set_facecolor("white")
            dendrogram_data = results.get("dendrogram_data")

            print(f"デンドログラム作成開始: データ有無={dendrogram_data is not None}")

            if dendrogram_data is None:
                # デンドログラムデータがない場合の代替表示
                self._create_dendrogram_alternative(ax, results, df)
                return

            try:
                from scipy.cluster.hierarchy import dendrogram
                import numpy as np

                # データの妥当性再チェック
                if not isinstance(dendrogram_data, np.ndarray):
                    print("デンドログラムデータが配列ではありません")
                    self._create_dendrogram_alternative(ax, results, df)
                    return

                if dendrogram_data.shape[1] != 4:
                    print(f"デンドログラムデータの形状が不正: {dendrogram_data.shape}")
                    self._create_dendrogram_alternative(ax, results, df)
                    return

                # ラベルの準備
                n_samples = len(df)
                max_display_labels = 25  # 表示ラベル数を制限

                if n_samples <= max_display_labels:
                    labels = [str(idx) for idx in df.index]
                    truncate_mode = None
                    p_param = None
                else:
                    labels = None  # ラベルなしで描画
                    truncate_mode = "lastp"
                    p_param = max_display_labels

                print(
                    f"デンドログラム描画パラメータ: labels={len(labels) if labels else 0}, truncate={truncate_mode}"
                )

                # デンドログラム描画
                dend_params = {
                    "ax": ax,
                    "leaf_rotation": 45,
                    "leaf_font_size": 8 if labels else 10,
                    "color_threshold": 0.7 * np.max(dendrogram_data[:, 2]),
                    "above_threshold_color": "lightgray",
                }

                if labels:
                    dend_params["labels"] = labels
                if truncate_mode:
                    dend_params["truncate_mode"] = truncate_mode
                    dend_params["p"] = p_param

                # 実際に描画
                dend = dendrogram(dendrogram_data, **dend_params)

                # タイトルと軸ラベル
                ax.set_title("デンドログラム（樹形図）", fontsize=14, fontweight="bold")
                ax.set_xlabel("サンプル", fontsize=12)
                ax.set_ylabel("クラスター間距離", fontsize=12)
                ax.grid(True, linestyle=":", alpha=0.3)

                # カットラインを表示
                cut_height = 0.7 * np.max(dendrogram_data[:, 2])
                ax.axhline(
                    y=cut_height, color="red", linestyle="--", alpha=0.8, linewidth=2
                )

                # 情報ボックス
                info_text = f"サンプル数: {n_samples}\n推奨カット: {cut_height:.2f}"
                ax.text(
                    0.02,
                    0.98,
                    info_text,
                    transform=ax.transAxes,
                    fontsize=9,
                    bbox=dict(
                        boxstyle="round,pad=0.3", facecolor="lightyellow", alpha=0.9
                    ),
                    verticalalignment="top",
                )

                print("デンドログラム描画完了")

            except Exception as plot_error:
                print(f"デンドログラム描画エラー: {plot_error}")
                import traceback

                print(f"描画エラー詳細:\n{traceback.format_exc()}")
                self._create_dendrogram_alternative(ax, results, df)

        except Exception as e:
            print(f"デンドログラム全体エラー: {e}")
            self._create_dendrogram_alternative(ax, results, df)

    def _create_dendrogram_plot_safe(self, ax, results, df):
        """安全版デンドログラム作成"""
        try:
            # デンドログラムデータの確認
            dendrogram_data = results.get("dendrogram_data")
            if dendrogram_data is not None:
                self._create_dendrogram_plot_enhanced(ax, results, df)
            else:
                print("デンドログラムデータがないため、代替表示を使用")
                self._create_dendrogram_alternative(ax, results, df)
        except Exception as e:
            print(f"デンドログラムプロットエラー: {e}")
            self._create_dendrogram_alternative(ax, results, df)

    def _create_simple_dendrogram_fallback(self, ax, df, results):
        """シンプルなデンドログラム代替表示"""
        try:
            ax.set_facecolor("white")

            # クラスターサイズの表示
            labels = results.get("labels", [])
            n_clusters = results.get("n_clusters", 0)

            if len(labels) > 0:
                cluster_sizes = [
                    np.sum(np.array(labels) == i) for i in range(n_clusters)
                ]

                # 簡単な棒グラフでクラスターサイズを表示
                x_pos = np.arange(len(cluster_sizes))
                bars = ax.bar(
                    x_pos,
                    cluster_sizes,
                    color=plt.cm.Set3(np.linspace(0, 1, len(cluster_sizes))),
                )

                # 値をバーの上に表示
                for i, (bar, size) in enumerate(zip(bars, cluster_sizes)):
                    height = bar.get_height()
                    ax.text(
                        bar.get_x() + bar.get_width() / 2.0,
                        height + 0.1,
                        f"{size}",
                        ha="center",
                        va="bottom",
                        fontsize=10,
                    )

                ax.set_xlabel("クラスター番号", fontsize=12)
                ax.set_ylabel("サンプル数", fontsize=12)
                ax.set_title("クラスター別サンプル数", fontsize=14, fontweight="bold")
                ax.set_xticks(x_pos)
                ax.set_xticklabels([f"C{i+1}" for i in range(len(cluster_sizes))])
                ax.grid(True, linestyle=":", alpha=0.3)

            else:
                ax.text(
                    0.5,
                    0.5,
                    "クラスターデータが\n利用できません",
                    ha="center",
                    va="center",
                    fontsize=12,
                    transform=ax.transAxes,
                )

        except Exception as e:
            print(f"代替表示エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"表示エラー:\n{str(e)}",
                ha="center",
                va="center",
                transform=ax.transAxes,
            )

    def _create_elbow_plot(self, ax, df, results):
        """エルボー法プロット"""
        try:
            ax.set_facecolor("white")

            # K=2から10までのクラスター数で慣性を計算
            from sklearn.cluster import KMeans
            from sklearn.preprocessing import StandardScaler

            # データ準備
            numeric_df = df.select_dtypes(include=[np.number])
            if numeric_df.empty:
                ax.text(
                    0.5,
                    0.5,
                    "数値データが不足",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                ax.set_title("エルボー法", fontsize=14, fontweight="bold")
                return

            scaler = StandardScaler()
            scaled_data = scaler.fit_transform(numeric_df)

            max_k = min(10, len(df) - 1)
            k_range = range(2, max_k + 1)
            inertias = []

            for k in k_range:
                try:
                    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                    kmeans.fit(scaled_data)
                    inertias.append(kmeans.inertia_)
                except Exception as e:
                    print(f"K={k}でのエラー: {e}")
                    inertias.append(0)  # エラー時は0を追加

            if not inertias:
                ax.text(
                    0.5,
                    0.5,
                    "慣性計算エラー",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                return

            # プロット
            ax.plot(k_range, inertias, "bo-", linewidth=2, markersize=8)

            # 現在のクラスター数をハイライト
            current_k = results.get("n_clusters", 3)
            if current_k in k_range:
                current_inertia = inertias[list(k_range).index(current_k)]
                ax.plot(
                    current_k,
                    current_inertia,
                    "ro",
                    markersize=12,
                    label=f"選択されたK={current_k}",
                )
                ax.legend()

            ax.set_xlabel("クラスター数 (K)", fontsize=12)
            ax.set_ylabel("慣性 (SSE)", fontsize=12)
            ax.set_title("エルボー法", fontsize=14, fontweight="bold")
            ax.grid(True, linestyle=":", alpha=0.6)

        except Exception as e:
            print(f"エルボー法プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"エルボー法\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )
            ax.set_title("エルボー法（エラー）", fontsize=14, fontweight="bold")

    def _create_elbow_plot_enhanced(self, ax, df, results):
        """拡張版エルボー法プロット"""
        self._create_elbow_plot(ax, df, results)

    def _create_elbow_plot_safe(self, ax, df, results):
        """安全版エルボー法プロット"""
        try:
            self._create_elbow_plot(ax, df, results)
        except Exception as e:
            print(f"エルボー法プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"エルボー法\nプロットエラー:\n{str(e)[:50]}...",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("エルボー法（エラー）", fontsize=12, fontweight="bold")

    def _create_silhouette_analysis_plot(self, ax, df, labels, results):
        """シルエット分析プロット"""
        try:
            ax.set_facecolor("white")

            from sklearn.metrics import silhouette_samples
            import numpy as np

            # 数値データの準備
            numeric_df = df.select_dtypes(include=[np.number])
            if numeric_df.empty or len(np.unique(labels)) < 2:
                ax.text(
                    0.5,
                    0.5,
                    "シルエット分析\nデータ不足",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                ax.set_title("シルエット分析", fontsize=14, fontweight="bold")
                return

            # ノイズポイントを除外
            valid_mask = labels != -1
            if np.sum(valid_mask) < 2:
                ax.text(
                    0.5,
                    0.5,
                    "有効なデータ\n不足",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                ax.set_title("シルエット分析", fontsize=14, fontweight="bold")
                return

            valid_data = numeric_df[valid_mask]
            valid_labels = labels[valid_mask]

            silhouette_vals = silhouette_samples(valid_data, valid_labels)

            y_lower = 10
            colors = plt.cm.Set3(np.linspace(0, 1, len(np.unique(valid_labels))))

            for i, cluster_label in enumerate(np.unique(valid_labels)):
                cluster_silhouette_vals = silhouette_vals[valid_labels == cluster_label]
                cluster_silhouette_vals.sort()

                size_cluster_i = cluster_silhouette_vals.shape[0]
                y_upper = y_lower + size_cluster_i

                ax.fill_betweenx(
                    np.arange(y_lower, y_upper),
                    0,
                    cluster_silhouette_vals,
                    facecolor=colors[i],
                    edgecolor=colors[i],
                    alpha=0.7,
                )

                # クラスターラベルをY軸に表示
                ax.text(-0.05, y_lower + 0.5 * size_cluster_i, str(cluster_label + 1))
                y_lower = y_upper + 10

            ax.set_xlabel("シルエット係数", fontsize=12)
            ax.set_ylabel("クラスター", fontsize=12)
            ax.set_title("シルエット分析", fontsize=14, fontweight="bold")

            # 平均シルエット係数を表示
            silhouette_avg = np.mean(silhouette_vals)
            ax.axvline(
                x=silhouette_avg,
                color="red",
                linestyle="--",
                linewidth=2,
                label=f"平均: {silhouette_avg:.3f}",
            )
            ax.legend()

        except Exception as e:
            print(f"シルエット分析プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"シルエット分析\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )
            ax.set_title("シルエット分析（エラー）", fontsize=14, fontweight="bold")

    def _create_silhouette_analysis_plot_enhanced(self, ax, df, labels, results):
        """拡張版シルエット分析プロット"""
        self._create_silhouette_analysis_plot(ax, df, labels, results)

    def _create_silhouette_analysis_plot_safe(self, ax, df, labels, results):
        """安全版シルエット分析プロット"""
        try:
            self._create_silhouette_analysis_plot(ax, df, labels, results)
        except Exception as e:
            print(f"シルエット分析プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"シルエット分析\nプロットエラー:\n{str(e)[:50]}...",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("シルエット分析（エラー）", fontsize=12, fontweight="bold")

    def _create_density_plot(self, ax, coordinates, labels):
        """密度分布プロット（DBSCAN用）"""
        try:
            ax.set_facecolor("white")

            # 密度の可視化（ヒートマップ）
            from scipy.stats import gaussian_kde

            if len(coordinates) < 3:
                ax.text(
                    0.5,
                    0.5,
                    "データ点が\n不足",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                ax.set_title("密度分布", fontsize=14, fontweight="bold")
                return

            x, y = coordinates[:, 0], coordinates[:, 1]

            # 密度推定
            xy = np.vstack([x, y])
            kde = gaussian_kde(xy)

            # グリッド作成
            x_min, x_max = x.min() - 1, x.max() + 1
            y_min, y_max = y.min() - 1, y.max() + 1
            xx, yy = np.mgrid[x_min:x_max:50j, y_min:y_max:50j]
            positions = np.vstack([xx.ravel(), yy.ravel()])

            # 密度計算
            density = np.reshape(kde(positions).T, xx.shape)

            # プロット
            ax.contourf(xx, yy, density, levels=15, cmap="Blues", alpha=0.6)
            ax.contour(
                xx, yy, density, levels=15, colors="navy", alpha=0.3, linewidths=0.5
            )

            # データポイントをオーバーレイ
            unique_labels = np.unique(labels)
            colors = plt.cm.Set3(np.linspace(0, 1, len(unique_labels)))
            for i, label in enumerate(unique_labels):
                mask = labels == label
                if label == -1:
                    ax.scatter(x[mask], y[mask], c="red", marker="x", s=30, alpha=0.8)
                else:
                    ax.scatter(x[mask], y[mask], c=[colors[i]], s=30, alpha=0.8)

            ax.set_title("データ密度分布", fontsize=14, fontweight="bold")
            ax.set_xlabel("第1主成分", fontsize=12)
            ax.set_ylabel("第2主成分", fontsize=12)

        except Exception as e:
            print(f"密度プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"密度分布\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )
            ax.set_title("密度分布（エラー）", fontsize=14, fontweight="bold")

    def _create_density_plot_safe(self, ax, coordinates, labels):
        """安全版密度プロット"""
        try:
            self._create_density_plot(ax, coordinates, labels)
        except Exception as e:
            print(f"密度プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"密度分布\nプロットエラー:\n{str(e)[:50]}...",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("密度分布（エラー）", fontsize=12, fontweight="bold")

    def _create_density_plot_enhanced(self, ax, coordinates, labels):
        """拡張版密度プロット"""
        self._create_density_plot(ax, coordinates, labels)

    def create_simple_plot_fallback(
        self, results: Dict[str, Any], df: pd.DataFrame
    ) -> str:
        """フォールバック用シンプルプロット"""
        try:
            print("フォールバックプロット作成中...")

            # 最小限のプロット
            fig, ax = plt.subplots(figsize=(10, 8))
            fig.patch.set_facecolor("white")

            # 基本的な散布図のみ
            labels = np.array(results["labels"])
            pca_coordinates = np.array(results["pca_coordinates"])

            unique_labels = np.unique(labels)
            colors = plt.cm.Set3(np.linspace(0, 1, len(unique_labels)))

            for i, label in enumerate(unique_labels):
                mask = labels == label
                ax.scatter(
                    pca_coordinates[mask, 0],
                    pca_coordinates[mask, 1],
                    c=[colors[i]],
                    label=f"クラスター {label + 1}",
                    alpha=0.7,
                    s=50,
                )

            ax.set_title("クラスター分析結果（簡略版）", fontsize=14, fontweight="bold")
            ax.set_xlabel("第1主成分", fontsize=12)
            ax.set_ylabel("第2主成分", fontsize=12)
            ax.legend()
            ax.grid(True, alpha=0.3)

            plt.tight_layout()

            plot_base64 = self.save_plot_as_base64(fig)
            print("フォールバックプロット完了")
            return plot_base64

        except Exception as e:
            print(f"フォールバックプロットエラー: {e}")
            return ""

    def _create_metrics_comparison_plot(self, ax, results):
        """評価指標比較プロット"""
        try:
            ax.set_facecolor("white")

            evaluation_metrics = results.get("evaluation_metrics", {})
            if not evaluation_metrics or "error" in evaluation_metrics:
                ax.text(
                    0.5,
                    0.5,
                    "評価指標\nデータなし",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                ax.set_title("評価指標", fontsize=14, fontweight="bold")
                return

            metrics_data = []
            metric_names = []
            colors_list = []

            if "silhouette_score" in evaluation_metrics:
                score = evaluation_metrics["silhouette_score"]
                metrics_data.append(score)
                metric_names.append("シルエット係数")
                colors_list.append("skyblue" if score >= 0.5 else "lightcoral")

            if "calinski_harabasz_score" in evaluation_metrics:
                # 正規化（対数スケール）
                score = evaluation_metrics["calinski_harabasz_score"]
                normalized_score = min(1.0, score / 100)  # 100を基準として正規化
                metrics_data.append(normalized_score)
                metric_names.append("CH指標\n(正規化)")
                colors_list.append("lightgreen" if score >= 10 else "lightcoral")

            if "davies_bouldin_score" in evaluation_metrics:
                # 逆数で正規化（小さいほど良いため）
                score = evaluation_metrics["davies_bouldin_score"]
                normalized_score = 1 / (1 + score)  # 0-1の範囲に正規化
                metrics_data.append(normalized_score)
                metric_names.append("DB指標\n(逆数正規化)")
                colors_list.append("lightgreen" if score <= 1.0 else "lightcoral")

            if metrics_data:
                bars = ax.bar(
                    metric_names,
                    metrics_data,
                    color=colors_list,
                    alpha=0.7,
                    edgecolor="black",
                )

                # 値をバーの上に表示
                for i, (bar, name) in enumerate(zip(bars, metric_names)):
                    height = bar.get_height()
                    original_values = {
                        "シルエット係数": evaluation_metrics.get("silhouette_score", 0),
                        "CH指標\n(正規化)": evaluation_metrics.get(
                            "calinski_harabasz_score", 0
                        ),
                        "DB指標\n(逆数正規化)": evaluation_metrics.get(
                            "davies_bouldin_score", 0
                        ),
                    }
                    original_val = original_values.get(name, height)
                    ax.text(
                        bar.get_x() + bar.get_width() / 2.0,
                        height + 0.01,
                        f"{original_val:.3f}",
                        ha="center",
                        va="bottom",
                        fontsize=9,
                    )

            ax.set_title("クラスター評価指標", fontsize=14, fontweight="bold")
            ax.set_ylabel("正規化スコア", fontsize=12)
            ax.set_ylim(0, 1.1)
            ax.grid(True, linestyle=":", alpha=0.3)

        except Exception as e:
            print(f"評価指標プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"評価指標\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )
            ax.set_title("評価指標（エラー）", fontsize=14, fontweight="bold")

    def _create_metrics_comparison_plot_enhanced(self, ax, results):
        """拡張版評価指標比較プロット"""
        self._create_metrics_comparison_plot(ax, results)

    def _create_metrics_comparison_plot_safe(self, ax, results):
        """安全版評価指標比較プロット"""
        try:
            self._create_metrics_comparison_plot(ax, results)
        except Exception as e:
            print(f"評価指標プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"評価指標\nプロットエラー:\n{str(e)[:50]}...",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("評価指標（エラー）", fontsize=12, fontweight="bold")

    def _create_density_plot(self, ax, coordinates, labels):
        """密度分布プロット（DBSCAN用）"""
        try:
            ax.set_facecolor("white")

            # 密度の可視化（ヒートマップ）
            from scipy.stats import gaussian_kde

            if len(coordinates) < 3:
                ax.text(
                    0.5,
                    0.5,
                    "データ点が\n不足",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                return

            x, y = coordinates[:, 0], coordinates[:, 1]

            # 密度推定
            xy = np.vstack([x, y])
            kde = gaussian_kde(xy)

            # グリッド作成
            x_min, x_max = x.min() - 1, x.max() + 1
            y_min, y_max = y.min() - 1, y.max() + 1
            xx, yy = np.mgrid[x_min:x_max:50j, y_min:y_max:50j]
            positions = np.vstack([xx.ravel(), yy.ravel()])

            # 密度計算
            density = np.reshape(kde(positions).T, xx.shape)

            # プロット
            ax.contourf(xx, yy, density, levels=15, cmap="Blues", alpha=0.6)
            ax.contour(
                xx, yy, density, levels=15, colors="navy", alpha=0.3, linewidths=0.5
            )

            # データポイントをオーバーレイ
            unique_labels = np.unique(labels)
            colors = plt.cm.Set3(np.linspace(0, 1, len(unique_labels)))
            for i, label in enumerate(unique_labels):
                mask = labels == label
                if label == -1:
                    ax.scatter(x[mask], y[mask], c="red", marker="x", s=30, alpha=0.8)
                else:
                    ax.scatter(x[mask], y[mask], c=[colors[i]], s=30, alpha=0.8)

            ax.set_title("データ密度分布", fontsize=14, fontweight="bold")
            ax.set_xlabel("第1主成分", fontsize=12)
            ax.set_ylabel("第2主成分", fontsize=12)

        except Exception as e:
            print(f"密度プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"エラー: {str(e)}",
                ha="center",
                va="center",
                transform=ax.transAxes,
            )

    def _create_cluster_centers_plot(self, ax, results, df):
        """クラスター中心の特徴プロット（K-means用）"""
        try:
            ax.set_facecolor("white")

            centers = results.get("cluster_centers")
            feature_names = results.get("feature_names", [])

            if centers is None or not feature_names:
                ax.text(
                    0.5,
                    0.5,
                    "中心点データ\nなし",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                )
                ax.set_title("クラスター中心", fontsize=14, fontweight="bold")
                return

            centers_array = np.array(centers)
            n_clusters, n_features = centers_array.shape

            # 特徴量が多い場合は最初の6つまでに制限
            max_features = 6
            if n_features > max_features:
                centers_array = centers_array[:, :max_features]
                feature_names = feature_names[:max_features]

            # ヒートマップ風の表示
            im = ax.imshow(centers_array, cmap="RdYlBu_r", aspect="auto")

            # 軸設定
            ax.set_xticks(range(len(feature_names)))
            ax.set_xticklabels(feature_names, rotation=45, ha="right")
            ax.set_yticks(range(n_clusters))
            ax.set_yticklabels([f"クラスター{i+1}" for i in range(n_clusters)])

            # 値を表示
            for i in range(n_clusters):
                for j in range(len(feature_names)):
                    text = ax.text(
                        j,
                        i,
                        f"{centers_array[i, j]:.2f}",
                        ha="center",
                        va="center",
                        color="black",
                        fontsize=8,
                    )

            ax.set_title("クラスター中心の特徴", fontsize=14, fontweight="bold")
            plt.colorbar(im, ax=ax, shrink=0.6)

        except Exception as e:
            print(f"クラスター中心プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"クラスター中心\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )
            ax.set_title("クラスター中心（エラー）", fontsize=14, fontweight="bold")

    def _create_cluster_centers_plot_safe(self, ax, results, df):
        """安全版クラスター中心プロット"""
        try:
            self._create_cluster_centers_plot(ax, results, df)
        except Exception as e:
            print(f"クラスター中心プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"クラスター中心\nプロットエラー:\n{str(e)[:50]}...",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("クラスター中心（エラー）", fontsize=12, fontweight="bold")

    def _create_cluster_centers_plot_enhanced(self, ax, results, df):
        """拡張版クラスター中心プロット"""
        self._create_cluster_centers_plot(ax, results, df)

    def _create_noise_analysis_plot(self, ax, labels, results):
        """ノイズ分析プロット（DBSCAN用）"""
        try:
            ax.set_facecolor("white")

            # クラスターサイズとノイズポイントの分析
            unique_labels = np.unique(labels)
            noise_count = np.sum(labels == -1)
            cluster_counts = [
                np.sum(labels == label) for label in unique_labels if label != -1
            ]

            # パイチャート
            if cluster_counts:
                labels_pie = [f"クラスター{i+1}" for i in range(len(cluster_counts))]
                sizes = cluster_counts.copy()

                if noise_count > 0:
                    labels_pie.append("ノイズ")
                    sizes.append(noise_count)

                colors = plt.cm.Set3(np.linspace(0, 1, len(sizes)))
                if noise_count > 0:
                    colors[-1] = "lightcoral"  # ノイズは赤色

                wedges, texts, autotexts = ax.pie(
                    sizes,
                    labels=labels_pie,
                    autopct="%1.1f%%",
                    colors=colors,
                    startangle=90,
                )

                ax.set_title("クラスター分布", fontsize=14, fontweight="bold")

            else:
                ax.text(
                    0.5,
                    0.5,
                    "クラスターが\n形成されませんでした",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                    fontsize=12,
                )
                ax.set_title("クラスター分析結果", fontsize=14, fontweight="bold")

        except Exception as e:
            print(f"ノイズ分析プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"ノイズ分析\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )
            ax.set_title("ノイズ分析（エラー）", fontsize=14, fontweight="bold")

    def _ensure_hierarchical_has_dendrogram_data(self, results, df):
        """階層クラスタリングのデンドログラムデータを確保"""
        try:
            if (
                results.get("method") == "hierarchical"
                and results.get("dendrogram_data") is None
            ):
                print("デンドログラムデータを再計算中...")

                # 小さなデータセットの場合のみ再計算
                if len(df) <= 50:
                    from scipy.cluster.hierarchy import linkage
                    from scipy.spatial.distance import pdist
                    import numpy as np

                    # データ準備
                    data_array = df.select_dtypes(include=[np.number]).values.astype(
                        np.float64
                    )

                    # リンケージ計算
                    try:
                        linkage_matrix = linkage(
                            data_array, method="ward", metric="euclidean"
                        )
                        results["dendrogram_data"] = linkage_matrix
                        print("デンドログラムデータ再計算完了")
                    except Exception as e:
                        print(f"デンドログラム再計算エラー: {e}")
                        results["dendrogram_data"] = None
                else:
                    print("データが大きすぎるため、デンドログラム計算をスキップ")
                    results["dendrogram_data"] = None

        except Exception as e:
            print(f"デンドログラムデータ確保エラー: {e}")
            results["dendrogram_data"] = None

        return results

    def create_plot_with_dendrogram_fix(
        self, results: Dict[str, Any], df: pd.DataFrame
    ) -> str:
        """デンドログラム対応強化版プロット作成"""
        try:
            print("=== デンドログラム強化版プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            # 階層クラスタリングの場合、デンドログラムデータを確保
            results = self._ensure_hierarchical_has_dendrogram_data(results, df)

            method = results["method"]
            labels = np.array(results["labels"])
            pca_coordinates = np.array(results["pca_coordinates"])
            explained_variance_ratio = results["pca_explained_variance_ratio"]
            n_clusters = results["n_clusters"]

            print(
                f"プロット情報: method={method}, n_clusters={n_clusters}, samples={len(labels)}"
            )
            print(
                f"デンドログラムデータ有無: {'有' if results.get('dendrogram_data') is not None else '無'}"
            )

            # 手法に応じたレイアウト設定
            if method == "hierarchical":
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_dendro = fig.add_subplot(gs[0, 1])  # デンドログラム
                ax_elbow = fig.add_subplot(gs[1, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[0, 2])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[1, 2])  # 評価指標
            elif method == "kmeans":
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_elbow = fig.add_subplot(gs[0, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[1, 1])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[0, 2])  # 評価指標
                ax_center = fig.add_subplot(gs[1, 2])  # クラスター中心
            else:  # DBSCAN
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_density = fig.add_subplot(gs[0, 1])  # 密度分布
                ax_noise = fig.add_subplot(gs[1, 1])  # ノイズ分析
                ax_metrics = fig.add_subplot(gs[0, 2])  # 評価指標
                ax_param = fig.add_subplot(gs[1, 2])  # パラメータ感度

            # 背景設定
            fig.patch.set_facecolor("white")
            colors = plt.cm.Set3(np.linspace(0, 1, max(n_clusters, 3)))

            # 1. メインのクラスター散布図
            try:
                self._create_enhanced_cluster_scatter_plot(
                    ax_main,
                    pca_coordinates,
                    labels,
                    colors,
                    explained_variance_ratio,
                    method,
                    results,
                    df,
                )
            except Exception as e:
                print(f"メイン散布図エラー: {e}")
                # フォールバック: 基本散布図
                unique_labels = np.unique(labels)
                for i, label in enumerate(unique_labels):
                    mask = labels == label
                    ax_main.scatter(
                        pca_coordinates[mask, 0],
                        pca_coordinates[mask, 1],
                        label=f"クラスター {label + 1}",
                        alpha=0.7,
                    )
                ax_main.set_title("クラスター分析結果", fontsize=14, fontweight="bold")
                ax_main.legend()

            # 2. 手法別の追加プロット（安全版）
            try:
                if method == "hierarchical":
                    print("階層クラスタリングプロット作成中...")
                    self._create_dendrogram_plot_safe(ax_dendro, results, df)
                    self._create_elbow_plot_safe(ax_elbow, df, results)
                    self._create_silhouette_analysis_plot_safe(
                        ax_silhouette, df, labels, results
                    )
                    self._create_metrics_comparison_plot_safe(ax_metrics, results)

                elif method == "kmeans":
                    print("K-meansプロット作成中...")
                    self._create_elbow_plot_safe(ax_elbow, df, results)
                    self._create_silhouette_analysis_plot_safe(
                        ax_silhouette, df, labels, results
                    )
                    self._create_metrics_comparison_plot_safe(ax_metrics, results)
                    self._create_cluster_centers_plot_safe(ax_center, results, df)

                else:  # DBSCAN
                    print("DBSCANプロット作成中...")
                    self._create_density_plot_safe(ax_density, pca_coordinates, labels)
                    self._create_noise_analysis_plot_safe(ax_noise, labels, results)
                    self._create_metrics_comparison_plot_safe(ax_metrics, results)
                    self._create_parameter_sensitivity_plot_safe(ax_param, results)

            except Exception as subplot_error:
                print(f"サブプロット作成エラー: {subplot_error}")
                # エラーが発生したサブプロットにエラーメッセージを表示
                pass  # メインプロットは作成済みなので続行

            # レイアウト調整
            plt.tight_layout()

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"デンドログラム強化版プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"デンドログラム強化版プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")

            # フォールバック: シンプルなプロットを作成
            try:
                return self.create_simple_plot_fallback(results, df)
            except:
                return ""

    def test_dendrogram_capability(self, df):
        """デンドログラム作成可能性をテスト"""
        try:
            print(f"デンドログラムテスト開始: サンプル数={len(df)}")

            if len(df) > 100:
                print("❌ サンプル数が多すぎます（>100）")
                return False

            if len(df) < 3:
                print("❌ サンプル数が少なすぎます（<3）")
                return False

            from scipy.cluster.hierarchy import linkage
            import numpy as np

            # 数値データのみ選択
            numeric_df = df.select_dtypes(include=[np.number])
            if numeric_df.empty:
                print("❌ 数値データがありません")
                return False

            # 小規模テスト
            test_data = numeric_df.iloc[: min(5, len(numeric_df))].values.astype(
                np.float64
            )

            try:
                test_linkage = linkage(test_data, method="ward")
                print("✅ デンドログラム作成可能")
                return True
            except Exception as e:
                print(f"❌ リンケージ計算エラー: {e}")
                return False

        except Exception as e:
            print(f"❌ デンドログラムテストエラー: {e}")
            return False

    # 12. ノイズ分析プロット（拡張版）
    def _create_noise_analysis_plot_enhanced(self, ax, labels, results):
        """拡張版ノイズ分析プロット"""
        self._create_noise_analysis_plot(ax, labels, results)

    def _create_noise_analysis_plot_safe(self, ax, labels, results):
        """安全版ノイズ分析プロット"""
        try:
            self._create_noise_analysis_plot(ax, labels, results)
        except Exception as e:
            print(f"ノイズ分析プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"ノイズ分析\nプロットエラー:\n{str(e)[:50]}...",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("ノイズ分析（エラー）", fontsize=12, fontweight="bold")

    def _create_parameter_sensitivity_plot(self, ax, results):
        """パラメータ感度分析プロット（DBSCAN用）"""
        try:
            ax.set_facecolor("white")

            evaluation_metrics = results.get("evaluation_metrics", {})

            # DBSCANパラメータの表示
            info_text = "DBSCAN パラメータ\n\n"

            # resultsから推定可能な情報を表示
            n_clusters = results.get("n_clusters", 0)
            noise_ratio = evaluation_metrics.get("noise_ratio", 0)

            info_text += f"検出クラスター数: {n_clusters}\n"
            info_text += f"ノイズ率: {noise_ratio*100:.1f}%\n"

            if "silhouette_score" in evaluation_metrics:
                info_text += (
                    f"シルエット係数: {evaluation_metrics['silhouette_score']:.3f}\n"
                )

            # 推奨事項
            info_text += "\n推奨事項:\n"
            if noise_ratio > 0.3:
                info_text += "• ノイズ率が高いです\n• eps値を大きくするか\n• min_samples値を小さくすることを検討"
            elif noise_ratio < 0.05:
                info_text += "• ノイズが少なすぎます\n• eps値を小さくするか\n• min_samples値を大きくすることを検討"
            else:
                info_text += "• パラメータ設定は\n  適切です"

            ax.text(
                0.1,
                0.9,
                info_text,
                transform=ax.transAxes,
                fontsize=10,
                verticalalignment="top",
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightyellow", alpha=0.8),
            )

            ax.set_title("パラメータ分析", fontsize=14, fontweight="bold")
            ax.set_xlim(0, 1)
            ax.set_ylim(0, 1)
            ax.axis("off")

        except Exception as e:
            print(f"パラメータ感度プロット作成エラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"パラメータ分析\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )
            ax.set_title("パラメータ分析（エラー）", fontsize=14, fontweight="bold")

    # 14. パラメータ感度プロット（拡張版）
    def _create_parameter_sensitivity_plot_enhanced(self, ax, results):
        """拡張版パラメータ感度プロット"""
        self._create_parameter_sensitivity_plot(ax, results)

    def _create_parameter_sensitivity_plot_safe(self, ax, results):
        """安全版パラメータ感度プロット"""
        try:
            self._create_parameter_sensitivity_plot(ax, results)
        except Exception as e:
            print(f"パラメータ感度プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                f"パラメータ分析\nプロットエラー:\n{str(e)[:50]}...",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=10,
                bbox=dict(boxstyle="round,pad=0.5", facecolor="lightcoral", alpha=0.8),
            )
            ax.set_title("パラメータ分析（エラー）", fontsize=12, fontweight="bold")

    # 既存のcreate_plot メソッドもシンプル版として保持（後方互換性のため）
    def create_simple_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """シンプル版のクラスター分析プロット（既存互換性用）"""
        try:
            print("=== シンプルプロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            method = results["method"]
            labels = np.array(results["labels"])
            pca_coordinates = np.array(results["pca_coordinates"])
            explained_variance_ratio = results["pca_explained_variance_ratio"]
            n_clusters = results["n_clusters"]

            # サブプロットの設定
            if method == "hierarchical":
                fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 8))
            else:
                fig, ax1 = plt.subplots(figsize=(12, 8))

            # 背景設定
            fig.patch.set_facecolor("white")

            # カラーパレットの設定
            colors = plt.cm.Set3(np.linspace(0, 1, max(n_clusters, 3)))

            # メインのクラスター散布図
            self._create_cluster_scatter_plot(
                ax1,
                pca_coordinates,
                labels,
                colors,
                explained_variance_ratio,
                method,
                results,
            )

            # 階層クラスタリングの場合はデンドログラムも表示
            if method == "hierarchical" and "dendrogram_data" in results:
                self._create_dendrogram_plot(ax2, results, df)

            plt.tight_layout()

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"シンプルプロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"シンプルプロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

    def _save_coordinates_data(
        self, db, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """クラスター分析の座標データ保存"""
        try:
            from models import CoordinatesData

            pca_coordinates = results.get("pca_coordinates")
            labels = results.get("labels")
            sample_names = results.get("sample_names", df.index.tolist())

            if pca_coordinates is not None and labels is not None:
                for i, name in enumerate(sample_names):
                    # クラスターラベルを含む観測値として保存
                    coord_data = CoordinatesData(
                        session_id=session_id,
                        point_name=f"{name} (クラスター{labels[i] + 1})",
                        point_type="observation",
                        dimension_1=(
                            float(pca_coordinates[i, 0])
                            if pca_coordinates.shape[1] > 0
                            else 0.0
                        ),
                        dimension_2=(
                            float(pca_coordinates[i, 1])
                            if pca_coordinates.shape[1] > 1
                            else 0.0
                        ),
                    )
                    db.add(coord_data)

        except Exception as e:
            print(f"クラスター座標データ保存エラー: {e}")

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
        pca_coordinates = results["pca_coordinates"]
        labels = results["labels"]
        sample_names = results["sample_names"]

        return {
            "success": True,
            "session_id": session_id,
            "analysis_type": self.get_analysis_type(),
            "data": {
                "method": results["method"],
                "n_clusters": results["n_clusters"],
                "total_inertia": float(results.get("total_inertia", 0)),
                "eigenvalues": [float(x) for x in results.get("eigenvalues", [])],
                "explained_inertia": [
                    float(x) for x in results.get("explained_inertia", [])
                ],
                "cumulative_inertia": [
                    float(x) for x in results.get("cumulative_inertia", [])
                ],
                "evaluation_metrics": results.get("evaluation_metrics", {}),
                "cluster_sizes": results.get("cluster_sizes", []),
                "plot_image": plot_base64,
                "coordinates": {
                    "observations": [
                        {
                            "name": str(sample_names[i]),
                            "cluster": int(labels[i]) + 1 if labels[i] != -1 else -1,
                            "dimension_1": float(pca_coordinates[i, 0]),
                            "dimension_2": float(pca_coordinates[i, 1]),
                        }
                        for i in range(len(sample_names))
                    ]
                },
            },
            "metadata": {
                "session_name": session_name,
                "filename": file.filename,
                "rows": df.shape[0],
                "columns": df.shape[1],
                "row_names": [str(x) for x in df.index],
                "column_names": [str(x) for x in df.columns],
                "method": results["method"],
            },
        }

    # python-api/analysis/cluster.py への修正

    # 1. ClusterAnalyzerクラスに具象のcreate_plotメソッドを追加

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """修正版包括プロット作成 - 抽象メソッド実装"""
        try:
            print("=== 包括プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            method = results["method"]
            labels = np.array(results["labels"])
            pca_coordinates = np.array(results["pca_coordinates"])
            explained_variance_ratio = results["pca_explained_variance_ratio"]
            n_clusters = results["n_clusters"]

            print(
                f"プロット情報: method={method}, n_clusters={n_clusters}, samples={len(labels)}"
            )

            # 手法に応じたレイアウト設定
            if method == "hierarchical":
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_dendro = fig.add_subplot(gs[0, 1])  # デンドログラム
                ax_elbow = fig.add_subplot(gs[1, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[0, 2])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[1, 2])  # 評価指標
            elif method == "kmeans":
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_elbow = fig.add_subplot(gs[0, 1])  # エルボー法
                ax_silhouette = fig.add_subplot(gs[1, 1])  # シルエット分析
                ax_metrics = fig.add_subplot(gs[0, 2])  # 評価指標
                ax_center = fig.add_subplot(gs[1, 2])  # クラスター中心
            else:  # DBSCAN
                fig = plt.figure(figsize=(20, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[1.5, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])  # メイン散布図
                ax_density = fig.add_subplot(gs[0, 1])  # 密度分布
                ax_noise = fig.add_subplot(gs[1, 1])  # ノイズ分析
                ax_metrics = fig.add_subplot(gs[0, 2])  # 評価指標
                ax_param = fig.add_subplot(gs[1, 2])  # パラメータ感度

            # 背景設定
            fig.patch.set_facecolor("white")
            colors = plt.cm.Set3(np.linspace(0, 1, max(n_clusters, 3)))

            # 1. メインのクラスター散布図
            self._create_enhanced_cluster_scatter_plot(
                ax_main,
                pca_coordinates,
                labels,
                colors,
                explained_variance_ratio,
                method,
                results,
                df,
            )

            # 2. 手法別の追加プロット（安全版）
            try:
                if method == "hierarchical":
                    print("階層クラスタリングプロット作成中...")
                    self._create_dendrogram_plot_safe(ax_dendro, results, df)
                    self._create_elbow_plot_safe(ax_elbow, df, results)
                    self._create_silhouette_analysis_plot_safe(
                        ax_silhouette, df, labels, results
                    )
                    self._create_metrics_comparison_plot_safe(ax_metrics, results)

                elif method == "kmeans":
                    print("K-meansプロット作成中...")
                    self._create_elbow_plot_safe(ax_elbow, df, results)
                    self._create_silhouette_analysis_plot_safe(
                        ax_silhouette, df, labels, results
                    )
                    self._create_metrics_comparison_plot_safe(ax_metrics, results)
                    self._create_cluster_centers_plot_safe(ax_center, results, df)

                else:  # DBSCAN
                    print("DBSCANプロット作成中...")
                    self._create_density_plot_safe(ax_density, pca_coordinates, labels)
                    self._create_noise_analysis_plot_safe(ax_noise, labels, results)
                    self._create_metrics_comparison_plot_safe(ax_metrics, results)
                    self._create_parameter_sensitivity_plot_safe(ax_param, results)

            except Exception as subplot_error:
                print(f"サブプロット作成エラー: {subplot_error}")
                # エラーが発生したサブプロットにエラーメッセージを表示
                pass  # メインプロットは作成済みなので続行

            # レイアウト調整
            plt.tight_layout()

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"包括プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"包括プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")

            # フォールバック: シンプルなプロットを作成
            try:
                return self.create_simple_plot_fallback(results, df)
            except:
                return ""

    # 2. 修正版階層クラスタリング（デンドログラム対応）
    def _compute_hierarchical(
        self, df: pd.DataFrame, n_clusters: int, **kwargs
    ) -> Dict[str, Any]:
        """修正版階層クラスタリング - デンドログラム安定化"""
        linkage_method = kwargs.get("linkage", "ward")

        try:
            print(f"階層クラスタリング開始: method={linkage_method}, samples={len(df)}")

            # 階層クラスタリング実行
            from sklearn.cluster import AgglomerativeClustering

            clustering = AgglomerativeClustering(
                n_clusters=n_clusters, linkage=linkage_method
            )
            labels = clustering.fit_predict(df)
            print(f"sklearn clustering完了: {len(np.unique(labels))} クラスター")

            # デンドログラム用のリンケージ行列を計算
            linkage_matrix = None

            try:
                # サンプル数チェック（100サンプル以下に制限）
                n_samples = len(df)

                if n_samples > 100:
                    print(
                        f"サンプル数が多すぎます({n_samples})。デンドログラム計算をスキップ。"
                    )
                    linkage_matrix = None
                else:
                    from scipy.cluster.hierarchy import linkage
                    from scipy.spatial.distance import pdist
                    import numpy as np

                    # データ型の確認と修正
                    data_array = df.values.astype(np.float64)
                    print(
                        f"データ配列形状: {data_array.shape}, dtype: {data_array.dtype}"
                    )

                    # NaNや無限値のチェック
                    if np.any(np.isnan(data_array)) or np.any(np.isinf(data_array)):
                        print("NaNまたは無限値を検出。データをクリーニングします。")
                        data_array = np.nan_to_num(
                            data_array, nan=0.0, posinf=1e10, neginf=-1e10
                        )

                    # リンケージ計算
                    if linkage_method == "ward":
                        print("Ward法でリンケージ計算中...")
                        linkage_matrix = linkage(
                            data_array, method="ward", metric="euclidean"
                        )
                    else:
                        print(f"{linkage_method}法でリンケージ計算中...")
                        # 距離行列を事前計算
                        distances = pdist(data_array, metric="euclidean")

                        # 距離に問題がないかチェック
                        if np.any(np.isnan(distances)) or np.any(np.isinf(distances)):
                            print(
                                "距離計算に問題があります。ユークリッド距離を再計算します。"
                            )
                            distances = np.nan_to_num(
                                distances, nan=1.0, posinf=1e10, neginf=0.0
                            )

                        linkage_matrix = linkage(distances, method=linkage_method)

                    print(f"リンケージ行列計算完了: {linkage_matrix.shape}")

                    # リンケージ行列の妥当性チェック
                    if linkage_matrix is not None:
                        if np.any(np.isnan(linkage_matrix)) or np.any(
                            np.isinf(linkage_matrix)
                        ):
                            print(
                                "リンケージ行列に無効な値があります。None に設定します。"
                            )
                            linkage_matrix = None
                        elif linkage_matrix.shape[0] != n_samples - 1:
                            print(
                                f"リンケージ行列のサイズが不正です: {linkage_matrix.shape[0]} != {n_samples - 1}"
                            )
                            linkage_matrix = None
                        else:
                            print("リンケージ行列は正常です。")

            except Exception as linkage_error:
                print(f"リンケージ計算エラー: {linkage_error}")
                import traceback

                print(f"リンケージエラー詳細:\n{traceback.format_exc()}")
                linkage_matrix = None

            return {
                "labels": labels,
                "centers": None,  # 階層クラスタリングには中心点がない
                "dendrogram_data": linkage_matrix,
            }

        except Exception as e:
            print(f"階層クラスタリング全体エラー: {e}")
            import traceback

            print(f"階層エラー詳細:\n{traceback.format_exc()}")

            # フォールバック: K-meansに切り替え
            print("フォールバック: K-meansを使用します")
            try:
                from sklearn.cluster import KMeans

                kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                labels = kmeans.fit_predict(df)

                return {
                    "labels": labels,
                    "centers": kmeans.cluster_centers_,
                    "dendrogram_data": None,
                }
            except Exception as fallback_error:
                print(f"フォールバックエラー: {fallback_error}")
                raise
