from typing import Dict, Any, List, Tuple
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from sklearn.cluster import KMeans, AgglomerativeClustering
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    silhouette_score,
    calinski_harabasz_score,
    davies_bouldin_score,
)
from scipy.cluster.hierarchy import dendrogram, linkage, fcluster
from scipy.spatial.distance import pdist
import seaborn as sns
from .base import BaseAnalyzer


class ClusterAnalyzer(BaseAnalyzer):
    """クラスター分析を実行するクラス"""

    def get_analysis_type(self) -> str:
        return "cluster"

    def analyze(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """クラスター分析を実行"""
        method = kwargs.get("method", "kmeans")
        n_clusters = kwargs.get("n_clusters", 3)
        linkage_method = kwargs.get("linkage_method", "ward")
        distance_metric = kwargs.get("distance_metric", "euclidean")
        standardize = kwargs.get("standardize", True)
        max_clusters = kwargs.get("max_clusters", 10)

        return self.perform_analysis(
            df,
            method,
            n_clusters,
            linkage_method,
            distance_metric,
            standardize,
            max_clusters,
        )

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """クラスタープロットを作成"""
        return self.create_cluster_plot(
            df, results, self.get_cluster_colors(results["n_clusters"])
        )

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
        n_clusters,
        linkage_method,
        distance_metric,
        standardize,
        max_clusters,
    ):
        """完全な分析を実行"""
        try:
            print("=== クラスター分析実行開始 ===")

            # 分析実行
            results = self.perform_analysis(
                df,
                method,
                n_clusters,
                linkage_method,
                distance_metric,
                standardize,
                max_clusters,
            )

            # プロット作成
            plot_base64 = self.create_plot(results, df)
            print(f"プロット作成完了: {len(plot_base64)} 文字")

            # データベース保存
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

            # レスポンス作成
            response_data = self.create_response(
                results, df, session_id, session_name, file, plot_base64
            )

            print("=== クラスター分析実行完了 ===")
            return response_data

        except Exception as e:
            print(f"クラスター分析エラー: {e}")
            import traceback

            traceback.print_exc()
            raise

    def perform_analysis(
        self,
        df,
        method,
        n_clusters,
        linkage_method,
        distance_metric,
        standardize,
        max_clusters,
    ):
        """分析実行（評価指標計算を含む）"""
        from sklearn.cluster import KMeans, AgglomerativeClustering
        from sklearn.preprocessing import StandardScaler
        from sklearn.metrics import (
            silhouette_score,
            calinski_harabasz_score,
            davies_bouldin_score,
        )

        print(f"分析開始: method={method}, n_clusters={n_clusters}")

        # データ準備
        X = df.copy()
        if standardize:
            scaler = StandardScaler()
            X = pd.DataFrame(
                scaler.fit_transform(X), index=df.index, columns=df.columns
            )

        # クラスタリング実行
        if method == "kmeans":
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            cluster_labels = model.fit_predict(X)
            cluster_centers = model.cluster_centers_
            inertia = model.inertia_
        else:  # hierarchical
            model = AgglomerativeClustering(
                n_clusters=n_clusters, linkage=linkage_method, metric=distance_metric
            )
            cluster_labels = model.fit_predict(X)
            cluster_centers = None
            # 慣性を手動計算
            inertia = self.calculate_inertia(X, cluster_labels)

        # 評価指標計算
        silhouette = (
            silhouette_score(X, cluster_labels) if len(set(cluster_labels)) > 1 else 0.0
        )
        calinski = calinski_harabasz_score(X, cluster_labels)
        davies = davies_bouldin_score(X, cluster_labels)

        # クラスター統計計算
        cluster_stats = self.calculate_cluster_statistics(df, cluster_labels)

        print(f"評価指標 - シルエット: {silhouette:.4f}, 慣性: {inertia:.4f}")

        return {
            "method": method,
            "n_clusters": n_clusters,
            "cluster_labels": cluster_labels,
            "cluster_centers": cluster_centers,
            "inertia": inertia,
            "silhouette_score": silhouette,
            "calinski_harabasz_score": calinski,
            "davies_bouldin_score": davies,
            "cluster_statistics": cluster_stats,
        }

    def calculate_inertia(self, X, labels):
        """慣性を手動計算（階層クラスタリング用）"""
        inertia = 0
        for cluster_id in set(labels):
            cluster_points = X[labels == cluster_id]
            if len(cluster_points) > 0:
                centroid = cluster_points.mean()
                inertia += ((cluster_points - centroid) ** 2).sum().sum()
        return inertia

    def calculate_cluster_statistics(self, df, labels):
        """クラスター統計計算"""
        stats = {}

        for cluster_id in sorted(set(labels)):
            cluster_mask = labels == cluster_id
            cluster_data = df[cluster_mask]

            stats[f"クラスター {int(cluster_id) + 1}"] = {
                "size": int(cluster_mask.sum()),
                "members": [str(name) for name in df.index[cluster_mask].tolist()],
                "mean": {
                    str(k): float(v)
                    for k, v in cluster_data.mean().round(4).to_dict().items()
                },
                "std": {
                    str(k): float(v)
                    for k, v in cluster_data.std().round(4).to_dict().items()
                },
                "min": {
                    str(k): float(v)
                    for k, v in cluster_data.min().round(4).to_dict().items()
                },
                "max": {
                    str(k): float(v)
                    for k, v in cluster_data.max().round(4).to_dict().items()
                },
            }

        print(f"クラスター統計計算完了: {len(stats)} clusters")
        return stats

    def get_cluster_colors(self, n_clusters):
        """クラスター色を取得"""
        color_palette = [
            "#1f77b4",
            "#ff7f0e",
            "#2ca02c",
            "#d62728",
            "#9467bd",
            "#8c564b",
            "#e377c2",
            "#7f7f7f",
            "#bcbd22",
            "#17becf",
        ]

        cluster_colors = {}
        for i in range(n_clusters):
            cluster_colors[str(i)] = color_palette[i % len(color_palette)]

        return cluster_colors

    def create_cluster_plot(self, df, results, cluster_colors):
        """クラスタープロット画像を生成してbase64で返す"""
        import io
        import base64
        from sklearn.decomposition import PCA
        import matplotlib.pyplot as plt
        import warnings

        warnings.filterwarnings("ignore")

        try:
            print("=== プロット画像生成開始 ===")

            cluster_labels = results["cluster_labels"]
            n_clusters = results["n_clusters"]

            # 日本語フォント設定
            self.setup_japanese_font()

            # 図のサイズ設定
            fig = plt.figure(figsize=(16, 12))

            # データの次元数に応じてプロット方法を決定
            if df.shape[1] >= 2:
                # 2次元以上の場合はPCAで次元削減
                if df.shape[1] > 2:
                    pca = PCA(n_components=2, random_state=42)
                    X_reduced = pca.fit_transform(df)
                    explained_var = pca.explained_variance_ratio_
                    x_label = f"PC1 ({explained_var[0]:.1%} variance)"
                    y_label = f"PC2 ({explained_var[1]:.1%} variance)"
                else:
                    X_reduced = df.values
                    x_label = df.columns[0]
                    y_label = df.columns[1]

                # 2x2のサブプロット配置
                # 1. メインの散布図
                ax1 = plt.subplot(2, 2, 1)

                unique_clusters = sorted(set(cluster_labels))
                for cluster_id in unique_clusters:
                    mask = cluster_labels == cluster_id
                    color = cluster_colors[str(int(cluster_id))]

                    ax1.scatter(
                        X_reduced[mask, 0],
                        X_reduced[mask, 1],
                        c=color,
                        label=f"Cluster {int(cluster_id) + 1}",
                        alpha=0.7,
                        s=60,
                        edgecolors="black",
                        linewidth=0.5,
                    )

                # クラスター中心点を表示（K-meansの場合）
                if (
                    results["method"] == "kmeans"
                    and results["cluster_centers"] is not None
                ):
                    centers = results["cluster_centers"]
                    if centers.shape[1] > 2:
                        centers_reduced = pca.transform(centers)
                    else:
                        centers_reduced = centers

                    ax1.scatter(
                        centers_reduced[:, 0],
                        centers_reduced[:, 1],
                        c="red",
                        marker="x",
                        s=200,
                        linewidth=3,
                        label="Centroids",
                    )

                ax1.set_xlabel(x_label, fontsize=12)
                ax1.set_ylabel(y_label, fontsize=12)
                ax1.set_title(
                    "Cluster Analysis Results", fontsize=14, fontweight="bold"
                )
                ax1.legend(bbox_to_anchor=(1.05, 1), loc="upper left")
                ax1.grid(True, alpha=0.3)

                # 2. エルボー法プロット
                ax2 = plt.subplot(2, 2, 2)
                self.plot_elbow_method(df, ax2, n_clusters)

                # 3. シルエット分析
                ax3 = plt.subplot(2, 2, 3)
                self.plot_silhouette_analysis(
                    df, cluster_labels, ax3, results["silhouette_score"]
                )

                # 4. 評価指標まとめ
                ax4 = plt.subplot(2, 2, 4)
                self.plot_metrics_summary(results, ax4)

            else:
                # 1次元データの場合
                ax1 = plt.subplot(2, 1, 1)

                for cluster_id in sorted(set(cluster_labels)):
                    mask = cluster_labels == cluster_id
                    color = cluster_colors[str(int(cluster_id))]

                    ax1.scatter(
                        df.values[mask, 0],
                        [cluster_id] * mask.sum(),
                        c=color,
                        label=f"Cluster {int(cluster_id) + 1}",
                        alpha=0.7,
                        s=60,
                    )

                ax1.set_xlabel(df.columns[0], fontsize=12)
                ax1.set_ylabel("Cluster ID", fontsize=12)
                ax1.set_title(
                    "Cluster Analysis Results (1D)", fontsize=14, fontweight="bold"
                )
                ax1.legend()
                ax1.grid(True, alpha=0.3)

                # 評価指標表示
                ax2 = plt.subplot(2, 1, 2)
                self.plot_metrics_summary(results, ax2)

            plt.tight_layout()

            # 画像をbase64エンコード
            return self.save_plot_as_base64(fig)

        except Exception as e:
            print(f"プロット生成エラー: {e}")
            import traceback

            traceback.print_exc()
            return ""

    def plot_elbow_method(self, df, ax, current_k):
        """エルボー法のプロット"""
        from sklearn.cluster import KMeans

        try:
            max_k = min(10, len(df) - 1, current_k + 3)
            k_range = range(2, max_k + 1)
            inertias = []

            for k in k_range:
                if k <= len(df):
                    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                    kmeans.fit(df)
                    inertias.append(kmeans.inertia_)

            ax.plot(list(k_range), inertias, "bo-", linewidth=2, markersize=8)
            ax.axvline(
                x=current_k,
                color="red",
                linestyle="--",
                linewidth=2,
                label=f"Selected K={current_k}",
            )
            ax.set_xlabel("Number of Clusters (K)", fontsize=11)
            ax.set_ylabel("Inertia", fontsize=11)
            ax.set_title("Elbow Method", fontsize=12, fontweight="bold")
            ax.legend()
            ax.grid(True, alpha=0.3)

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"Elbow plot error: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_silhouette_analysis(self, df, cluster_labels, ax, silhouette_avg):
        """シルエット分析プロット"""
        from sklearn.metrics import silhouette_samples

        try:
            sample_silhouette_values = silhouette_samples(df, cluster_labels)

            y_lower = 10
            unique_clusters = sorted(set(cluster_labels))

            for cluster_id in unique_clusters:
                cluster_silhouette_values = sample_silhouette_values[
                    cluster_labels == cluster_id
                ]
                cluster_silhouette_values.sort()

                size_cluster = cluster_silhouette_values.shape[0]
                y_upper = y_lower + size_cluster

                color = plt.cm.nipy_spectral(float(cluster_id) / len(unique_clusters))
                ax.fill_betweenx(
                    np.arange(y_lower, y_upper),
                    0,
                    cluster_silhouette_values,
                    facecolor=color,
                    edgecolor=color,
                    alpha=0.7,
                )

                ax.text(-0.05, y_lower + 0.5 * size_cluster, str(int(cluster_id) + 1))
                y_lower = y_upper + 10

            ax.axvline(
                x=silhouette_avg,
                color="red",
                linestyle="--",
                label=f"Average Score: {silhouette_avg:.3f}",
            )
            ax.set_xlabel("Silhouette Coefficient", fontsize=11)
            ax.set_ylabel("Cluster Label", fontsize=11)
            ax.set_title("Silhouette Analysis", fontsize=12, fontweight="bold")
            ax.legend()

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"Silhouette plot error: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def plot_metrics_summary(self, results, ax):
        """評価指標まとめプロット"""
        try:
            metrics = {
                "Silhouette\nScore": results["silhouette_score"],
                "Calinski\nHarabasz": results["calinski_harabasz_score"]
                / 100,  # スケール調整
                "Davies\nBouldin": 1
                - results["davies_bouldin_score"],  # 反転（高い方が良く）
            }

            names = list(metrics.keys())
            values = list(metrics.values())
            colors = ["#2E86AB", "#A23B72", "#F18F01"]

            bars = ax.bar(
                names, values, color=colors, alpha=0.8, edgecolor="black", linewidth=1
            )

            # 値をバーの上に表示
            for bar, name in zip(bars, names):
                height = bar.get_height()
                if "Silhouette" in name:
                    display_val = results["silhouette_score"]
                elif "Calinski" in name:
                    display_val = results["calinski_harabasz_score"]
                else:  # Davies Bouldin
                    display_val = results["davies_bouldin_score"]

                ax.text(
                    bar.get_x() + bar.get_width() / 2.0,
                    height + 0.01,
                    f"{display_val:.3f}",
                    ha="center",
                    va="bottom",
                    fontweight="bold",
                )

            ax.set_ylabel("Score (normalized)", fontsize=11)
            ax.set_title("Evaluation Metrics", fontsize=12, fontweight="bold")
            ax.set_ylim(0, 1.2)
            ax.grid(True, alpha=0.3, axis="y")

            # 解釈ガイド
            ax.text(
                0.02,
                0.98,
                "Higher is better",
                transform=ax.transAxes,
                fontsize=9,
                va="top",
                style="italic",
            )

        except Exception as e:
            ax.text(
                0.5,
                0.5,
                f"Metrics plot error: {str(e)}",
                transform=ax.transAxes,
                ha="center",
                va="center",
            )

    def save_to_database(
        self,
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
    ):
        """データベースに保存（クラスター分析特化版）"""
        try:
            print("=== クラスター分析データベース保存開始 ===")

            # 親クラスのsave_to_databaseを呼び出し
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

            # クラスター分析特有のメタデータ保存
            self._save_cluster_metadata(db, session_id, results)

            print(
                f"=== クラスター分析データベース保存完了: session_id={session_id} ==="
            )
            return session_id

        except Exception as e:
            print(f"クラスター分析データベース保存エラー: {str(e)}")
            raise

    def _save_cluster_metadata(self, db, session_id, results):
        """クラスター分析特有のメタデータを保存"""
        from models import AnalysisMetadata

        try:
            # 評価指標メタデータ
            metrics_data = {
                "silhouette_score": float(results.get("silhouette_score", 0.0)),
                "calinski_harabasz_score": float(
                    results.get("calinski_harabasz_score", 0.0)
                ),
                "davies_bouldin_score": float(results.get("davies_bouldin_score", 0.0)),
                "inertia": float(results.get("inertia", 0.0)),
                "n_clusters": int(results.get("n_clusters", 0)),
                "method": results.get("method", "kmeans"),
            }

            metrics_metadata = AnalysisMetadata(
                session_id=session_id,
                metadata_type="cluster_metrics",
                metadata_content=metrics_data,
            )
            db.add(metrics_metadata)

            # クラスター統計情報メタデータ
            if "cluster_statistics" in results:
                stats_metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="cluster_statistics",
                    metadata_content=results["cluster_statistics"],
                )
                db.add(stats_metadata)

            db.commit()
            print(f"クラスター特有メタデータ保存完了: session_id={session_id}")

        except Exception as e:
            print(f"クラスター特有メタデータ保存エラー: {e}")
            db.rollback()

    def _save_coordinates_data(self, db, session_id, df, results):
        """クラスター分析の座標データ保存"""
        from models import CoordinatesData

        try:
            cluster_labels = results["cluster_labels"]

            print(f"=== クラスター座標データ保存開始 ===")
            print(f"クラスター割り当て: {len(cluster_labels)} 件")

            # クラスター割り当て情報を座標データとして保存
            for i, (sample_name, cluster_id) in enumerate(
                zip(df.index, cluster_labels)
            ):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(sample_name),
                    point_type="observation",  # クラスター分析では観測値として保存
                    dimension_1=float(cluster_id),  # クラスターIDを1次元目に保存
                    dimension_2=0.0,  # 2次元目は使用しない
                    dimension_3=0.0,  # 3次元目は使用しない
                )
                db.add(coord_data)

            db.commit()
            print(f"クラスター座標データ保存完了: {len(cluster_labels)} 件")

        except Exception as e:
            print(f"クラスター座標データ保存エラー: {e}")
            db.rollback()

    def create_response(self, results, df, session_id, session_name, file, plot_base64):
        """レスポンスデータを作成"""
        try:
            # クラスター割り当て情報を作成
            cluster_assignments = []
            cluster_colors = self.get_cluster_colors(results["n_clusters"])

            for i, (sample_name, cluster_id) in enumerate(
                zip(df.index, results["cluster_labels"])
            ):
                cluster_assignments.append(
                    {
                        "sample_name": str(sample_name),
                        "cluster_id": int(cluster_id),
                        "cluster_label": f"クラスター {int(cluster_id) + 1}",
                        "color": cluster_colors[str(int(cluster_id))],
                    }
                )

            # 可視化データ
            visualization_data = {
                "plot_image": plot_base64,
                "cluster_assignments": cluster_assignments,
                "cluster_colors": cluster_colors,
                "cluster_statistics": results.get("cluster_statistics", {}),
                "evaluation_metrics": {
                    "silhouette_score": float(results["silhouette_score"]),
                    "calinski_harabasz_score": float(
                        results["calinski_harabasz_score"]
                    ),
                    "davies_bouldin_score": float(results["davies_bouldin_score"]),
                    "inertia": float(results["inertia"]),
                },
            }

            response_data = {
                "status": "success",
                "success": True,
                "message": "クラスター分析が完了しました",
                "session_id": session_id,
                "session_name": session_name,
                "analysis_type": "cluster",
                "metadata": {
                    "session_name": session_name,
                    "original_filename": file.filename,
                    "analysis_type": "cluster",
                    "rows": int(df.shape[0]),
                    "columns": int(df.shape[1]),
                    "column_names": [str(col) for col in df.columns.tolist()],
                },
                "analysis_results": {
                    "method": results["method"],
                    "n_clusters": int(results["n_clusters"]),
                    "silhouette_score": float(results["silhouette_score"]),
                    "calinski_harabasz_score": float(
                        results["calinski_harabasz_score"]
                    ),
                    "davies_bouldin_score": float(results["davies_bouldin_score"]),
                    "inertia": float(results["inertia"]),
                    "cluster_statistics": self._serialize_dict(
                        results.get("cluster_statistics", {})
                    ),
                },
                "data_info": {
                    "original_filename": file.filename,
                    "rows": int(df.shape[0]),
                    "columns": int(df.shape[1]),
                    "column_names": [str(col) for col in df.columns.tolist()],
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
