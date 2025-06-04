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


# analysis/cluster.py の ClusterAnalyzer クラスの修正


class ClusterAnalyzer:
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
            # ... (既存の前処理)

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

            # 評価指標を明示的にログ出力
            print(f"=== 評価指標確認 ===")
            print(f"シルエットスコア: {results.get('silhouette_score', 'N/A')}")
            print(f"慣性: {results.get('inertia', 'N/A')}")
            print(f"Calinski-Harabasz: {results.get('calinski_harabasz_score', 'N/A')}")
            print(f"Davies-Bouldin: {results.get('davies_bouldin_score', 'N/A')}")

            # セッション保存（評価指標付き）
            session_id = self.save_session_with_metrics(
                db,
                session_name,
                description,
                tags,
                user_id,
                file.filename,
                df,
                csv_text,
                results,
                n_clusters,
            )

            # メタデータ保存
            self.save_metadata(db, session_id, results)

            # ... (残りの処理)

        except Exception as e:
            print(f"Analysis error: {e}")
            import traceback

            traceback.print_exc()
            raise

    def save_session_with_metrics(
        self,
        db,
        session_name,
        description,
        tags,
        user_id,
        filename,
        df,
        csv_text,
        results,
        n_clusters,
    ):
        """セッション保存（評価指標を明示的に設定）"""
        from models import AnalysisSession, OriginalData

        # 評価指標を取得
        silhouette_score = results.get("silhouette_score", 0.0)
        inertia = results.get("inertia", 0.0)

        print(f"=== セッション保存開始 ===")
        print(f"シルエットスコア: {silhouette_score}")
        print(f"慣性: {inertia}")
        print(f"クラスター数: {n_clusters}")

        # セッション作成
        session = AnalysisSession(
            session_name=session_name,
            description=description,
            tags=tags,
            user_id=user_id,
            original_filename=filename,
            analysis_type="cluster",
            row_count=df.shape[0],
            column_count=df.shape[1],
            # 評価指標を正しく設定
            chi2_value=float(silhouette_score),  # シルエットスコア
            degrees_of_freedom=int(n_clusters),  # クラスター数
            total_inertia=float(inertia),  # 慣性
        )

        db.add(session)
        db.commit()
        db.refresh(session)

        print(
            f"セッション作成完了: ID={session.id}, chi2_value={session.chi2_value}, "
            f"degrees_of_freedom={session.degrees_of_freedom}, total_inertia={session.total_inertia}"
        )

        # 元データ保存
        original_data = OriginalData(
            session_id=session.id,
            csv_data=csv_text,
            row_names=df.index.tolist(),
            column_names=df.columns.tolist(),
            data_matrix=df.values.tolist(),
        )
        db.add(original_data)
        db.commit()

        return session.id

    def save_metadata(self, db, session_id, results):
        """メタデータ保存"""
        from models import AnalysisMetadata

        print(f"=== メタデータ保存開始 ===")

        # 評価指標メタデータ
        metrics_data = {
            "silhouette_score": float(results.get("silhouette_score", 0.0)),
            "calinski_harabasz_score": float(
                results.get("calinski_harabasz_score", 0.0)
            ),
            "davies_bouldin_score": float(results.get("davies_bouldin_score", 0.0)),
            "inertia": float(results.get("inertia", 0.0)),
            "n_clusters": int(results.get("n_clusters", 0)),
        }

        print(f"評価指標メタデータ: {metrics_data}")

        metrics_metadata = AnalysisMetadata(
            session_id=session_id,
            metadata_type="cluster_metrics",
            metadata_content=metrics_data,
        )
        db.add(metrics_metadata)

        # クラスター統計情報メタデータ
        if "cluster_statistics" in results:
            stats_data = results["cluster_statistics"]
            print(f"クラスター統計データ: {len(stats_data)} clusters")

            stats_metadata = AnalysisMetadata(
                session_id=session_id,
                metadata_type="cluster_statistics",
                metadata_content=stats_data,
            )
            db.add(stats_metadata)
        else:
            print("クラスター統計情報が見つかりません")

        db.commit()
        print(f"メタデータ保存完了: session_id={session_id}")

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

        print(f"=== 評価指標計算完了 ===")
        print(f"シルエットスコア: {silhouette:.6f}")
        print(f"慣性: {inertia:.6f}")
        print(f"Calinski-Harabasz: {calinski:.6f}")
        print(f"Davies-Bouldin: {davies:.6f}")

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
            # その他の結果...
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

            stats[f"クラスター {cluster_id + 1}"] = {
                "size": int(cluster_mask.sum()),
                "members": df.index[cluster_mask].tolist(),
                "mean": cluster_data.mean().round(4).to_dict(),
                "std": cluster_data.std().round(4).to_dict(),
                "min": cluster_data.min().round(4).to_dict(),
                "max": cluster_data.max().round(4).to_dict(),
            }

        print(f"クラスター統計計算完了: {len(stats)} clusters")
        return stats
