# python-api/analysis/cluster.py
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    silhouette_score,
    calinski_harabasz_score,
    davies_bouldin_score,
)
from sklearn.decomposition import PCA
from scipy.cluster.hierarchy import dendrogram, linkage
import seaborn as sns
from .base import BaseAnalyzer


class ClusterAnalyzer(BaseAnalyzer):
    """クラスター解析クラス - シンプル版"""

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
            print(f"手法: {method}, クラスター数: {n_clusters}, 標準化: {standardize}")

            # データの前処理
            df_processed = self._preprocess_data(df, standardize)

            # クラスター分析の実行
            cluster_result = self._perform_clustering(
                df_processed, method, n_clusters, **kwargs
            )

            # 評価指標の計算
            evaluation_metrics = self._calculate_evaluation_metrics(
                df_processed, cluster_result["labels"]
            )

            # PCA による次元削減（可視化用）
            pca_result = self._perform_pca(df_processed)

            # 結果をまとめる
            results = {
                "method": method,
                "n_clusters": n_clusters,
                "labels": cluster_result["labels"].tolist(),
                "cluster_centers": cluster_result.get("centers"),
                "dendrogram_data": cluster_result.get("dendrogram_data"),
                "evaluation_metrics": evaluation_metrics,
                "pca_coordinates": pca_result["coordinates"],
                "pca_explained_variance_ratio": pca_result["explained_variance_ratio"],
                "cluster_sizes": [
                    int(np.sum(cluster_result["labels"] == i))
                    for i in range(n_clusters)
                ],
                "sample_names": df.index.tolist(),
                "feature_names": df.columns.tolist(),
                # BaseAnalyzer の save_to_database で使用される標準フィールド
                "eigenvalues": pca_result["explained_variance_ratio"],
                "explained_inertia": pca_result["explained_variance_ratio"],
                "cumulative_inertia": np.cumsum(
                    pca_result["explained_variance_ratio"]
                ).tolist(),
                "total_inertia": float(np.sum(pca_result["explained_variance_ratio"])),
            }

            print(f"クラスター分析完了")
            return results

        except Exception as e:
            print(f"分析エラー: {str(e)}")
            raise

    def _preprocess_data(
        self, df: pd.DataFrame, standardize: bool = True
    ) -> pd.DataFrame:
        """データの前処理"""
        # 基底クラスの前処理を使用
        df_clean = self.preprocess_data(df)

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
            return df_scaled

        return df_numeric

    def _perform_clustering(
        self, df: pd.DataFrame, method: str, n_clusters: int, **kwargs
    ) -> Dict[str, Any]:
        """クラスタリングの実行"""
        if method == "kmeans":
            return self._kmeans_clustering(df, n_clusters, **kwargs)
        elif method == "hierarchical":
            return self._hierarchical_clustering(df, n_clusters, **kwargs)
        elif method == "dbscan":
            return self._dbscan_clustering(df, **kwargs)
        else:
            raise ValueError(f"サポートされていない手法です: {method}")

    def _kmeans_clustering(
        self, df: pd.DataFrame, n_clusters: int, **kwargs
    ) -> Dict[str, Any]:
        """K-meansクラスタリング"""
        random_state = kwargs.get("random_state", 42)

        kmeans = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=10)
        labels = kmeans.fit_predict(df)

        return {
            "labels": labels,
            "centers": kmeans.cluster_centers_.tolist(),
            "dendrogram_data": None,
        }

    def _hierarchical_clustering(
        self, df: pd.DataFrame, n_clusters: int, **kwargs
    ) -> Dict[str, Any]:
        """階層クラスタリング - デンドログラム生成改善版"""
        linkage_method = kwargs.get("linkage", "ward")

        try:
            print(
                f"階層クラスタリング開始: method={linkage_method}, samples={len(df)}, n_clusters={n_clusters}"
            )

            # sklearn で階層クラスタリング
            from sklearn.cluster import AgglomerativeClustering

            clustering = AgglomerativeClustering(
                n_clusters=n_clusters, linkage=linkage_method
            )
            labels = clustering.fit_predict(df)
            print(f"sklearn clustering完了: {len(np.unique(labels))} クラスター")

            # デンドログラム用のリンケージ行列を必ず計算
            dendrogram_data = None
            try:
                from scipy.cluster.hierarchy import linkage
                import numpy as np

                print(f"デンドログラム計算開始: samples={len(df)}")

                # データ型の確認と修正
                data_array = df.values.astype(np.float64)
                print(
                    f"データ配列準備完了: shape={data_array.shape}, dtype={data_array.dtype}"
                )

                # NaNや無限値のチェックと修正
                if np.any(np.isnan(data_array)) or np.any(np.isinf(data_array)):
                    print("NaNまたは無限値を検出。データをクリーニングします。")
                    data_array = np.nan_to_num(
                        data_array, nan=0.0, posinf=1e10, neginf=-1e10
                    )

                # リンケージ計算（サンプル数制限を緩和）
                max_samples_for_dendrogram = 200  # 制限を100から200に拡大

                if len(df) <= max_samples_for_dendrogram:
                    if linkage_method == "ward":
                        print("Ward法でリンケージ計算中...")
                        dendrogram_data = linkage(
                            data_array, method="ward", metric="euclidean"
                        )
                    else:
                        print(f"{linkage_method}法でリンケージ計算中...")
                        dendrogram_data = linkage(
                            data_array, method=linkage_method, metric="euclidean"
                        )

                    print(f"リンケージ行列計算完了: shape={dendrogram_data.shape}")

                    # リンケージ行列の妥当性チェック
                    if dendrogram_data is not None:
                        n_samples = len(df)
                        if np.any(np.isnan(dendrogram_data)) or np.any(
                            np.isinf(dendrogram_data)
                        ):
                            print(
                                "リンケージ行列に無効な値があります。None に設定します。"
                            )
                            dendrogram_data = None
                        elif dendrogram_data.shape[0] != n_samples - 1:
                            print(
                                f"リンケージ行列のサイズが不正です: {dendrogram_data.shape[0]} != {n_samples - 1}"
                            )
                            dendrogram_data = None
                        else:
                            print("✅ デンドログラム用リンケージ行列は正常です。")
                else:
                    print(
                        f"サンプル数が多すぎます({len(df)})。デンドログラム計算をスキップ。"
                    )
                    dendrogram_data = None

            except Exception as linkage_error:
                print(f"リンケージ計算エラー: {linkage_error}")
                import traceback

                print(f"リンケージエラー詳細:\n{traceback.format_exc()}")
                dendrogram_data = None

            result = {
                "labels": labels,
                "centers": None,  # 階層クラスタリングには中心点がない
                "dendrogram_data": dendrogram_data,
            }

            print(
                f"階層クラスタリング結果: labels={len(labels)}, dendrogram_available={'Yes' if dendrogram_data is not None else 'No'}"
            )
            return result

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

    def _dbscan_clustering(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """DBSCANクラスタリング"""
        eps = kwargs.get("eps", 0.5)
        min_samples = kwargs.get("min_samples", 5)

        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        labels = dbscan.fit_predict(df)

        return {
            "labels": labels,
            "centers": None,
            "dendrogram_data": None,
        }

    def _calculate_evaluation_metrics(
        self, df: pd.DataFrame, labels: np.ndarray
    ) -> Dict[str, float]:
        """評価指標の計算"""
        metrics = {}

        try:
            # ノイズポイント（-1ラベル）を除外
            valid_mask = labels != -1
            if np.sum(valid_mask) < 2:
                return {"error": "有効なクラスターが不足しています"}

            valid_data = df[valid_mask]
            valid_labels = labels[valid_mask]
            n_clusters = len(np.unique(valid_labels))

            if n_clusters > 1:
                # シルエット係数
                metrics["silhouette_score"] = float(
                    silhouette_score(valid_data, valid_labels)
                )

                # Calinski-Harabasz指標
                metrics["calinski_harabasz_score"] = float(
                    calinski_harabasz_score(valid_data, valid_labels)
                )

                # Davies-Bouldin指標
                metrics["davies_bouldin_score"] = float(
                    davies_bouldin_score(valid_data, valid_labels)
                )

            # ノイズ比率
            metrics["noise_ratio"] = float(np.sum(labels == -1) / len(labels))

        except Exception as e:
            print(f"評価指標計算エラー: {e}")
            metrics["error"] = str(e)

        return metrics

    def _perform_pca(self, df: pd.DataFrame) -> Dict[str, Any]:
        """可視化用PCA"""
        try:
            n_components = min(2, df.shape[1], df.shape[0] - 1)
            pca = PCA(n_components=n_components)
            coordinates = pca.fit_transform(df)

            return {
                "coordinates": coordinates,
                "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
                "components": pca.components_.tolist(),
            }
        except Exception as e:
            print(f"PCA計算エラー: {e}")
            # フォールバック
            return {
                "coordinates": (
                    df.iloc[:, :2].values
                    if df.shape[1] >= 2
                    else np.column_stack([df.iloc[:, 0].values, np.zeros(len(df))])
                ),
                "explained_variance_ratio": [1.0, 0.0],
                "components": [[1.0, 0.0], [0.0, 1.0]],
            }

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """プロット作成 - シンプル版"""
        try:
            print("=== プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            method = results["method"]
            labels = np.array(results["labels"])
            pca_coordinates = np.array(results["pca_coordinates"])
            explained_variance_ratio = results["pca_explained_variance_ratio"]
            n_clusters = results["n_clusters"]

            # レイアウト設定
            if method == "hierarchical" and results.get("dendrogram_data") is not None:
                # 階層クラスタリング（デンドログラム付き）
                fig = plt.figure(figsize=(18, 12))
                gs = fig.add_gridspec(
                    2, 3, height_ratios=[1, 1], width_ratios=[2, 1, 1]
                )
                ax_main = fig.add_subplot(gs[:, 0])
                ax_dendro = fig.add_subplot(gs[0, 1])
                ax_elbow = fig.add_subplot(gs[1, 1])
                ax_metrics = fig.add_subplot(gs[:, 2])
            else:
                # その他の手法
                fig = plt.figure(figsize=(16, 10))
                gs = fig.add_gridspec(2, 2, height_ratios=[2, 1])
                ax_main = fig.add_subplot(gs[0, :])
                ax_elbow = fig.add_subplot(gs[1, 0])
                ax_metrics = fig.add_subplot(gs[1, 1])

            fig.patch.set_facecolor("white")

            # 1. メインのクラスター分布図
            self._create_cluster_plot(
                ax_main,
                pca_coordinates,
                labels,
                explained_variance_ratio,
                method,
                results,
            )

            # 2. エルボー法プロット
            self._create_elbow_plot(ax_elbow, df, results)

            # 3. 評価指標プロット
            self._create_metrics_plot(ax_metrics, results)

            # 4. デンドログラム（階層クラスタリングの場合）
            if method == "hierarchical" and results.get("dendrogram_data") is not None:
                self._create_dendrogram_plot(ax_dendro, results, df)

            plt.tight_layout()
            plot_base64 = self.save_plot_as_base64(fig)
            print("プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"プロット作成エラー: {str(e)}")
            return self._create_fallback_plot(results, df)

    def _create_cluster_plot(
        self, ax, coordinates, labels, explained_variance_ratio, method, results
    ):
        """クラスター分布図の作成"""
        try:
            ax.set_facecolor("white")

            unique_labels = np.unique(labels)
            colors = plt.cm.Set3(np.linspace(0, 1, len(unique_labels)))

            # クラスターごとにプロット
            for i, label in enumerate(unique_labels):
                mask = labels == label
                if label == -1:  # ノイズポイント（DBSCAN）
                    ax.scatter(
                        coordinates[mask, 0],
                        coordinates[mask, 1],
                        c="black",
                        marker="x",
                        s=80,
                        alpha=0.8,
                        label="ノイズ",
                    )
                else:
                    ax.scatter(
                        coordinates[mask, 0],
                        coordinates[mask, 1],
                        c=[colors[i]],
                        s=100,
                        alpha=0.7,
                        edgecolor="white",
                        linewidth=0.5,
                        label=f"クラスター {label + 1}",
                    )

            # クラスター中心点（K-meansの場合）
            if method == "kmeans" and results.get("cluster_centers"):
                try:
                    # PCA変換した中心点の近似
                    from sklearn.decomposition import PCA

                    centers = np.array(results["cluster_centers"])
                    pca = PCA(n_components=2)
                    # 元データで学習済みのPCAを使うべきだが、簡易版として再計算
                    pca.fit(centers)
                    centers_2d = pca.transform(centers)

                    ax.scatter(
                        centers_2d[:, 0],
                        centers_2d[:, 1],
                        c="red",
                        marker="*",
                        s=300,
                        edgecolor="black",
                        linewidth=2,
                        label="クラスター中心",
                        zorder=10,
                    )
                except:
                    pass  # 中心点表示でエラーが出ても無視

            # 軸ラベルとタイトル
            if len(explained_variance_ratio) >= 2:
                ax.set_xlabel(
                    f"第1主成分 ({explained_variance_ratio[0]*100:.1f}% 説明)",
                    fontsize=12,
                    fontweight="bold",
                )
                ax.set_ylabel(
                    f"第2主成分 ({explained_variance_ratio[1]*100:.1f}% 説明)",
                    fontsize=12,
                    fontweight="bold",
                )

            method_names = {
                "kmeans": "K-means法",
                "hierarchical": "階層クラスタリング",
                "dbscan": "DBSCAN法",
            }
            ax.set_title(
                f"{method_names.get(method, method)}によるクラスター分析結果",
                fontsize=16,
                fontweight="bold",
                pad=20,
            )

            ax.grid(True, linestyle=":", alpha=0.6)
            ax.legend(fontsize=10, loc="best")

            # 評価指標の表示
            evaluation_metrics = results.get("evaluation_metrics", {})
            if evaluation_metrics and "error" not in evaluation_metrics:
                info_text = f"クラスター数: {results['n_clusters']}\n"
                if "silhouette_score" in evaluation_metrics:
                    info_text += (
                        f"シルエット係数: {evaluation_metrics['silhouette_score']:.3f}"
                    )

                ax.text(
                    0.02,
                    0.98,
                    info_text,
                    transform=ax.transAxes,
                    fontsize=10,
                    bbox=dict(
                        boxstyle="round,pad=0.5", facecolor="lightblue", alpha=0.8
                    ),
                    verticalalignment="top",
                )

        except Exception as e:
            print(f"クラスター分布図エラー: {e}")

    def _create_elbow_plot(self, ax, df, results):
        """エルボー法プロット"""
        try:
            ax.set_facecolor("white")

            # K=2から10までの慣性を計算
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
                except:
                    inertias.append(0)

            if inertias:
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
                ax.set_ylabel("慣性 (Within-cluster sum of squares)", fontsize=12)
                ax.set_title("エルボー法", fontsize=14, fontweight="bold")
                ax.grid(True, linestyle=":", alpha=0.6)

        except Exception as e:
            print(f"エルボー法プロットエラー: {e}")
            ax.text(
                0.5,
                0.5,
                "エルボー法\nエラー",
                ha="center",
                va="center",
                transform=ax.transAxes,
                fontsize=12,
            )

    def _create_metrics_plot(self, ax, results):
        """評価指標プロット"""
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

            # 主要な評価指標を表示
            metrics_data = []
            metric_names = []
            colors_list = []

            if "silhouette_score" in evaluation_metrics:
                score = evaluation_metrics["silhouette_score"]
                metrics_data.append(score)
                metric_names.append("シルエット係数")
                colors_list.append("skyblue" if score >= 0.5 else "lightcoral")

            if "calinski_harabasz_score" in evaluation_metrics:
                # 正規化
                score = evaluation_metrics["calinski_harabasz_score"]
                normalized_score = min(1.0, score / 100)
                metrics_data.append(normalized_score)
                metric_names.append("CH指標\n(正規化)")
                colors_list.append("lightgreen" if score >= 10 else "lightcoral")

            if "davies_bouldin_score" in evaluation_metrics:
                # 逆数で正規化（小さいほど良いため）
                score = evaluation_metrics["davies_bouldin_score"]
                normalized_score = 1 / (1 + score)
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

                # 元の値をバーの上に表示
                original_values = [
                    evaluation_metrics.get("silhouette_score", 0),
                    evaluation_metrics.get("calinski_harabasz_score", 0),
                    evaluation_metrics.get("davies_bouldin_score", 0),
                ]

                for bar, name, orig_val in zip(
                    bars, metric_names, original_values[: len(bars)]
                ):
                    height = bar.get_height()
                    ax.text(
                        bar.get_x() + bar.get_width() / 2.0,
                        height + 0.01,
                        f"{orig_val:.3f}",
                        ha="center",
                        va="bottom",
                        fontsize=9,
                    )

            ax.set_title("クラスター評価指標", fontsize=14, fontweight="bold")
            ax.set_ylabel("正規化スコア", fontsize=12)
            ax.set_ylim(0, 1.1)
            ax.grid(True, linestyle=":", alpha=0.3)

        except Exception as e:
            print(f"評価指標プロットエラー: {e}")

    def _create_dendrogram_plot(self, ax, results, df):
        """デンドログラムプロット - 改善版"""
        try:
            ax.set_facecolor("white")
            dendrogram_data = results.get("dendrogram_data")

            print(
                f"デンドログラムプロット作成: データ有無={dendrogram_data is not None}"
            )

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
                max_display_labels = 20  # 表示ラベル数を制限

                if n_samples <= max_display_labels:
                    labels = [str(idx) for idx in df.index[:max_display_labels]]
                    truncate_mode = None
                    p_param = None
                else:
                    labels = None  # ラベルなしで描画
                    truncate_mode = "lastp"
                    p_param = max_display_labels

                print(
                    f"デンドログラム描画準備: samples={n_samples}, labels={len(labels) if labels else 0}, truncate={truncate_mode}"
                )

                # デンドログラム描画パラメータ
                dend_params = {
                    "Z": dendrogram_data,
                    "ax": ax,
                    "leaf_rotation": 90,
                    "leaf_font_size": 8 if labels else 10,
                    "color_threshold": 0.7 * np.max(dendrogram_data[:, 2]),
                    "above_threshold_color": "lightgray",
                }

                if labels:
                    dend_params["labels"] = labels
                if truncate_mode:
                    dend_params["truncate_mode"] = truncate_mode
                    dend_params["p"] = p_param

                print("デンドログラム描画実行中...")

                # 実際に描画
                dend = dendrogram(**dend_params)

                print("✅ デンドログラム描画完了")

                # タイトルと軸ラベル
                ax.set_title("デンドログラム（樹形図）", fontsize=14, fontweight="bold")
                ax.set_xlabel("サンプル（またはクラスター）", fontsize=12)
                ax.set_ylabel("クラスター間距離", fontsize=12)
                ax.grid(True, linestyle=":", alpha=0.3)

                # カットラインを表示
                if len(dendrogram_data) > 0:
                    cut_height = 0.7 * np.max(dendrogram_data[:, 2])
                    ax.axhline(
                        y=cut_height,
                        color="red",
                        linestyle="--",
                        alpha=0.8,
                        linewidth=2,
                        label=f"カットライン (距離: {cut_height:.2f})",
                    )
                    ax.legend()

                # 情報ボックス
                n_clusters_in_result = results.get(
                    "n_clusters", len(np.unique(results.get("labels", [])))
                )
                info_text = (
                    f"サンプル数: {n_samples}\nクラスター数: {n_clusters_in_result}"
                )
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

            except Exception as plot_error:
                print(f"デンドログラム描画エラー: {plot_error}")
                import traceback

                print(f"描画エラー詳細:\n{traceback.format_exc()}")
                self._create_dendrogram_alternative(ax, results, df)

        except Exception as e:
            print(f"デンドログラム全体エラー: {e}")
            self._create_dendrogram_alternative(ax, results, df)

    def _create_fallback_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """フォールバック用シンプルプロット"""
        try:
            fig, ax = plt.subplots(figsize=(10, 8))
            fig.patch.set_facecolor("white")

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
                )

            ax.set_title("クラスター分析結果（簡略版）", fontsize=14, fontweight="bold")
            ax.set_xlabel("第1主成分", fontsize=12)
            ax.set_ylabel("第2主成分", fontsize=12)
            ax.legend()
            ax.grid(True, alpha=0.3)

            plt.tight_layout()
            return self.save_plot_as_base64(fig)

        except Exception as e:
            print(f"フォールバックプロットエラー: {e}")
            return ""

    def _save_cluster_coordinates(
        self, db, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """クラスター解析の座標データ保存（ClusterAnalyzerクラス内）"""
        try:
            from models import CoordinatesData
            import numpy as np

            pca_coordinates = results.get("pca_coordinates")
            labels = results.get("labels")
            sample_names = results.get("sample_names", df.index.tolist())

            print(
                f"座標データ保存開始: pca_coordinates={pca_coordinates is not None}, labels={labels is not None}"
            )
            print(f"sample_names数: {len(sample_names) if sample_names else 0}")

            if pca_coordinates is not None and labels is not None:
                print(
                    f"PCA座標形状: {np.array(pca_coordinates).shape if pca_coordinates is not None else 'None'}"
                )
                print(f"ラベル数: {len(labels) if labels else 0}")

                pca_array = np.array(pca_coordinates)
                labels_array = np.array(labels)

                for i, name in enumerate(sample_names):
                    if i < len(pca_array) and i < len(labels_array):
                        # クラスターラベルを含む観測値として保存
                        cluster_label = (
                            int(labels_array[i]) + 1 if labels_array[i] != -1 else -1
                        )

                        coord_data = CoordinatesData(
                            session_id=session_id,
                            point_name=str(name),
                            point_type="observation",
                            dimension_1=(
                                float(pca_array[i, 0])
                                if pca_array.shape[1] > 0
                                else 0.0
                            ),
                            dimension_2=(
                                float(pca_array[i, 1])
                                if pca_array.shape[1] > 1
                                else 0.0
                            ),
                        )
                        db.add(coord_data)

                        if i < 3:  # 最初の3つをログ出力
                            print(
                                f"座標データ{i+1}: name={name}, cluster={cluster_label}, "
                                f"dim1={coord_data.dimension_1:.3f}, dim2={coord_data.dimension_2:.3f}"
                            )

                print(f"座標データ保存完了: {len(sample_names)}件")

            # クラスター中心点の保存（K-meansの場合）
            if (
                results.get("method") == "kmeans"
                and results.get("cluster_centers") is not None
            ):
                cluster_centers = results.get("cluster_centers")
                print(f"クラスター中心点保存: {len(cluster_centers)}個")

                # PCA変換された中心点を計算
                if pca_coordinates is not None and cluster_centers is not None:
                    try:
                        from sklearn.decomposition import PCA

                        # 元のデータでPCAを学習
                        pca = PCA(n_components=2)
                        pca.fit(df.select_dtypes(include=[np.number]))

                        # 中心点をPCA空間に変換
                        centers_2d = pca.transform(np.array(cluster_centers))

                        for i, center_2d in enumerate(centers_2d):
                            coord_data = CoordinatesData(
                                session_id=session_id,
                                point_name=f"クラスター{i+1}中心",
                                point_type="center",
                                dimension_1=float(center_2d[0]),
                                dimension_2=float(center_2d[1]),
                            )
                            db.add(coord_data)
                            print(
                                f"中心点{i+1}: dim1={center_2d[0]:.3f}, dim2={center_2d[1]:.3f}"
                            )

                        print(f"クラスター中心点保存完了: {len(centers_2d)}件")

                    except Exception as center_error:
                        print(f"クラスター中心点PCA変換エラー: {center_error}")

        except Exception as e:
            print(f"クラスター座標データ保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")

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
                                "cluster": (
                                    int(labels[i]) + 1 if labels[i] != -1 else -1
                                ),
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
        except Exception as e:
            print(f"レスポンス作成エラー: {e}")
            raise
